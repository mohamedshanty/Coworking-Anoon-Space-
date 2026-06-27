import http from "http";
import app from "./app";
import { prisma } from "./lib/prisma";

const PORT = 5999;
const BASE_URL = `http://localhost:${PORT}/api/v1`;

async function test() {
  console.log("==================================================");
  console.log("RUNNING AUTH & MIDDLEWARE VERIFICATION TESTS");
  console.log("==================================================");

  // Start temporary server
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(PORT, resolve));
  console.log(`Test server successfully booted on port ${PORT}\n`);

  try {
    // Reset database state for admin to ensure a clean run
    await prisma.loginLog.deleteMany({ where: { username: "admin" } });
    await prisma.staff.update({
      where: { username: "admin" },
      data: { failedAttempts: 0, lockedUntil: null },
    });

    // ----------------------------------------------------
    // Test 1: Successful Login
    // ----------------------------------------------------
    console.log("1. TESTING SUCCESSFUL LOGIN");
    console.log("--------------------------------------------------");
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "password123" }),
    });

    const loginStatus = loginRes.status;
    const loginBody = await loginRes.json() as any;

    console.log(`HTTP Status: ${loginStatus}`);
    console.log("Response Body:", JSON.stringify(loginBody, null, 2));
    
    if (!loginRes.ok || !loginBody.success) {
      throw new Error("Expected login to succeed");
    }

    const adminToken = loginBody.accessToken;
    const adminRefreshToken = loginBody.refreshToken;

    // ----------------------------------------------------
    // Test 2: Failed Login (Wrong Password)
    // ----------------------------------------------------
    console.log("\n2. TESTING FAILED LOGIN & failedAttempts INCREMENT");
    console.log("--------------------------------------------------");
    
    const beforeFail = await prisma.staff.findUnique({ where: { username: "admin" } });
    console.log(`Admin failedAttempts in DB BEFORE failure: ${beforeFail?.failedAttempts}`);

    const failRes = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "wrongpassword" }),
    });

    const failStatus = failRes.status;
    const failBody = await failRes.json() as any;

    console.log(`HTTP Status: ${failStatus}`);
    console.log("Response Body:", JSON.stringify(failBody, null, 2));

    const afterFail = await prisma.staff.findUnique({ where: { username: "admin" } });
    console.log(`Admin failedAttempts in DB AFTER failure: ${afterFail?.failedAttempts}`);

    if (failRes.ok || afterFail?.failedAttempts !== 1) {
      throw new Error("Expected login to fail and increment count to 1");
    }

    // ----------------------------------------------------
    // Test 3: Account Lockout after 5 Failures
    // ----------------------------------------------------
    console.log("\n3. TESTING ACCOUNT LOCKOUT AFTER 5 FAILURES");
    console.log("--------------------------------------------------");
    
    // We currently have 1 failed attempt. Let's execute 4 more.
    console.log("Executing 4 additional failed attempts...");
    for (let i = 2; i <= 5; i++) {
      const loopRes = await fetch(`${BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "wrongpassword" }),
      });
      const userState = await prisma.staff.findUnique({ where: { username: "admin" } });
      console.log(`Attempt ${i} -> HTTP Status: ${loopRes.status}, failedAttempts in DB: ${userState?.failedAttempts}, lockedUntil: ${userState?.lockedUntil?.toISOString() || "null"}`);
    }

    const lockedUserState = await prisma.staff.findUnique({ where: { username: "admin" } });
    console.log(`\nFinal state in DB -> failedAttempts: ${lockedUserState?.failedAttempts}, lockedUntil: ${lockedUserState?.lockedUntil?.toISOString()}`);

    console.log("\nAttempting 6th login (using CORRECT password while account is locked)...");
    const lockedRes = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "password123" }),
    });

    const lockedStatus = lockedRes.status;
    const lockedBody = await lockedRes.json() as any;

    console.log(`HTTP Status: ${lockedStatus}`);
    console.log("Response Body:", JSON.stringify(lockedBody, null, 2));

    if (lockedRes.status !== 403) {
      throw new Error("Expected 403 Forbidden due to lockout");
    }

    // Reset lockout so admin can refresh tokens
    await prisma.staff.update({
      where: { username: "admin" },
      data: { failedAttempts: 0, lockedUntil: null },
    });

    // ----------------------------------------------------
    // Test 4: Token Refresh
    // ----------------------------------------------------
    console.log("\n4. TESTING TOKEN REFRESH");
    console.log("--------------------------------------------------");
    const refreshRes = await fetch(`${BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: adminRefreshToken }),
    });

    const refreshStatus = refreshRes.status;
    const refreshBody = await refreshRes.json() as any;

    console.log(`HTTP Status: ${refreshStatus}`);
    console.log("Response Body:", JSON.stringify(refreshBody, null, 2));

    if (!refreshRes.ok || !refreshBody.success) {
      throw new Error("Expected token refresh to succeed");
    }

    // ----------------------------------------------------
    // Test 5: Authorization Middleware Blocks (403)
    // ----------------------------------------------------
    console.log("\n5. TESTING AUTHORIZATION MIDDLEWARE BLOCKS");
    console.log("--------------------------------------------------");
    
    // Login as Noor (Staff role, seeded with view permissions, but no edit or delete)
    console.log("Logging in as Noor (Staff role)...");
    const noorLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "noor", password: "password123" }),
    });
    const noorLoginBody = await noorLoginRes.json() as any;
    const noorToken = noorLoginBody.accessToken;

    console.log("Sending GET request to view-protected endpoint (Authorized)...");
    const noorViewRes = await fetch(`${BASE_URL}/test-protected-view`, {
      headers: { Authorization: `Bearer ${noorToken}` },
    });
    console.log(`HTTP Status: ${noorViewRes.status}`);

    console.log("\nSending POST request to edit-protected endpoint (Unauthorized, expected 403)...");
    const noorEditRes = await fetch(`${BASE_URL}/test-protected-edit`, {
      method: "POST",
      headers: { Authorization: `Bearer ${noorToken}` },
    });
    const noorEditStatus = noorEditRes.status;
    const noorEditBody = await noorEditRes.json() as any;

    console.log(`HTTP Status: ${noorEditStatus}`);
    console.log("Response Body:", JSON.stringify(noorEditBody, null, 2));

    if (noorEditStatus !== 403) {
      throw new Error("Expected Noor's edit request to be blocked with 403");
    }

    console.log("\n==================================================");
    console.log("ALL TESTS PASSED SUCCESSFULLY!");
    console.log("==================================================");

  } finally {
    // Ensure admin attempts are reset in all cases
    await prisma.staff.update({
      where: { username: "admin" },
      data: { failedAttempts: 0, lockedUntil: null },
    });

    // Close server & disconnect DB
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.$disconnect();
    console.log("\nDisconnected database and closed server cleanly.");
  }
}

test().catch((e) => {
  console.error("Test execution failed:", e);
  process.exit(1);
});

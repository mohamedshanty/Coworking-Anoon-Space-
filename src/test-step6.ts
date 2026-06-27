import http from "http";
import app from "./app";
import { prisma } from "./lib/prisma";

const PORT = 5999;
const BASE_URL = `http://localhost:${PORT}/api/v1`;

async function test() {
  console.log("==================================================");
  console.log("RUNNING MODULE 6 (EXPENSES & DEBTS) TESTS");
  console.log("==================================================");

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(PORT, resolve));
  console.log(`Test server booted on port ${PORT}\n`);

  try {
    // Clean up old test data
    await prisma.expense.deleteMany({ where: { description: { startsWith: "اختبار" } } });
    await prisma.debt.deleteMany({ where: { note: { startsWith: "اختبار" } } });

    // Login as admin to get token
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "password123" }),
    });
    const loginData = await loginRes.json() as any;
    const token = loginData.accessToken;

    const authHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };

    // ----------------------------------------------------
    // Test 1: Create Expenses & Verify Rounding
    // ----------------------------------------------------
    console.log("1. TESTING EXPENSES CREATION & ROUNDING");
    console.log("--------------------------------------------------");
    
    const nowIso = new Date().toISOString();

    const exp1Res = await fetch(`${BASE_URL}/expenses`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        description: "اختبار كهرباء 1",
        category: "electricity",
        amount: 120.556, // Expected: 120.56
        date: nowIso,
        notes: "ملاحظة اختبار",
      }),
    });
    const exp1Body = await exp1Res.json() as any;
    console.log("Expense 1 Creation Status:", exp1Res.status);
    console.log("Expense 1 response amount:", exp1Body.data.amount);
    if (Number(exp1Body.data.amount) !== 120.56) {
      throw new Error(`Expected expense 1 amount to be 120.56, got ${exp1Body.data.amount}`);
    }

    const exp2Res = await fetch(`${BASE_URL}/expenses`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        description: "اختبار كهرباء 2",
        category: "electricity",
        amount: 80.00,
        date: nowIso,
      }),
    });
    const exp2Body = await exp2Res.json() as any;
    console.log("Expense 2 Creation Status:", exp2Res.status);
    console.log("Expense 2 response amount:", exp2Body.data.amount);
    if (Number(exp2Body.data.amount) !== 80.00) {
      throw new Error(`Expected expense 2 amount to be 80.00, got ${exp2Body.data.amount}`);
    }

    console.log("✓ Expenses created and rounded successfully in database.");

    // ----------------------------------------------------
    // Test 2: Category Aggregation & Date Filtering
    // ----------------------------------------------------
    console.log("\n2. TESTING CATEGORY AGGREGATION & DATE RANGE FILTER");
    console.log("--------------------------------------------------");
    // Query range of today
    const fromDate = new Date(Date.now() - 3600 * 1000).toISOString(); // 1 hour ago
    const toDate = new Date(Date.now() + 3600 * 1000).toISOString(); // 1 hour later

    const aggRes = await fetch(
      `${BASE_URL}/expenses/by-category?from=${fromDate}&to=${toDate}`,
      { headers: authHeaders }
    );
    const aggBody = await aggRes.json() as any;
    console.log("Aggregation Query HTTP Status:", aggRes.status);
    console.log("Aggregation Response Body:", JSON.stringify(aggBody, null, 2));

    const electricityTotal = aggBody.data.find((c: any) => c.category === "electricity");
    console.log("Electricity computed total (expected 200.56):", electricityTotal?.total);
    if (Number(electricityTotal?.total) !== 200.56) {
      throw new Error(`Expected electricity total to be 200.56, got ${electricityTotal?.total}`);
    }

    // Verify rounding checks on totals (no trailing decimals)
    for (const cat of aggBody.data) {
      const decStr = cat.total.toString().split(".")[1] || "";
      if (decStr.length > 2) {
        throw new Error(`Expected at most 2 decimal places in total category aggregation, got ${decStr.length} on ${cat.category}`);
      }
    }
    console.log("✓ Category aggregation date filtering and clean rounding verified.");

    // ----------------------------------------------------
    // Test 3: Create Manual Debt
    // ----------------------------------------------------
    console.log("\n3. TESTING MANUAL DEBT CREATION & ROUNDING");
    console.log("--------------------------------------------------");
    const debtRes = await fetch(`${BASE_URL}/debts`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        name: "مدين تجربة",
        phone: "0599111222",
        amount: 45.334, // Expected: 45.33
        type: "manual",
        createdAt: nowIso,
        note: "اختبار مديونية",
      }),
    });
    const debtBody = await debtRes.json() as any;
    console.log("Debt Creation Status:", debtRes.status);
    console.log("Debt response amount:", debtBody.data.amount);
    
    if (debtRes.status !== 201) throw new Error("Failed to create debt");
    if (Number(debtBody.data.amount) !== 45.33) {
      throw new Error(`Expected debt amount to be 45.33, got ${debtBody.data.amount}`);
    }
    const debtId = debtBody.data.id;
    console.log("✓ Debt record created and rounded successfully in database.");

    // ----------------------------------------------------
    // Test 4: Debt Collection
    // ----------------------------------------------------
    console.log("\n4. TESTING DEBT COLLECTION & TIMESTAMPS");
    console.log("--------------------------------------------------");
    const collectRes = await fetch(`${BASE_URL}/debts/${debtId}/collect`, {
      method: "POST",
      headers: authHeaders,
    });
    const collectBody = await collectRes.json() as any;
    console.log("Collect Debt HTTP Status:", collectRes.status);
    console.log("Collected Debt response:", JSON.stringify(collectBody.data, null, 2));

    if (collectRes.status !== 200 || collectBody.data.status !== "collected" || !collectBody.data.collectedAt) {
      throw new Error("Failed to collect debt or update status");
    }

    // Verify in database directly
    const debtInDb = await prisma.debt.findUnique({ where: { id: debtId } });
    console.log("Database checked -> status:", debtInDb?.status, ", collectedAt:", debtInDb?.collectedAt?.toISOString());
    if (debtInDb?.status !== "collected" || !debtInDb?.collectedAt) {
      throw new Error("Database state verification failed for collected debt");
    }
    console.log("✓ Debt collection status, status, and collectedAt timestamp verified.");

    // ----------------------------------------------------
    // Test 5: Authorization Blocks (PageKey checking)
    // ----------------------------------------------------
    console.log("\n5. TESTING AUTHORIZATION BLOCKS ON NEW ROUTE GROUPS");
    console.log("--------------------------------------------------");
    // Login as Noor (Staff role - has view perms on most pages but NO delete perms)
    const noorLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "noor", password: "password123" }),
    });
    const noorLoginBody = await noorLoginRes.json() as any;
    const noorToken = noorLoginBody.accessToken;

    console.log("Sending DELETE request to expenses endpoint as Noor (Expected: 403)...");
    const noorDelRes = await fetch(`${BASE_URL}/expenses/${exp1Body.data.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${noorToken}`,
      },
    });
    console.log(`HTTP Status: ${noorDelRes.status}`);
    const noorDelBody = await noorDelRes.json() as any;
    console.log("Response Body:", JSON.stringify(noorDelBody, null, 2));

    if (noorDelRes.status !== 403) {
      throw new Error("Expected Noor's delete request to be blocked with 403");
    }
    console.log("✓ Authorization block verified successfully.");

    // Cleanup
    await prisma.expense.deleteMany({ where: { description: { startsWith: "اختبار" } } });
    await prisma.debt.delete({ where: { id: debtId } });

    console.log("\n==================================================");
    console.log("ALL STEP 6 VERIFICATIONS COMPLETED SUCCESSFULLY!");
    console.log("==================================================");

  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.$disconnect();
    console.log("Test server stopped and database disconnected.");
  }
}

test().catch((e) => {
  console.error("Test execution failed:", e);
  process.exit(1);
});

import http from "http";
import app from "./app";
import { prisma } from "./lib/prisma";

const PORT = 5997;
const BASE_URL = `http://localhost:${PORT}/api/v1`;

const PFX = "fu_test_";
const day = 86_400_000;

async function seedTestData() {
  // A: last session 20 days ago -> should appear
  const vA = await prisma.visitor.create({
    data: { id: `${PFX}vA`, name: "TestVisitorA", phone: "0599900101", type: "visitor", lastVisit: new Date(Date.now() - 20 * day) },
  });
  await prisma.session.create({
    data: { id: `${PFX}sA`, visitorId: vA.id, checkIn: new Date(Date.now() - 20 * day), amount: 0, paymentStatus: "paid" },
  });

  // B: last session 5 days ago -> should NOT appear
  const vB = await prisma.visitor.create({
    data: { id: `${PFX}vB`, name: "TestVisitorB", phone: "0599900102", type: "visitor", lastVisit: new Date(Date.now() - 5 * day) },
  });
  await prisma.session.create({
    data: { id: `${PFX}sB`, visitorId: vB.id, checkIn: new Date(Date.now() - 5 * day), amount: 0, paymentStatus: "paid" },
  });

  // C: last session 20 days ago, will be marked contacted
  const vC = await prisma.visitor.create({
    data: { id: `${PFX}vC`, name: "TestVisitorC", phone: "0599900103", type: "visitor", lastVisit: new Date(Date.now() - 20 * day) },
  });
  await prisma.session.create({
    data: { id: `${PFX}sC`, visitorId: vC.id, checkIn: new Date(Date.now() - 20 * day), amount: 0, paymentStatus: "paid" },
  });

  // D: opted out, 30 days ago
  const vD = await prisma.visitor.create({
    data: { id: `${PFX}vD`, name: "TestVisitorD", phone: "0599900104", type: "visitor", lastVisit: new Date(Date.now() - 30 * day), followUpStatus: "opt_out" },
  });
  await prisma.session.create({
    data: { id: `${PFX}sD`, visitorId: vD.id, checkIn: new Date(Date.now() - 30 * day), amount: 0, paymentStatus: "paid" },
  });

  // E: no sessions at all -> should appear
  await prisma.visitor.create({
    data: { id: `${PFX}vE`, name: "TestVisitorE", phone: "0599900105", type: "visitor" },
  });

  return { vA, vB, vC, vD };
}

async function cleanupTestData() {
  await prisma.session.deleteMany({ where: { id: { startsWith: PFX } } });
  await prisma.visitor.deleteMany({ where: { id: { startsWith: PFX } } });
}

async function test() {
  const lines: string[] = [];
  const log = (msg: string) => { lines.push(msg); };

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(PORT, resolve));

  try {
    await cleanupTestData();
    const { vA, vB, vC, vD } = await seedTestData();

    // Login as admin
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "password123" }),
    });
    const loginData = (await loginRes.json()) as any;
    const token = loginData.accessToken;
    const H = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

    let passed = 0;
    let failed = 0;

    // TEST 1: Old session visitor appears
    log("TEST 1: Visitor with old session (>14d) appears in default list");
    const list1 = await fetch(`${BASE_URL}/follow-up`, { headers: H });
    const body1 = (await list1.json()) as any;
    const foundA = body1.data.find((v: any) => v.id === vA.id);
    if (foundA) { passed++; log("  PASS: Found old-session visitor in list"); }
    else { failed++; log("  FAIL: Old-session visitor NOT found"); }

    // TEST 2: Recent session visitor excluded
    log("TEST 2: Visitor with recent session (<14d) excluded");
    const foundB = body1.data.find((v: any) => v.id === vB.id);
    if (!foundB) { passed++; log("  PASS: Recent-session visitor excluded"); }
    else { failed++; log("  FAIL: Recent-session visitor found (should be excluded)"); }

    // TEST 3: No-session visitor appears
    log("TEST 3: Visitor with no sessions appears");
    const foundE = body1.data.find((v: any) => v.id === `${PFX}vE`);
    if (foundE) { passed++; log("  PASS: No-session visitor found"); }
    else { failed++; log("  FAIL: No-session visitor NOT found"); }

    // TEST 4: Mark contacted -> disappears
    log("TEST 4: Mark visitor as contacted -> disappears from list");
    const contactRes = await fetch(`${BASE_URL}/follow-up/${vC.id}/contacted`, { method: "POST", headers: H });
    const contactBody = (await contactRes.json()) as any;
    if (contactRes.status !== 200 || contactBody.data.followUpStatus !== "contacted") {
      failed++; log("  FAIL: POST contacted failed (status=" + contactRes.status + ")");
    } else {
      const list2 = await fetch(`${BASE_URL}/follow-up`, { headers: H });
      const body2 = (await list2.json()) as any;
      const foundC = body2.data.find((v: any) => v.id === vC.id);
      if (!foundC) { passed++; log("  PASS: Contacted visitor excluded from list"); }
      else { failed++; log("  FAIL: Contacted visitor still in list"); }
    }

    // TEST 5: Opted-out never appears (even showAll=true)
    log("TEST 5: Opted-out visitor excluded even with showAll=true");
    const showAllRes = await fetch(`${BASE_URL}/follow-up?showAll=true`, { headers: H });
    const showAllBody = (await showAllRes.json()) as any;
    const foundD = showAllBody.data.find((v: any) => v.id === vD.id);
    if (!foundD) { passed++; log("  PASS: Opted-out visitor excluded from showAll"); }
    else { failed++; log("  FAIL: Opted-out visitor found in showAll"); }

    // TEST 6: showAll=true includes recently-active visitors
    log("TEST 6: showAll=true includes recently-active visitors");
    const foundBAll = showAllBody.data.find((v: any) => v.id === vB.id);
    if (foundBAll) { passed++; log("  PASS: Recent visitor found in showAll list"); }
    else { failed++; log("  FAIL: Recent visitor NOT in showAll list"); }

    // TEST 7: Authorization block (Noor has canView=true, canEdit=false on pageKey)
    log("TEST 7: Authorization block - Noor cannot edit follow-up (expect 403)");
    const noorLogin = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "noor", password: "password123" }),
    });
    const noorData = (await noorLogin.json()) as any;
    const noorH = { "Content-Type": "application/json", Authorization: `Bearer ${noorData.accessToken}` };
    const noorRes = await fetch(`${BASE_URL}/follow-up/${vA.id}/contacted`, { method: "POST", headers: noorH });
    if (noorRes.status === 403) { passed++; log("  PASS: Noor blocked with 403 (status=" + noorRes.status + ")"); }
    else { failed++; log("  FAIL: Expected 403, got " + noorRes.status); }

    // Summary
    log("");
    log("========================================");
    log("RESULTS: " + passed + " passed, " + failed + " failed, " + (passed + failed) + " total");
    log("========================================");
    if (failed === 0) log("ALL STEP 8 VERIFICATIONS COMPLETED SUCCESSFULLY!");
    else log("SOME TESTS FAILED!");

    // Print all at once
    console.log(lines.join("\n"));

    // Cleanup
    await cleanupTestData();

    if (failed > 0) process.exit(1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve));
    await prisma.$disconnect();
  }
}

test().catch((e) => {
  console.error("Test execution failed:", e);
  process.exit(1);
});

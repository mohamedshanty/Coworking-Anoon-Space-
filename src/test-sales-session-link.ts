import http from "http";
import { randomUUID } from "crypto";
import app from "./app";
import { prisma } from "./lib/prisma";

const PORT = 5994;
const BASE_URL = `http://localhost:${PORT}/api/v1`;

async function test() {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(PORT, resolve));

  let passed = 0;
  let failed = 0;
  function check(name: string, condition: boolean, detail: string) {
    if (condition) { passed++; console.log("  PASS: " + name + " - " + detail); }
    else { failed++; console.log("  FAIL: " + name + " - " + detail); }
  }

  const cleanupIds: string[] = [];
  const cleanupVisitorIds: string[] = [];
  const createdSaleIds: string[] = [];

  try {
    // Login as admin
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "password123" }),
    });
    const loginData = (await loginRes.json()) as any;
    const token = loginData.accessToken;
    const H = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

    // ─── Seed test data ────────────────────────────────────────────
    // Visitor for active session (use UUID so it doesn't clash with seed visitors)
    const visitorId = randomUUID();
    cleanupVisitorIds.push(visitorId);
    const visitor = await prisma.visitor.create({
      data: { id: visitorId, name: "زائر اختبار ربط", phone: "0599991100", type: "visitor" },
    });

    // Active session (not checked out) — let Prisma generate UUID
    const activeSession = await prisma.session.create({
      data: {
        visitorId: visitor.id,
        checkIn: new Date(),
        checkOut: null,
        amount: 0,
        paymentStatus: "full_debt",
      },
    });
    cleanupIds.push(activeSession.id);

    // Checked-out session (expired)
    const expiredSession = await prisma.session.create({
      data: {
        visitorId: visitor.id,
        checkIn: new Date(Date.now() - 3_600_000),
        checkOut: new Date(),
        amount: 10,
        paymentStatus: "paid",
        paymentMethod: "cash",
      },
    });
    cleanupIds.push(expiredSession.id);

    // Get a known inventory item for sale
    const item = await prisma.inventoryItem.findUnique({ where: { id: "i1" } });
    if (!item) throw new Error("Seed inventory item i1 not found");
    const itemQtyBefore = item.quantity;

    // ================================================================
    // TEST 1: Sale with valid active sessionId → persists sessionId + linkedName
    // ================================================================
    console.log("TEST 1: Sale with valid active sessionId");

    const sale1Res = await fetch(`${BASE_URL}/sales`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({
        itemId: "i1",
        quantity: 1,
        paymentMethod: "cash",
        sessionId: activeSession.id,
      }),
    });
    const sale1Body = (await sale1Res.json()) as any;
    check("POST /sales with sessionId returns 201", sale1Res.status === 201, "status=" + sale1Res.status);
    check("response has success true", sale1Body.success === true, "success=" + sale1Body.success);

    const sale1 = sale1Body.data;
    createdSaleIds.push(sale1.id);
    check("sale.sessionId matches active session", sale1.sessionId === activeSession.id,
      "got=" + sale1.sessionId + " expected=" + activeSession.id);
    check("sale.linkedName is visitor name", sale1.linkedName === visitor.name,
      "got=" + sale1.linkedName + " expected=" + visitor.name);
    check("sale.itemId is i1", sale1.itemId === "i1", "got=" + sale1.itemId);
    check("sale.quantity is 1", sale1.quantity === 1, "got=" + sale1.quantity);
    check("sale.isHotDrink is false", sale1.isHotDrink === false, "got=" + sale1.isHotDrink);

    // Verify via GET that the data is persisted correctly
    const getSalesRes = await fetch(`${BASE_URL}/sales`, { headers: H });
    const getSalesBody = (await getSalesRes.json()) as any;
    const foundSale = getSalesBody.data.find((s: any) => s.id === sale1.id);
    check("GET /sales returns the linked sale", !!foundSale, "found=" + !!foundSale);
    check("GET confirms sessionId persisted", foundSale?.sessionId === activeSession.id,
      "got=" + foundSale?.sessionId);
    check("GET confirms linkedName persisted", foundSale?.linkedName === visitor.name,
      "got=" + foundSale?.linkedName);

    // Verify inventory was decremented
    const itemAfter1 = await prisma.inventoryItem.findUnique({ where: { id: "i1" } });
    check("inventory decremented by 1", itemAfter1!.quantity === itemQtyBefore - 1,
      "before=" + itemQtyBefore + " after=" + itemAfter1!.quantity);

    // ================================================================
    // TEST 2: Sale with non-existent sessionId → rejected with 404
    // ================================================================
    console.log("\nTEST 2: Sale with non-existent sessionId");

    const fakeUuid = "00000000-0000-0000-0000-000000000000";
    const sale2Res = await fetch(`${BASE_URL}/sales`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({
        itemId: "i1",
        quantity: 1,
        paymentMethod: "card",
        sessionId: fakeUuid,
      }),
    });
    check("POST /sales with fake sessionId returns 404", sale2Res.status === 404,
      "status=" + sale2Res.status);
    const sale2Body = (await sale2Res.json()) as any;
    check("error message mentions session not found",
      sale2Body.message?.toLowerCase().includes("session") || sale2Body.message?.toLowerCase().includes("not found"),
      "message=" + sale2Body.message);

    // ================================================================
    // TEST 3: Sale with checked-out (expired) sessionId → rejected with 400
    // ================================================================
    console.log("\nTEST 3: Sale with checked-out (expired) sessionId");

    const sale3Res = await fetch(`${BASE_URL}/sales`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({
        itemId: "i1",
        quantity: 1,
        paymentMethod: "transfer",
        sessionId: expiredSession.id,
      }),
    });
    check("POST /sales with expired sessionId returns 400", sale3Res.status === 400,
      "status=" + sale3Res.status);
    const sale3Body = (await sale3Res.json()) as any;
    check("error message mentions session inactive/checked out",
      sale3Body.message?.toLowerCase().includes("active") || sale3Body.message?.toLowerCase().includes("checked out"),
      "message=" + sale3Body.message);

    // ================================================================
    // TEST 4: Sale with invalid UUID format → rejected with 400
    // ================================================================
    console.log("\nTEST 4: Sale with invalid UUID format");

    const sale4Res = await fetch(`${BASE_URL}/sales`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({
        itemId: "i1",
        quantity: 1,
        paymentMethod: "cash",
        sessionId: "not-a-uuid",
      }),
    });
    check("POST /sales with invalid UUID returns 400", sale4Res.status === 400,
      "status=" + sale4Res.status);
    const sale4Body = (await sale4Res.json()) as any;
    check("validation error for sessionId",
      sale4Body.message?.toLowerCase().includes("validation") || sale4Body.errors?.some((e: any) => e.field?.includes("sessionId")),
      "body=" + JSON.stringify(sale4Body));

    // ================================================================
    // TEST 5: Sale with no sessionId → direct sale, no linking
    // ================================================================
    console.log("\nTEST 5: Sale with no sessionId (direct sale)");

    const itemQtyBefore5 = (await prisma.inventoryItem.findUnique({ where: { id: "i1" } }))!.quantity;
    const sale5Res = await fetch(`${BASE_URL}/sales`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({
        itemId: "i1",
        quantity: 2,
        paymentMethod: "cash",
      }),
    });
    const sale5Body = (await sale5Res.json()) as any;
    check("POST /sales without sessionId returns 201", sale5Res.status === 201, "status=" + sale5Res.status);

    const sale5 = sale5Body.data;
    createdSaleIds.push(sale5.id);
    check("sale5.sessionId is null", sale5.sessionId === null, "got=" + sale5.sessionId);
    check("sale5.linkedName is null", sale5.linkedName === null, "got=" + sale5.linkedName);
    check("sale5.quantity is 2", sale5.quantity === 2, "got=" + sale5.quantity);

    // Verify inventory decremented by 2
    const itemAfter5 = await prisma.inventoryItem.findUnique({ where: { id: "i1" } });
    check("inventory decremented by 2", itemAfter5!.quantity === itemQtyBefore5 - 2,
      "before=" + itemQtyBefore5 + " after=" + itemAfter5!.quantity);

    // ================================================================
    // TEST 6: Verify total count of created sales
    // ================================================================
    console.log("\nTEST 6: Verify sale count");

    const allSalesRes = await fetch(`${BASE_URL}/sales`, { headers: H });
    const allSalesBody = (await allSalesRes.json()) as any;
    const testSales = allSalesBody.data.filter((s: any) => createdSaleIds.includes(s.id));
    check("exactly 2 sales created (valid + direct)", testSales.length === 2,
      "count=" + testSales.length);
    check("1 sale has sessionId linked", testSales.filter((s: any) => s.sessionId !== null).length === 1,
      "linked=" + testSales.filter((s: any) => s.sessionId !== null).length);
    check("1 sale has no sessionId", testSales.filter((s: any) => s.sessionId === null).length === 1,
      "direct=" + testSales.filter((s: any) => s.sessionId === null).length);

    // ================================================================
    // SUMMARY
    // ================================================================
    console.log("\n========================================");
    console.log("RESULTS: " + passed + " passed, " + failed + " failed, " + (passed + failed) + " total");
    console.log("========================================");
    if (failed === 0) console.log("ALL SALES SESSION-LINK TESTS PASSED!");
    else console.log("SOME TESTS FAILED!");

    if (failed > 0) process.exit(1);
  } finally {
    // Cleanup by known IDs
    if (createdSaleIds.length > 0) {
      await prisma.sale.deleteMany({ where: { id: { in: createdSaleIds } } });
    }
    if (cleanupIds.length > 0) {
      await prisma.session.deleteMany({ where: { id: { in: cleanupIds } } });
    }
    if (cleanupVisitorIds.length > 0) {
      await prisma.visitor.deleteMany({ where: { id: { in: cleanupVisitorIds } } });
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.$disconnect();
  }
}

setTimeout(() => {
  console.error("\nFATAL: Test timed out after 60 seconds");
  process.exit(2);
}, 60_000).unref();

test().catch((e) => {
  console.error("Test execution failed:", e);
  process.exit(1);
});

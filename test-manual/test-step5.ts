import http from "http";
import app from "./app";
import { prisma } from "./lib/prisma";

const PORT = 5999;
const BASE_URL = `http://localhost:${PORT}/api/v1`;

async function test() {
  console.log("==================================================");
  console.log("RUNNING MODULE 5 (SUBSCRIBERS, INVENTORY, SALES) TESTS");
  console.log("==================================================");

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(PORT, resolve));
  console.log(`Test server booted on port ${PORT}\n`);

  try {
    // Clean up test data
    await prisma.subscription.deleteMany({ where: { visitor: { phone: "0599888777" } } });
    await prisma.visitor.deleteMany({ where: { phone: "0599888777" } });
    await prisma.sale.deleteMany({ where: { itemId: { in: ["test-item", "hot-قهوة"] } } });
    await prisma.inventoryItem.deleteMany({ where: { name: "علكة تجربة" } });

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
    // Test 1: Subscriber Creation
    // ----------------------------------------------------
    console.log("1. TESTING SUBSCRIBER CREATION");
    console.log("--------------------------------------------------");
    const createSubRes = await fetch(`${BASE_URL}/subscribers`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        name: "مشترك تجربة",
        phone: "0599888777",
        packageType: "monthly",
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        dailyQuotaHours: 6,
        amountPaid: 350.556, // Test rounding on amountPaid
      }),
    });

    const createSubStatus = createSubRes.status;
    const createSubBody = await createSubRes.json() as any;

    console.log(`HTTP Status: ${createSubStatus}`);
    console.log("Response Body:", JSON.stringify(createSubBody, null, 2));

    if (createSubStatus !== 201) throw new Error("Failed to create subscriber");
    
    const visitorId = createSubBody.data.visitor.id;
    const sub1Id = createSubBody.data.subscription.id;
    
    // Verify visitor type and amount rounding in DB
    const subDb = await prisma.subscription.findUnique({ where: { id: sub1Id } });
    console.log("DB Subscription amountPaid (expected 350.56):", subDb?.amountPaid.toString());
    if (Number(subDb?.amountPaid) !== 350.56) {
      throw new Error(`Expected amountPaid to be 350.56, got ${subDb?.amountPaid}`);
    }
    console.log("✓ Subscriber created and amountPaid rounded successfully.");

    // ----------------------------------------------------
    // Test 2: Pause Subscription
    // ----------------------------------------------------
    console.log("\n2. TESTING SUBSCRIPTION PAUSE");
    console.log("--------------------------------------------------");
    const pauseRes = await fetch(`${BASE_URL}/subscribers/${visitorId}/pause`, {
      method: "PATCH",
      headers: authHeaders,
    });
    
    const pauseStatus = pauseRes.status;
    const pauseBody = await pauseRes.json() as any;

    console.log(`HTTP Status: ${pauseStatus}`);
    console.log("Response Body:", JSON.stringify(pauseBody, null, 2));

    if (pauseStatus !== 200 || pauseBody.data.status !== "paused") {
      throw new Error("Failed to pause subscription");
    }
    console.log("✓ Subscription paused successfully.");

    // ----------------------------------------------------
    // Test 3: Subscription Renewal & Expiry Check
    // ----------------------------------------------------
    console.log("\n3. TESTING SUBSCRIPTION RENEWAL & EXPIRY OF PREVIOUS ACTIVE/PAUSED SUB");
    console.log("--------------------------------------------------");
    const renewRes = await fetch(`${BASE_URL}/subscribers/${visitorId}/renew`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        packageType: "weekly",
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        dailyQuotaHours: 4,
        amountPaid: 100.0,
      }),
    });

    const renewStatus = renewRes.status;
    const renewBody = await renewRes.json() as any;

    console.log(`HTTP Status: ${renewStatus}`);
    console.log("Response Body:", JSON.stringify(renewBody, null, 2));

    if (renewStatus !== 200) throw new Error("Failed to renew subscription");

    // Check DB for previous subscription status (must be expired)
    const prevSub = await prisma.subscription.findUnique({ where: { id: sub1Id } });
    console.log("Previous subscription status in DB (expected 'expired'):", prevSub?.status);
    if (prevSub?.status !== "expired") {
      throw new Error(`Expected previous subscription status to be 'expired', got '${prevSub?.status}'`);
    }
    console.log("✓ Subscription renewed and previous subscription expired successfully.");

    // ----------------------------------------------------
    // Test 4: Inventory CRUD & Restock
    // ----------------------------------------------------
    console.log("\n4. TESTING INVENTORY CRUD & RESTOCK");
    console.log("--------------------------------------------------");
    
    // Create item
    const invCreateRes = await fetch(`${BASE_URL}/inventory`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        name: "علكة تجربة",
        quantity: 10,
        sellPrice: 1.555, // Test rounding
        costPrice: 0.888, // Test rounding
        alertThreshold: 5,
      }),
    });
    const invCreateBody = await invCreateRes.json() as any;
    const itemId = invCreateBody.data.id;
    console.log("Created Inventory Item:", JSON.stringify(invCreateBody.data, null, 2));
    if (Number(invCreateBody.data.sellPrice) !== 1.56 || Number(invCreateBody.data.costPrice) !== 0.89) {
      throw new Error(`Expected rounded prices 1.56 and 0.89, got ${invCreateBody.data.sellPrice} and ${invCreateBody.data.costPrice}`);
    }

    // Restock item
    const restockRes = await fetch(`${BASE_URL}/inventory/${itemId}/restock`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ quantity: 15 }), // Total should be 10 + 15 = 25
    });
    const restockBody = await restockRes.json() as any;
    console.log("Restocked Item quantity (expected 25):", restockBody.data.quantity);
    if (restockBody.data.quantity !== 25) {
      throw new Error(`Expected quantity 25, got ${restockBody.data.quantity}`);
    }
    console.log("✓ Inventory CRUD & Restock successfully verified.");

    // ----------------------------------------------------
    // Test 5: Snack Direct Sale (Stock Decrement & Sale logging)
    // ----------------------------------------------------
    console.log("\n5. TESTING SNACK DIRECT SALE & STOCK DECREMENT");
    console.log("--------------------------------------------------");
    const saleRes = await fetch(`${BASE_URL}/sales`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        itemId,
        quantity: 5, // 25 - 5 = 20 remaining
        paymentMethod: "cash",
      }),
    });
    const saleBody = await saleRes.json() as any;
    console.log("Direct Sale Status:", saleRes.status);
    console.log("Direct Sale Response:", JSON.stringify(saleBody, null, 2));

    if (saleRes.status !== 201 || Number(saleBody.data.total) !== 7.8) { // 5 * 1.56 = 7.80
      throw new Error(`Expected direct sale total to be 7.80, got ${saleBody.data.total}`);
    }

    const itemAfterSale = await prisma.inventoryItem.findUnique({ where: { id: itemId } });
    console.log(`Inventory quantity after sale (expected 20): ${itemAfterSale?.quantity}`);
    if (itemAfterSale?.quantity !== 20) {
      throw new Error(`Expected remaining stock to be 20, got ${itemAfterSale?.quantity}`);
    }
    console.log("✓ Snack direct sale and stock decrement verified.");

    // ----------------------------------------------------
    // Test 6: Hot Drink Direct Sale
    // ----------------------------------------------------
    console.log("\n6. TESTING HOT DRINK DIRECT SALE");
    console.log("--------------------------------------------------");
    const drinkRes = await fetch(`${BASE_URL}/hot-drinks`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        itemName: "قهوة", // Seeded price = 6
        paymentMethod: "card",
      }),
    });
    const drinkBody = await drinkRes.json() as any;
    console.log("Drink Direct Sale Status:", drinkRes.status);
    console.log("Drink Direct Sale Response:", JSON.stringify(drinkBody, null, 2));

    if (drinkRes.status !== 201 || Number(drinkBody.data.total) !== 6.00) {
      throw new Error(`Expected drink sale total to be 6.00, got ${drinkBody.data.total}`);
    }
    console.log("✓ Hot drink direct sale verified.");

    // ----------------------------------------------------
    // Test 7: Money Rounding on Logs Queries
    // ----------------------------------------------------
    console.log("\n7. TESTING MONEY ROUNDING ON LOGS QUERIES");
    console.log("--------------------------------------------------");
    // Fetch snack sales logs
    const snackSalesRes = await fetch(`${BASE_URL}/sales`, { headers: authHeaders });
    const snackSalesData = await snackSalesRes.json() as any;
    
    // Check that every total returned is a clean number with at most 2 decimal places
    for (const sale of snackSalesData.data) {
      const decStr = sale.total.toString().split(".")[1] || "";
      if (decStr.length > 2) {
        throw new Error(`Decimal places count violation on snack sales: ${sale.total}`);
      }
    }

    // Fetch hot drink sales logs
    const drinkSalesRes = await fetch(`${BASE_URL}/hot-drinks`, { headers: authHeaders });
    const drinkSalesData = await drinkSalesRes.json() as any;
    
    for (const sale of drinkSalesData.data) {
      const decStr = sale.total.toString().split(".")[1] || "";
      if (decStr.length > 2) {
        throw new Error(`Decimal places count violation on hot drink sales: ${sale.total}`);
      }
    }

    console.log("✓ Checked all snack sales and hot drinks sales. No floating-point precision leaks found.");

    // Clean up created item
    await prisma.inventoryItem.delete({ where: { id: itemId } });

    console.log("\n==================================================");
    console.log("ALL STEP 5 VERIFICATIONS COMPLETED SUCCESSFULLY!");
    console.log("==================================================");

  } finally {
    // Stop server and clean up DB connections
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.$disconnect();
    console.log("Test server stopped and database disconnected.");
  }
}

test().catch((e) => {
  console.error("Test execution failed:", e);
  process.exit(1);
});

import http from "http";
import { Server } from "socket.io";
import { io as Client } from "socket.io-client";
import app from "./app";
import { prisma } from "./lib/prisma";

const PORT = 5999;
const BASE_URL = `http://localhost:${PORT}/api/v1`;

async function test() {
  console.log("==================================================");
  console.log("RUNNING SESSIONS & LIVE MODULE VERIFICATION TESTS");
  console.log("==================================================");

  // Set up temporary Server + Socket.io
  const server = http.createServer(app);
  const ioServer = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  ioServer.on("connection", (socket) => {
    // console.log("Socket client connected to server test instance");
  });

  app.set("io", ioServer);

  await new Promise<void>((resolve) => server.listen(PORT, resolve));
  console.log(`Test server booted on port ${PORT}`);

  // Connect client socket
  const socketClient = Client(`http://localhost:${PORT}`);
  await new Promise<void>((resolve) => {
    socketClient.on("connect", () => {
      console.log("Socket.io client connected successfully.");
      resolve();
    });
  });

  try {
    // Clean up past sessions/visitors/debts for clean run
    await prisma.snackOrder.deleteMany({});
    await prisma.sale.deleteMany({});
    await prisma.debt.deleteMany({});
    await prisma.session.deleteMany({});
    await prisma.visitor.deleteMany({ where: { phone: "0599112233" } });

    // Login to get token
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
    // Test 1: Check-in & Socket.io broadcast
    // ----------------------------------------------------
    console.log("\n1. TESTING CHECK-IN & SOCKET.IO BROADCAST");
    console.log("--------------------------------------------------");

    const socketCheckedInPromise = new Promise<any>((resolve) => {
      socketClient.once("session:checked_in", (data) => {
        console.log("✓ Socket.io client received session:checked_in event!");
        resolve(data);
      });
    });

    const checkInRes = await fetch(`${BASE_URL}/sessions`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        name: "جلسة تجربة",
        phone: "0599112233",
        type: "visitor",
      }),
    });

    const checkInData = await checkInRes.json() as any;
    console.log("Check-in HTTP Status:", checkInRes.status);
    if (checkInRes.status !== 201) {
      throw new Error(`Expected 210, got ${checkInRes.status}. Body: ${JSON.stringify(checkInData)}`);
    }

    const session1Id = checkInData.data.id;
    const visitor1Id = checkInData.data.visitorId;
    console.log(`✓ Checked in new visitor session ID: ${session1Id}`);

    const socketData = await socketCheckedInPromise;
    if (socketData.id !== session1Id) {
      throw new Error("Socket data session ID mismatch");
    }

    // ----------------------------------------------------
    // Test 2: Hourly Visitor pricing
    // ----------------------------------------------------
    console.log("\n2. TESTING HOURLY VISITOR PRICE (Expected: 25.00 for 2.5 hours)");
    console.log("--------------------------------------------------");
    // Backdate checkIn by 2.5 hours
    const backdateHourly = new Date(Date.now() - 2.5 * 60 * 60 * 1000);
    await prisma.session.update({
      where: { id: session1Id },
      data: { checkIn: backdateHourly },
    });

    const liveRes1 = await fetch(`${BASE_URL}/sessions/live`, { headers: authHeaders });
    const liveData1 = await liveRes1.json() as any;
    const liveSession1 = liveData1.data.find((s: any) => s.id === session1Id);

    console.log("Session 1 Hours:", liveSession1.hours);
    console.log("Session 1 Amount computed:", liveSession1.amount);

    const decimalStr = liveSession1.amount.toString().split(".")[1] || "";
    if (decimalStr.length > 2) {
      throw new Error(`Expected at most 2 decimal places, got ${decimalStr.length} in amount ${liveSession1.amount}`);
    }
    console.log("✓ Hourly visitor pricing computed successfully.");

    // ----------------------------------------------------
    // Test 3: Flat-rate Price Cap
    // ----------------------------------------------------
    console.log("\n3. TESTING FLAT-RATE PRICE CAP (Expected: 50.00 max for 8 hours)");
    console.log("--------------------------------------------------");
    // Backdate checkIn by 8 hours
    const backdateFlat = new Date(Date.now() - 8 * 60 * 60 * 1000);
    await prisma.session.update({
      where: { id: session1Id },
      data: { checkIn: backdateFlat },
    });

    const liveRes2 = await fetch(`${BASE_URL}/sessions/live`, { headers: authHeaders });
    const liveData2 = await liveRes2.json() as any;
    const liveSession2 = liveData2.data.find((s: any) => s.id === session1Id);

    console.log("Session 1 Hours:", liveSession2.hours);
    console.log("Session 1 Amount computed:", liveSession2.amount);

    if (liveSession2.amount !== 50) {
      throw new Error(`Expected flat-rate capped price to be 50, got ${liveSession2.amount}`);
    }
    console.log("✓ Flat-rate price cap applied successfully.");

    // ----------------------------------------------------
    // Test 4: Active Subscriber Pricing
    // ----------------------------------------------------
    console.log("\n4. TESTING ACTIVE SUBSCRIBER PRICING (Expected: 0.00 for time)");
    console.log("--------------------------------------------------");
    // Seed says visitor "v1" has active subscription "sub1"
    const subCheckInRes = await fetch(`${BASE_URL}/sessions`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ visitorId: "v1" }),
    });
    const subCheckInData = await subCheckInRes.json() as any;
    const sessionSubId = subCheckInData.data.id;
    console.log(`Checked in subscriber session ID: ${sessionSubId}`);

    // Backdate subscriber by 4 hours
    await prisma.session.update({
      where: { id: sessionSubId },
      data: { checkIn: new Date(Date.now() - 4 * 60 * 60 * 1000) },
    });

    const liveRes3 = await fetch(`${BASE_URL}/sessions/live`, { headers: authHeaders });
    const liveData3 = await liveRes3.json() as any;
    const liveSessionSub = liveData3.data.find((s: any) => s.id === sessionSubId);

    console.log("Subscriber session Hours:", liveSessionSub.hours);
    console.log("Subscriber session IsSub:", liveSessionSub.isSub);
    console.log("Subscriber session Amount computed:", liveSessionSub.amount);

    if (liveSessionSub.amount !== 0 || !liveSessionSub.isSub) {
      throw new Error(`Expected subscriber price to be 0 and isSub to be true, got amount: ${liveSessionSub.amount}, isSub: ${liveSessionSub.isSub}`);
    }
    console.log("✓ Subscriber time bypassed successfully (0.00).");

    // ----------------------------------------------------
    // Test 5: Add Snack Orders & Inventory Decrement
    // ----------------------------------------------------
    console.log("\n5. TESTING SNACK ORDERS & INVENTORY STOCK DECREMENT");
    console.log("--------------------------------------------------");
    const itemBefore = await prisma.inventoryItem.findUnique({ where: { id: "i1" } });
    console.log(`Chips ('i1') quantity BEFORE: ${itemBefore?.quantity}`);

    const socketOrderPromise = new Promise<any>((resolve) => {
      socketClient.once("session:order_added", (data) => {
        console.log("✓ Socket.io client received session:order_added event!");
        resolve(data);
      });
    });

    const orderRes = await fetch(`${BASE_URL}/sessions/${session1Id}/orders`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ itemId: "i1", qty: 2 }), // Total should be 2 * 5 = 10
    });
    const orderData = await orderRes.json() as any;
    console.log("Add Order HTTP Status:", orderRes.status);
    console.log("Add Order Response:", JSON.stringify(orderData, null, 2));

    const itemAfter = await prisma.inventoryItem.findUnique({ where: { id: "i1" } });
    console.log(`Chips ('i1') quantity AFTER: ${itemAfter?.quantity}`);

    if (itemBefore && itemAfter && itemBefore.quantity - itemAfter.quantity !== 2) {
      throw new Error(`Expected stock to decrease by 2, got before: ${itemBefore.quantity}, after: ${itemAfter.quantity}`);
    }
    console.log("✓ Inventory correctly decremented.");

    const socketOrderData = await socketOrderPromise;
    if (socketOrderData.sessionId !== session1Id || socketOrderData.order.itemId !== "i1") {
      throw new Error("Socket order event data mismatch");
    }

    // Verify live session amount now reflects 50 (time) + 10 (order) = 60
    const liveRes4 = await fetch(`${BASE_URL}/sessions/live`, { headers: authHeaders });
    const liveData4 = await liveRes4.json() as any;
    const updatedSession1 = liveData4.data.find((s: any) => s.id === session1Id);
    console.log("Updated Session 1 total live amount (expected 60):", updatedSession1.amount);
    if (updatedSession1.amount !== 60) {
      throw new Error(`Expected total live amount to be 60, got ${updatedSession1.amount}`);
    }

    // ----------------------------------------------------
    // Test 6: Checkout Unpaid (Debt Creation)
    // ----------------------------------------------------
    console.log("\n6. TESTING UNPAID CHECKOUT (DEBT CREATION)");
    console.log("--------------------------------------------------");

    const socketCheckoutPromise = new Promise<any>((resolve) => {
      socketClient.once("session:checked_out", (data) => {
        console.log("✓ Socket.io client received session:checked_out event (Unpaid)!");
        resolve(data);
      });
    });

    const checkoutUnpaidRes = await fetch(`${BASE_URL}/sessions/${session1Id}/checkout-unpaid`, {
      method: "POST",
      headers: authHeaders,
    });
    const checkoutUnpaidData = await checkoutUnpaidRes.json() as any;
    console.log("Checkout Unpaid HTTP Status:", checkoutUnpaidRes.status);
    console.log("Checkout Unpaid Response:", JSON.stringify(checkoutUnpaidData, null, 2));

    const socketCheckoutData = await socketCheckoutPromise;
    if (socketCheckoutData.id !== session1Id) {
      throw new Error("Socket checkout event data mismatch");
    }

    // Verify Debt record exists in DB
    const debts = await prisma.debt.findMany({
      where: { visitorId: visitor1Id },
    });
    console.log(`Debts in database for this visitor:`, JSON.stringify(debts, null, 2));
    if (debts.length !== 1 || Number(debts[0].amount) !== 60 || debts[0].type !== "session") {
      throw new Error("Expected a debt record of 60.00 of type 'session' to be created");
    }
    console.log("✓ Debt record correctly created in database.");

    // ----------------------------------------------------
    // Test 7: Normal Paid Checkout
    // ----------------------------------------------------
    console.log("\n7. TESTING NORMAL PAID CHECKOUT");
    console.log("--------------------------------------------------");
    
    // Add snack order of qty 1 chips to subscriber session first
    await fetch(`${BASE_URL}/sessions/${sessionSubId}/orders`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ itemId: "i1", qty: 1 }), // cost is 5
    });

    const socketCheckoutPaidPromise = new Promise<any>((resolve) => {
      socketClient.once("session:checked_out", (data) => {
        console.log("✓ Socket.io client received session:checked_out event (Paid)!");
        resolve(data);
      });
    });

    const checkoutPaidRes = await fetch(`${BASE_URL}/sessions/${sessionSubId}/checkout`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ paymentMethod: "card" }),
    });

    const checkoutPaidData = await checkoutPaidRes.json() as any;
    console.log("Checkout Paid HTTP Status:", checkoutPaidRes.status);
    console.log("Checkout Paid Response:", JSON.stringify(checkoutPaidData, null, 2));

    if (!checkoutPaidRes.ok || Number(checkoutPaidData.data.amount) !== 5 || checkoutPaidData.data.paymentStatus !== "paid") {
      throw new Error(`Expected subscriber to pay 5.00 for chips only. Got amount: ${checkoutPaidData?.data?.amount}`);
    }

    await socketCheckoutPaidPromise;
    console.log("✓ Normal paid checkout verified successfully.");

    console.log("\n==================================================");
    console.log("ALL MODULE 4 TESTS COMPLETED SUCCESSFULLY!");
    console.log("==================================================");

  } finally {
    // Reset seed items quantity back to 24 so database remains clean
    await prisma.inventoryItem.update({
      where: { id: "i1" },
      data: { quantity: 24 },
    });

    // Close server & socket
    socketClient.disconnect();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.$disconnect();
    console.log("Cleaned up database connections and stopped test server.");
  }
}

test().catch((e) => {
  console.error("Test execution failed:", e);
  process.exit(1);
});

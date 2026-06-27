import http from "http";
import app from "./app";
import { prisma } from "./lib/prisma";

const PORT = 5996;
const BASE_URL = `http://localhost:${PORT}/api/v1`;
const PFX = "dash_";
const day = 86_400_000;
const hour = 3_600_000;

async function seedTestData() {
  // Ensure settings exist
  const settings = await prisma.settings.findFirst();
  if (!settings) {
    await prisma.settings.create({
      data: {
        id: "default", hourlyRate: 10, fullDayPrice: 50, fullDayThresholdHours: 6,
        hotDrinksMonthlyCost: 400, company: { name: "T", phone: "0", email: "t@t.com", address: "X" },
      },
    });
  }

  // Visitor
  const visitor = await prisma.visitor.create({
    data: { id: `${PFX}v1`, name: "DashVisitor", phone: "0599999001", type: "visitor" },
  });

  // Session checked out today (with rounding test: 25.555 -> 25.56)
  await prisma.session.create({
    data: {
      id: `${PFX}s1`, visitorId: visitor.id,
      checkIn: new Date(Date.now() - 2 * hour), checkOut: new Date(),
      amount: 25.555, paymentStatus: "paid", paymentMethod: "cash",
    },
  });

  // Live session -> liveVisitorCount
  await prisma.session.create({
    data: {
      id: `${PFX}s-live`, visitorId: visitor.id,
      checkIn: new Date(Date.now() - 1 * hour), checkOut: null,
      amount: 0, paymentStatus: "full_debt",
    },
  });

  // Sale today
  await prisma.sale.create({
    data: {
      id: `${PFX}sale1`, itemId: "i1", itemName: "TestItem",
      quantity: 2, total: 10.0, paymentMethod: "cash",
      isHotDrink: false, date: new Date(),
    },
  });

  // Room + Booking today
  const room = await prisma.room.create({ data: { id: `${PFX}r1`, name: "DashRoom" } });
  const bStart = new Date(); bStart.setHours(new Date().getHours() + 1, 0, 0, 0);
  const bEnd = new Date(bStart); bEnd.setHours(bStart.getHours() + 2);
  await prisma.booking.create({
    data: {
      id: `${PFX}b1`, roomId: room.id, bookerName: "TestBooker", bookerPhone: "0599999002",
      purpose: "Meeting", startTime: bStart, endTime: bEnd,
      price: 100.0, status: "confirmed",
    },
  });

  // Course active today
  const course = await prisma.course.create({
    data: {
      id: `${PFX}c1`, name: "DashCourse", trainer: "Trainer",
      startDate: new Date(Date.now() - 5 * day), endDate: new Date(Date.now() + 5 * day),
      sessionsCount: 10, pricePerTrainee: 200, maxSeats: 20, roomId: room.id,
    },
  });
  await prisma.trainee.create({
    data: {
      id: `${PFX}t1`, courseId: course.id, name: "Trainee1", phone: "0599999004",
      amountPaid: 150.777, paymentStatus: "full", attendancePercent: 80,
    },
  });

  // Collected debt today (cash-basis)
  await prisma.debt.create({
    data: {
      id: `${PFX}d1`, visitorId: visitor.id, name: "DashDebt", phone: "0599999006",
      amount: 40.0, type: "manual", status: "collected",
      createdAt: new Date(Date.now() - 5 * day), collectedAt: new Date(),
    },
  });

  // Unpaid debt -> alert
  await prisma.debt.create({
    data: {
      id: `${PFX}d-unpaid`, visitorId: visitor.id, name: "UnpaidDebt", phone: "0599999007",
      amount: 55.0, type: "session", status: "unpaid", createdAt: new Date(Date.now() - 3 * day),
    },
  });

  // Subscription expiring in 2 days -> alert
  const subVisitor = await prisma.visitor.create({
    data: { id: `${PFX}v-sub`, name: "SubVisitor", phone: "0599999008", type: "subscriber" },
  });
  await prisma.subscription.create({
    data: {
      id: `${PFX}sub1`, visitorId: subVisitor.id, packageType: "monthly",
      startDate: new Date(Date.now() - 28 * day), endDate: new Date(Date.now() + 2 * day),
      dailyQuotaHours: 6, daysUsed: 25, amountPaid: 350, status: "active",
    },
  });

  // Visitor needing follow-up -> alert
  const fuVisitor = await prisma.visitor.create({
    data: { id: `${PFX}v-fu`, name: "FUVisitor", phone: "0599999009", type: "visitor", lastVisit: new Date(Date.now() - 20 * day) },
  });
  await prisma.session.create({
    data: { id: `${PFX}s-fu`, visitorId: fuVisitor.id, checkIn: new Date(Date.now() - 20 * day), amount: 0, paymentStatus: "paid" },
  });

  return { visitor, room, course };
}

async function cleanupTestData() {
  await prisma.session.deleteMany({ where: { id: { startsWith: PFX } } });
  await prisma.sale.deleteMany({ where: { id: { startsWith: PFX } } });
  await prisma.booking.deleteMany({ where: { id: { startsWith: PFX } } });
  await prisma.trainee.deleteMany({ where: { id: { startsWith: PFX } } });
  await prisma.course.deleteMany({ where: { id: { startsWith: PFX } } });
  await prisma.debt.deleteMany({ where: { id: { startsWith: PFX } } });
  await prisma.subscription.deleteMany({ where: { id: { startsWith: PFX } } });
  await prisma.visitor.deleteMany({ where: { id: { startsWith: PFX } } });
  await prisma.room.deleteMany({ where: { id: { startsWith: PFX } } });
}

async function test() {
  const lines: string[] = [];
  const log = (msg: string) => { lines.push(msg); };

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(PORT, resolve));

  try {
    await cleanupTestData();
    await seedTestData();

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
    function check(name: string, condition: boolean, detail: string) {
      if (condition) { passed++; log("  PASS: " + name + " - " + detail); }
      else { failed++; log("  FAIL: " + name + " - " + detail); }
    }

    // ===== TEST 1: GET /dashboard/summary structure and fields =====
    log("TEST 1: GET /dashboard/summary");
    const sumRes = await fetch(`${BASE_URL}/dashboard/summary`, { headers: H });
    const sumBody = (await sumRes.json()) as any;
    const s = sumBody.data;

    check("summary HTTP 200", sumRes.status === 200, "status=" + sumRes.status);
    check("liveVisitorCount is integer", Number.isInteger(s.liveVisitorCount) && s.liveVisitorCount >= 1, "val=" + s.liveVisitorCount);
    check("todayVisitCount is integer", Number.isInteger(s.todayVisitCount) && s.todayVisitCount >= 1, "val=" + s.todayVisitCount);
    check("activeCoursesToday is integer", Number.isInteger(s.activeCoursesToday) && s.activeCoursesToday >= 1, "val=" + s.activeCoursesToday);
    check("todayBookings is integer", Number.isInteger(s.todayBookings) && s.todayBookings >= 1, "val=" + s.todayBookings);
    check("todayRevenue is positive number", typeof s.todayRevenue === "number" && s.todayRevenue > 0, "val=" + s.todayRevenue);

    // Revenue precision
    const revStr = String(s.todayRevenue);
    const decLen = revStr.includes(".") ? revStr.split(".")[1].length : 0;
    check("revenue has at most 2 decimals", decLen <= 2, "decimals=" + decLen);

    // Revenue >= our test data contributions (session + sale + course + booking + debt)
    const minExpected = Math.round((25.56 + 10 + 150.78 + 100 + 40 + Number.EPSILON) * 100) / 100;
    check("revenue includes our test data", s.todayRevenue >= minExpected, "rev=" + s.todayRevenue + " >= " + minExpected);

    // Alerts structure
    check("alerts is array", Array.isArray(s.alerts), "length=" + s.alerts.length);
    const alertTypes = new Set(s.alerts.map((a: any) => a.type));
    check("has low_stock alert", alertTypes.has("low_stock"), "types=" + [...alertTypes].join(","));
    check("has unpaid_debt alert", alertTypes.has("unpaid_debt"), "types=" + [...alertTypes].join(","));
    check("has subscription_expiring alert", alertTypes.has("subscription_expiring"), "types=" + [...alertTypes].join(","));
    check("has follow_up_needed alert", alertTypes.has("follow_up_needed"), "types=" + [...alertTypes].join(","));
    log("");

    // ===== TEST 2: GET /dashboard/revenue-trend =====
    log("TEST 2: GET /dashboard/revenue-trend?days=3");
    const trendRes = await fetch(`${BASE_URL}/dashboard/revenue-trend?days=3`, { headers: H });
    const trendBody = (await trendRes.json()) as any;
    const trend = trendBody.data;

    check("trend HTTP 200", trendRes.status === 200, "status=" + trendRes.status);
    check("trend has 3 entries", trend.length === 3, "length=" + trend.length);
    check("each entry has date and revenue", trend.every((e: any) => typeof e.date === "string" && typeof e.revenue === "number"), "structure valid");
    check("trend sorted oldest to newest", trend[0].date <= trend[2].date, trend[0].date + " <= " + trend[2].date);
    check("each revenue has at most 2 decimals", trend.every((e: any) => {
      const s = String(e.revenue);
      const d = s.includes(".") ? s.split(".")[1].length : 0;
      return d <= 2;
    }), "all precision OK");

    // Today's trend entry should be close to summary revenue
    const todayTrend = trend[trend.length - 1];
    check("today trend revenue is positive", todayTrend.revenue > 0, "rev=" + todayTrend.revenue);
    log("");

    // ===== TEST 3: Authorization =====
    log("TEST 3: Authorization");
    const noorLogin = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "noor", password: "password123" }),
    });
    const noorData = (await noorLogin.json()) as any;
    const noorH = { Authorization: `Bearer ${noorData.accessToken}` };
    const noorViewRes = await fetch(`${BASE_URL}/dashboard/summary`, { headers: noorH });
    check("Noor (staff) can view summary", noorViewRes.status === 200, "status=" + noorViewRes.status);

    const noAuthRes = await fetch(`${BASE_URL}/dashboard/summary`);
    check("Unauthenticated gets 401", noAuthRes.status === 401, "status=" + noAuthRes.status);
    log("");

    // ===== TEST 4: Revenue rounding verification =====
    log("TEST 4: Revenue rounding - no floating point leaks");
    const allRevs = [s.todayRevenue, ...trend.map((e: any) => e.revenue)];
    let roundingOk = true;
    for (const r of allRevs) {
      const parts = String(r).split(".");
      if (parts.length === 2 && parts[1].length > 2) { roundingOk = false; break; }
    }
    check("no floating point leaks in any revenue value", roundingOk, "all values clean");
    log("");

    // Summary
    log("========================================");
    log("RESULTS: " + passed + " passed, " + failed + " failed, " + (passed + failed) + " total");
    log("========================================");
    if (failed === 0) log("ALL STEP 9 VERIFICATIONS COMPLETED SUCCESSFULLY!");
    else log("SOME TESTS FAILED!");

    console.log(lines.join("\n"));

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

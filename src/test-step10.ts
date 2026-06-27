import http from "http";
import ExcelJS from "exceljs";
import app from "./app";
import { prisma } from "./lib/prisma";

const PORT = 5995;
const BASE_URL = `http://localhost:${PORT}/api/v1`;
const PFX = "rpt_";
const day = 86_400_000;
const hour = 3_600_000;

// ─── known test values ────────────────────────────────────────────
const SESSION_AMOUNT_1 = 25.56;   // rounded from 25.555
const SESSION_AMOUNT_2 = 40.0;
const SALE_TOTAL_1 = 12.0;       // 2 × 6
const SALE_TOTAL_2 = 8.0;        // hot drink
const COURSE_REVENUE = 350.78;   // trainee amountPaid rounded from 350.777
const BOOKING_PRICE = 200.0;
const DEBT_COLLECTED = 60.0;
const EXPENSE_AMOUNT_1 = 380.0;
const EXPENSE_AMOUNT_2 = 150.0;
const HOT_DRINKS_MONTHLY_COST = 400;

// Date range: today covering all seeded data
const today = new Date();
const fromStr = today.toISOString().slice(0, 10);

async function seedTestData() {
  // Ensure settings
  const existing = await prisma.settings.findFirst();
  if (!existing) {
    await prisma.settings.create({
      data: {
        id: "default", hourlyRate: 10, fullDayPrice: 50, fullDayThresholdHours: 6,
        hotDrinksMonthlyCost: HOT_DRINKS_MONTHLY_COST,
        company: { name: "T", phone: "0", email: "t@t.com", address: "X" },
      },
    });
  } else {
    await prisma.settings.update({
      where: { id: existing.id },
      data: { hotDrinksMonthlyCost: HOT_DRINKS_MONTHLY_COST },
    });
  }

  // Visitor
  const visitor = await prisma.visitor.create({
    data: { id: `${PFX}v1`, name: "تقرير زائر", phone: "0599980001", type: "visitor" },
  });

  // Session 1: completed today
  await prisma.session.create({
    data: {
      id: `${PFX}s1`, visitorId: visitor.id,
      checkIn: new Date(Date.now() - 2 * hour), checkOut: new Date(),
      amount: 25.555, paymentStatus: "paid", paymentMethod: "cash",
    },
  });

  // Session 2: completed today
  await prisma.session.create({
    data: {
      id: `${PFX}s2`, visitorId: visitor.id,
      checkIn: new Date(Date.now() - 3 * hour), checkOut: new Date(Date.now() - 1 * hour),
      amount: SESSION_AMOUNT_2, paymentStatus: "paid", paymentMethod: "card",
    },
  });

  // Sale 1 (snack)
  await prisma.sale.create({
    data: {
      id: `${PFX}sale1`, itemId: "i1", itemName: "شيبس",
      quantity: 2, total: SALE_TOTAL_1, paymentMethod: "cash",
      isHotDrink: false, date: new Date(),
    },
  });

  // Sale 2 (hot drink)
  await prisma.sale.create({
    data: {
      id: `${PFX}sale2`, itemId: "hot-coffee", itemName: "قهوة",
      quantity: 1, total: SALE_TOTAL_2, paymentMethod: "card",
      isHotDrink: true, date: new Date(),
    },
  });

  // Room + Booking
  const room = await prisma.room.create({ data: { id: `${PFX}r1`, name: "قاعة التقرير" } });
  const bStart = new Date(); bStart.setHours(10, 0, 0, 0);
  const bEnd = new Date(bStart); bEnd.setHours(12, 0, 0, 0);
  await prisma.booking.create({
    data: {
      id: `${PFX}b1`, roomId: room.id, bookerName: "محاضر تقرير", bookerPhone: "0599980002",
      purpose: "اختبار تقرير", startTime: bStart, endTime: bEnd,
      price: BOOKING_PRICE, status: "confirmed",
    },
  });

  // Course active today
  const course = await prisma.course.create({
    data: {
      id: `${PFX}c1`, name: "دورة تقرير", trainer: "مدرب تقرير",
      startDate: new Date(Date.now() - 5 * day), endDate: new Date(Date.now() + 5 * day),
      sessionsCount: 10, pricePerTrainee: 400, maxSeats: 20, roomId: room.id,
    },
  });
  await prisma.trainee.create({
    data: {
      id: `${PFX}t1`, courseId: course.id, name: "متدرب تقرير", phone: "0599980003",
      amountPaid: 350.777, paymentStatus: "full", attendancePercent: 80,
    },
  });

  // Collected debt today
  await prisma.debt.create({
    data: {
      id: `${PFX}d1`, visitorId: visitor.id, name: "مديون تقرير", phone: "0599980004",
      amount: DEBT_COLLECTED, type: "manual", status: "collected",
      createdAt: new Date(Date.now() - 5 * day), collectedAt: new Date(),
    },
  });

  // Expenses today
  await prisma.expense.create({
    data: { id: `${PFX}e1`, description: "فاتورة كهرباء تقرير", category: "electricity", amount: EXPENSE_AMOUNT_1, date: new Date() },
  });
  await prisma.expense.create({
    data: { id: `${PFX}e2`, description: "إيجار تقرير", category: "rent", amount: EXPENSE_AMOUNT_2, date: new Date() },
  });

  // Subscription active in range
  const subVisitor = await prisma.visitor.create({
    data: { id: `${PFX}v2`, name: "مشترك تقرير", phone: "0599980005", type: "subscriber" },
  });
  await prisma.subscription.create({
    data: {
      id: `${PFX}sub1`, visitorId: subVisitor.id, packageType: "monthly",
      startDate: new Date(Date.now() - 10 * day), endDate: new Date(Date.now() + 20 * day),
      dailyQuotaHours: 6, daysUsed: 8, amountPaid: 350, status: "active",
    },
  });

  // Temporary staff WITHOUT permission on "التقارير" (for auth test)
  const bcrypt = require("bcrypt");
  const hash = await bcrypt.hash("password123", 10);
  const tempStaff = await prisma.staff.create({
    data: { id: `${PFX}staff1`, name: "موظف تقرير", username: `${PFX}tempstaff`, role: "staff", passwordHash: hash },
  });
  // Explicitly: do NOT create a Permission record for "التقارير" for this staff

  return { visitor, subVisitor, room, course, tempStaff };
}

async function cleanupTestData() {
  await prisma.snackOrder.deleteMany({ where: { id: { startsWith: PFX } } });
  await prisma.sale.deleteMany({ where: { id: { startsWith: PFX } } });
  await prisma.session.deleteMany({ where: { id: { startsWith: PFX } } });
  await prisma.trainee.deleteMany({ where: { id: { startsWith: PFX } } });
  await prisma.course.deleteMany({ where: { id: { startsWith: PFX } } });
  await prisma.booking.deleteMany({ where: { id: { startsWith: PFX } } });
  await prisma.debt.deleteMany({ where: { id: { startsWith: PFX } } });
  await prisma.expense.deleteMany({ where: { id: { startsWith: PFX } } });
  await prisma.subscription.deleteMany({ where: { id: { startsWith: PFX } } });
  await prisma.visitor.deleteMany({ where: { id: { startsWith: PFX } } });
  await prisma.room.deleteMany({ where: { id: { startsWith: PFX } } });
  await prisma.permission.deleteMany({ where: { staffId: { startsWith: PFX } } });
  await prisma.staff.deleteMany({ where: { id: { startsWith: PFX } } });
}

async function test() {
  const lines: string[] = [];
  const log = (msg: string) => { lines.push(msg); };

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(PORT, resolve));

  try {
    await cleanupTestData();
    const data = await seedTestData();

    // Login as admin
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "password123" }),
    });
    const loginData = (await loginRes.json()) as any;
    const token = loginData.accessToken;
    const H = { Authorization: `Bearer ${token}` };

    let passed = 0;
    let failed = 0;
    function check(name: string, condition: boolean, detail: string) {
      if (condition) { passed++; log("  PASS: " + name + " - " + detail); }
      else { failed++; log("  FAIL: " + name + " - " + detail); }
    }

    // ===== TEST 1: HTTP 200 and correct content-type =====
    log("TEST 1: GET /reports/export - HTTP 200 and correct content-type");
    const exportUrl = `${BASE_URL}/reports/export?from=${fromStr}&to=${fromStr}&format=xlsx`;
    const exportRes = await fetch(exportUrl, { headers: H });
    const contentType = exportRes.headers.get("content-type") || "";
    check("HTTP 200", exportRes.status === 200, "status=" + exportRes.status);
    check("content-type is xlsx", contentType.includes("spreadsheetml.sheet"), "ct=" + contentType);
    const xlsxBuffer = Buffer.from(await exportRes.arrayBuffer());
    check("buffer is non-empty", xlsxBuffer.length > 0, "size=" + xlsxBuffer.length + " bytes");
    log("");

    // ===== TEST 2: Parse XLSX and verify all 6 sheets with headers =====
    log("TEST 2: Parse XLSX - 6 sheets with correct headers");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xlsxBuffer);

    const expectedSheets = [
      { name: "الزيارات", headers: ["اسم الزائر", "النوع", "وقت الدخول", "وقت الخروج", "المدة (ساعات)", "المبلغ", "حالة الدفع", "طريقة الدفع"] },
      { name: "المشتركون", headers: ["اسم الزائر", "نوع الباقة", "تاريخ البداية", "تاريخ النهاية", "الحصة اليومية (ساعات)", "المبلغ المدفوع", "الحالة"] },
      { name: "السناكس والمشروبات", headers: ["التاريخ", "اسم الصنف", "الكمية", "الإجمالي", "مشروب ساخن", "طريقة الدفع"] },
      { name: "المصروفات", headers: ["التاريخ", "الوصف", "الفئة", "المبلغ"] },
      { name: "القاعات والدورات", headers: ["النوع", "الاسم / الغرفة", "الحجز / الدورة", "المؤجر / المدرب", "الوقت / التواريخ", "السعر / الإيراد", "عدد المتدربين"] },
      { name: "الملخص المالي", headers: ["البند", "المبلغ"] },
    ];

    check("workbook has 6 sheets", wb.worksheets.length === 6, "count=" + wb.worksheets.length);

    for (const expected of expectedSheets) {
      const ws = wb.getWorksheet(expected.name);
      if (!ws) {
        failed++; log("  FAIL: Sheet '" + expected.name + "' not found");
        continue;
      }
      const headerRow = ws.getRow(1);
      const actualHeaders: string[] = [];
      headerRow.eachCell({ includeEmpty: false }, (cell) => {
        actualHeaders.push(String(cell.value));
      });
      const headersMatch = expected.headers.every((h, i) => actualHeaders[i] === h);
      check("Sheet '" + expected.name + "' headers", headersMatch, "expected=" + expected.headers.join("|") + " got=" + actualHeaders.join("|"));
    }

    // Verify data rows exist in key sheets
    const visitsWs = wb.getWorksheet("الزيارات");
    const visitsRowCount = visitsWs ? visitsWs.rowCount - 1 : 0; // minus header
    check("Visits sheet has data rows", visitsRowCount >= 2, "rows=" + visitsRowCount);

    const salesWs = wb.getWorksheet("السناكس والمشروبات");
    const salesRowCount = salesWs ? salesWs.rowCount - 1 : 0;
    check("Sales sheet has data rows", salesRowCount >= 2, "rows=" + salesRowCount);

    const expensesWs = wb.getWorksheet("المصروفات");
    const expensesRowCount = expensesWs ? expensesWs.rowCount - 1 : 0;
    check("Expenses sheet has data rows", expensesRowCount >= 2, "rows=" + expensesRowCount);
    log("");

    // ===== TEST 3: Financial Summary calculation =====
    log("TEST 3: Financial Summary net profit calculation");
    const summaryWs = wb.getWorksheet("الملخص المالي");
    if (summaryWs) {
      const summaryData: Record<string, number> = {};
      summaryWs.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // skip header
        const label = String(row.getCell(1).value);
        const amount = Number(row.getCell(2).value);
        summaryData[label] = amount;
      });

      // Compute expected values from DB (same queries the controller uses)
      const fromDate = new Date(fromStr);
      const toDate = new Date(fromStr);
      toDate.setHours(23, 59, 59, 999);

      const expectedSessions = await prisma.session.findMany({
        where: { checkIn: { gte: fromDate, lte: toDate } },
        select: { amount: true, checkOut: true },
      });
      const expectedSessionRev = Math.round((expectedSessions.filter((s) => s.checkOut !== null).reduce((sum, s) => sum + Number(s.amount), 0) + Number.EPSILON) * 100) / 100;

      const expectedSalesData = await prisma.sale.findMany({
        where: { date: { gte: fromDate, lte: toDate } },
        select: { total: true },
      });
      const expectedSaleRev = Math.round((expectedSalesData.reduce((sum, s) => sum + Number(s.total), 0) + Number.EPSILON) * 100) / 100;

      const expectedCourses = await prisma.course.findMany({
        where: { startDate: { lte: toDate }, endDate: { gte: fromDate } },
        select: { id: true },
      });
      let expectedCourseRev = 0;
      if (expectedCourses.length > 0) {
        const cIds = expectedCourses.map((c) => c.id);
        const expTrainees = await prisma.trainee.findMany({
          where: { courseId: { in: cIds } },
          select: { amountPaid: true },
        });
        expectedCourseRev = Math.round((expTrainees.reduce((sum, t) => sum + Number(t.amountPaid), 0) + Number.EPSILON) * 100) / 100;
      }

      const expectedBookingsData = await prisma.booking.findMany({
        where: { status: "confirmed", startTime: { gte: fromDate, lte: toDate } },
        select: { price: true },
      });
      const expectedBookingRev = Math.round((expectedBookingsData.reduce((sum, b) => sum + Number(b.price), 0) + Number.EPSILON) * 100) / 100;

      const expectedDebtsData = await prisma.debt.findMany({
        where: { status: "collected", collectedAt: { gte: fromDate, lte: toDate } },
        select: { amount: true },
      });
      const expectedDebtRev = Math.round((expectedDebtsData.reduce((sum, d) => sum + Number(d.amount), 0) + Number.EPSILON) * 100) / 100;

      const expectedExpensesData = await prisma.expense.findMany({
        where: { date: { gte: fromDate, lte: toDate } },
        select: { amount: true },
      });
      const expectedExpenses = Math.round((expectedExpensesData.reduce((sum, e) => sum + Number(e.amount), 0) + Number.EPSILON) * 100) / 100;

      const r = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
      const expectedTotalRevenue = r(expectedSessionRev + expectedSaleRev + expectedCourseRev + expectedBookingRev + expectedDebtRev);
      const daysInRange = Math.max(1, Math.ceil((toDate.getTime() - fromDate.getTime()) / 86400000));
      const expectedHotDrinks = r(HOT_DRINKS_MONTHLY_COST * (daysInRange / 30));
      const expectedNetProfit = r(expectedTotalRevenue - expectedExpenses - expectedHotDrinks);

      check("session revenue", summaryData["إيراد الجلسات"] === expectedSessionRev,
        "got=" + summaryData["إيراد الجلسات"] + " expected=" + expectedSessionRev);
      check("sale revenue", summaryData["إيراد المبيعات"] === expectedSaleRev,
        "got=" + summaryData["إيراد المبيعات"] + " expected=" + expectedSaleRev);
      check("course revenue", summaryData["إيراد الدورات"] === expectedCourseRev,
        "got=" + summaryData["إيراد الدورات"] + " expected=" + expectedCourseRev);
      check("booking revenue", summaryData["إيراد الحجوزات"] === expectedBookingRev,
        "got=" + summaryData["إيراد الحجوزات"] + " expected=" + expectedBookingRev);
      check("debt revenue", summaryData["إيراد الديون المحصلة"] === expectedDebtRev,
        "got=" + summaryData["إيراد الديون المحصلة"] + " expected=" + expectedDebtRev);
      check("total revenue", summaryData["الإيرادات الإجمالية"] === expectedTotalRevenue,
        "got=" + summaryData["الإيرادات الإجمالية"] + " expected=" + expectedTotalRevenue);
      check("expenses", summaryData["المصروفات"] === expectedExpenses,
        "got=" + summaryData["المصروفات"] + " expected=" + expectedExpenses);
      check("hot drinks prorated", summaryData["تكلفة المشروبات الساخنة (نسبة)"] === expectedHotDrinks,
        "got=" + summaryData["تكلفة المشروبات الساخنة (نسبة)"] + " expected=" + expectedHotDrinks);
      check("net profit", summaryData["صافي الربح"] === expectedNetProfit,
        "got=" + summaryData["صافي الربح"] + " expected=" + expectedNetProfit);

      // Verify rounding: all values should have at most 2 decimals
      let allRounded = true;
      for (const [k, v] of Object.entries(summaryData)) {
        const s = String(v);
        const decLen = s.includes(".") ? s.split(".")[1].length : 0;
        if (decLen > 2) { allRounded = false; break; }
      }
      check("all summary values rounded to 2 decimals", allRounded, "all clean");
    } else {
      failed++; log("  FAIL: Summary sheet not found");
    }
    log("");

    // ===== TEST 4: Authorization block - staff without permission =====
    log("TEST 4: Authorization block - staff without 'التقارير' permission (expected 403)");
    // Login as the temporary staff (no permission for "التقارير")
    const tempLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: `${PFX}tempstaff`, password: "password123" }),
    });
    const tempLoginBody = (await tempLoginRes.json()) as any;
    const tempToken = tempLoginBody.accessToken;
    const tempH = { Authorization: `Bearer ${tempToken}` };

    const noPermRes = await fetch(exportUrl, { headers: tempH });
    check("staff without permission gets 403", noPermRes.status === 403, "status=" + noPermRes.status);
    const noPermBody = await noPermRes.json();
    check("403 response has error message", noPermBody.success === false || noPermBody.message, "body=" + JSON.stringify(noPermBody));

    // Also test unauthenticated
    const noAuthRes = await fetch(exportUrl);
    check("unauthenticated gets 401", noAuthRes.status === 401, "status=" + noAuthRes.status);
    log("");

    // Cleanup step 10 test data before regression
    await cleanupTestData();

    // ===== TEST 5: Regression - Step 7, 8, 9 =====
    log("TEST 5: Regression - running step 7, 8, 9 tests");

    // --- Step 7 Regression (Rooms, Bookings, Courses) ---
    log("  5a: Step 7 regression (Rooms, Bookings, Courses)");
    // Create room, booking, course with same data pattern as step7
    const regRoom = await prisma.room.create({ data: { name: "اختبار_إعادة_قاعة" } });
    const regBStart = new Date(); regBStart.setHours(14, 0, 0, 0);
    const regBEnd = new Date(regBStart); regBEnd.setHours(16, 0, 0, 0);

    const regBookingRes = await fetch(`${BASE_URL}/rooms/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        roomId: regRoom.id, bookerName: "اختبار_إعادة_محاضر", bookerPhone: "0599980100",
        purpose: "إعادة اختبار", startTime: regBStart.toISOString(), endTime: regBEnd.toISOString(),
        price: 100, status: "confirmed",
      }),
    });
    check("step7 regression: booking created", regBookingRes.status === 201, "status=" + regBookingRes.status);

    // Overlapping booking should fail
    const regOverlap = new Date(regBStart); regOverlap.setHours(15, 0, 0, 0);
    const regOverlapEnd = new Date(regBStart); regOverlapEnd.setHours(17, 0, 0, 0);
    const regConflictRes = await fetch(`${BASE_URL}/rooms/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        roomId: regRoom.id, bookerName: "اختبار_إعادة_تداخل", bookerPhone: "0599980101",
        purpose: "تداخل", startTime: regOverlap.toISOString(), endTime: regOverlapEnd.toISOString(),
        price: 120, status: "confirmed",
      }),
    });
    check("step7 regression: overlapping booking rejected", regConflictRes.status === 409, "status=" + regConflictRes.status);

    // Course creation
    const regCourseRes = await fetch(`${BASE_URL}/courses`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: "اختبار_إعادة_دورة", trainer: "مدرب إعادة",
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 7 * day).toISOString(),
        sessionsCount: 5, pricePerTrainee: 350.777, maxSeats: 20, roomId: regRoom.id,
      }),
    });
    const regCourseBody = (await regCourseRes.json()) as any;
    check("step7 regression: course created", regCourseRes.status === 201, "status=" + regCourseRes.status);
    check("step7 regression: pricePerTrainee rounded", Number(regCourseBody.data.pricePerTrainee) === 350.78, "val=" + regCourseBody.data.pricePerTrainee);

    // Add trainee
    const regTraineeRes = await fetch(`${BASE_URL}/courses/${regCourseBody.data.id}/trainees`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: "اختبار_إعادة_متدرب", phone: "0599980102",
        amountPaid: 350.777, paymentStatus: "full", attendancePercent: 0,
      }),
    });
    const regTraineeBody = (await regTraineeRes.json()) as any;
    check("step7 regression: trainee added", regTraineeRes.status === 201, "status=" + regTraineeRes.status);
    check("step7 regression: amountPaid rounded", Number(regTraineeBody.data.amountPaid) === 350.78, "val=" + regTraineeBody.data.amountPaid);

    // Cleanup step7 regression data
    await prisma.trainee.deleteMany({ where: { name: { startsWith: "اختبار_إعادة_" } } });
    await prisma.course.deleteMany({ where: { name: { startsWith: "اختبار_إعادة_" } } });
    await prisma.booking.deleteMany({ where: { bookerName: { startsWith: "اختبار_إعادة_" } } });
    await prisma.room.deleteMany({ where: { name: { startsWith: "اختبار_إعادة_" } } });

    // --- Step 8 Regression (Follow-up) ---
    log("  5b: Step 8 regression (Follow-up)");
    const PFX8 = "fu_reg_";
    const vRegA = await prisma.visitor.create({
      data: { id: `${PFX8}vA`, name: "إعادة_زائر_قديم", phone: "0599980201", type: "visitor", lastVisit: new Date(Date.now() - 20 * day) },
    });
    await prisma.session.create({
      data: { id: `${PFX8}sA`, visitorId: vRegA.id, checkIn: new Date(Date.now() - 20 * day), amount: 0, paymentStatus: "paid" },
    });

    const fuListRes = await fetch(`${BASE_URL}/follow-up`, { headers: H });
    const fuListBody = (await fuListRes.json()) as any;
    const foundReg = fuListBody.data.find((v: any) => v.id === vRegA.id);
    check("step8 regression: old-session visitor in follow-up list", !!foundReg, "found=" + !!foundReg);

    // Contacted
    const contactRes = await fetch(`${BASE_URL}/follow-up/${vRegA.id}/contacted`, { method: "POST", headers: H });
    check("step8 regression: mark contacted", contactRes.status === 200, "status=" + contactRes.status);

    await prisma.session.deleteMany({ where: { id: { startsWith: PFX8 } } });
    await prisma.visitor.deleteMany({ where: { id: { startsWith: PFX8 } } });

    // --- Step 9 Regression (Dashboard) ---
    log("  5c: Step 9 regression (Dashboard)");
    const dashRes = await fetch(`${BASE_URL}/dashboard/summary`, { headers: H });
    const dashBody = (await dashRes.json()) as any;
    const ds = dashBody.data;
    check("step9 regression: summary HTTP 200", dashRes.status === 200, "status=" + dashRes.status);
    check("step9 regression: liveVisitorCount is integer", Number.isInteger(ds.liveVisitorCount), "val=" + ds.liveVisitorCount);
    check("step9 regression: todayRevenue is number", typeof ds.todayRevenue === "number", "val=" + ds.todayRevenue);
    check("step9 regression: alerts is array", Array.isArray(ds.alerts), "count=" + ds.alerts.length);

    const trendRes = await fetch(`${BASE_URL}/dashboard/revenue-trend?days=3`, { headers: H });
    const trendBody = (await trendRes.json()) as any;
    check("step9 regression: revenue-trend HTTP 200", trendRes.status === 200, "status=" + trendRes.status);
    check("step9 regression: trend has 3 entries", trendBody.data.length === 3, "count=" + trendBody.data.length);
    log("");

    // ===== SUMMARY =====
    log("========================================");
    log("RESULTS: " + passed + " passed, " + failed + " failed, " + (passed + failed) + " total");
    log("========================================");
    if (failed === 0) log("ALL STEP 10 VERIFICATIONS COMPLETED SUCCESSFULLY!");
    else log("SOME TESTS FAILED!");

    console.log(lines.join("\n"));

    if (failed > 0) process.exit(1);
  } finally {
    await cleanupTestData();
    await new Promise<void>((resolve) => server.close(() => resolve));
    await prisma.$disconnect();
  }
}

test().catch((e) => {
  console.error("Test execution failed:", e);
  process.exit(1);
});

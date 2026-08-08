import { prisma } from "./prisma";
import { getEffectiveStatus } from "../lib/subscription";
import { calculateSessionPricing } from "../modules/sessions/pricing";
import { palestineStartOfDay, palestineEndOfDay, formatPalestineDate, formatPalestineDateTime } from "./timezone";
import { sendMail } from "./email";
import ExcelJS from "exceljs";

const r = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/** Build the Excel workbook for a given date range. Returns a Buffer. */
export async function generateReportBuffer(fromDate: Date, toDate: Date): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Noon Coworking";
  workbook.created = new Date();

  const paymentStatusMap: Record<string, string> = {
    paid: "مدفوع",
    partial_debt: "دين جزئي",
    full_debt: "دين كامل",
  };
  const paymentMethodMap: Record<string, string> = {
    cash: "نقدي",
    card: "بطاقة",
    transfer: "تحويل",
  };
  const typeMap: Record<string, string> = {
    visitor: "زائر",
    subscriber: "مشترك",
    trainee: "متدرب",
  };
  const categoryMap: Record<string, string> = {
    electricity: "كهرباء",
    rent: "إيجار",
    salaries: "رواتب",
    maintenance: "صيانة",
    marketing: "تسويق",
    other: "أخرى",
  };
  const subStatusMap: Record<string, string> = {
    active: "نشط",
    expired: "منتهي",
    paused: "متوقف",
    renewing: "جديد",
  };
  const pkgMap: Record<string, string> = {
    monthly: "شهري",
    weekly: "أسبوعي",
    half_month: "نصف شهر",
  };

  // --- Fetch all data (same as controller exportReport) ---
  const [sessions, sales, expenses, bookings, courses, activeSubscriptions, pricingSettings] = await Promise.all([
    prisma.session.findMany({
      where: { checkIn: { gte: fromDate, lte: toDate } },
      select: {
        sessionType: true, amount: true, paymentStatus: true, paymentMethod: true,
        checkIn: true, checkOut: true, discountAmount: true, discountNote: true,
        paymentAccount: true, finalPrice: true, adjustmentNote: true,
        hourlyRate: true, hourlyPriceOverride: true, visitorId: true,
        visitor: { select: { name: true, type: true } },
        snackOrders: { select: { total: true } },
      },
      orderBy: { checkIn: "asc" },
    }),
    prisma.sale.findMany({
      where: { date: { gte: fromDate, lte: toDate } },
      orderBy: { date: "asc" },
    }),
    prisma.expense.findMany({
      where: { date: { gte: fromDate, lte: toDate } },
      orderBy: { date: "asc" },
    }),
    prisma.booking.findMany({
      where: { startTime: { gte: fromDate, lte: toDate } },
      include: { room: { select: { name: true } } },
      orderBy: { startTime: "asc" },
    }),
    prisma.course.findMany({
      where: { startDate: { lte: toDate }, endDate: { gte: fromDate } },
      include: { room: { select: { name: true } }, trainees: true },
      orderBy: { startDate: "asc" },
    }),
    prisma.subscription.findMany({
      where: { status: "active", endDate: { gte: new Date() } },
      select: { visitorId: true, amountPaid: true },
    }),
    prisma.settings.findFirst(),
  ]);

  const subscriptionsInRange = await prisma.subscription.findMany({
    where: {
      OR: [
        { startDate: { gte: fromDate, lte: toDate } },
        { endDate: { gte: fromDate, lte: toDate } },
        { AND: [{ startDate: { lte: fromDate } }, { endDate: { gte: toDate } }] },
      ],
    },
    include: { visitor: { select: { name: true } } },
    orderBy: { startDate: "asc" },
  });

  const collectedDebts = await prisma.debt.findMany({
    where: { status: "collected", collectedAt: { gte: fromDate, lte: toDate } },
    select: { amount: true },
  });

  // --- Sheet 1: Visits Summary ---
  const visitsSummarySheet = workbook.addWorksheet("ملخص الزيارات");
  visitsSummarySheet.columns = [
    { header: "البند", key: "item", width: 28 },
    { header: "القيمة", key: "value", width: 16 },
  ];
  const totalVisits = sessions.length;
  const paidVisits = sessions.filter((s) => s.paymentStatus === "paid" && s.checkOut !== null);
  const totalHoursRevenue = r(paidVisits.reduce((sum, s) => {
    const snacksTotal = (s.snackOrders ?? []).reduce((snackSum: number, o: any) => snackSum + Number(o.total), 0);
    return sum + (Number(s.amount) - snacksTotal);
  }, 0));
  const avgRevenue = paidVisits.length > 0 ? r(totalHoursRevenue / paidVisits.length) : 0;
  const visitorCount = sessions.filter((s) => (s.sessionType ?? s.visitor.type) === "visitor").length;
  const subscriberCount = sessions.filter((s) => (s.sessionType ?? s.visitor.type) === "subscriber").length;
  const traineeCount = sessions.filter((s) => (s.sessionType ?? s.visitor.type) === "trainee").length;

  visitsSummarySheet.addRow({ item: "إجمالي الزيارات", value: totalVisits });
  visitsSummarySheet.addRow({ item: "الزيارات المدفوعة", value: paidVisits.length });
  visitsSummarySheet.addRow({ item: "إيراد الجلسات", value: totalHoursRevenue });
  visitsSummarySheet.addRow({ item: "متوسط إيراد الزيارة", value: avgRevenue });
  visitsSummarySheet.addRow({ item: "الزائرون", value: visitorCount });
  visitsSummarySheet.addRow({ item: "المشتركون", value: subscriberCount });
  visitsSummarySheet.addRow({ item: "المتدربون", value: traineeCount });

  // --- Sheet 2: Subscribers ---
  const subsSheet = workbook.addWorksheet("المشتركون");
  subsSheet.columns = [
    { header: "اسم الزائر", key: "visitorName", width: 20 },
    { header: "نوع الباقة", key: "packageType", width: 14 },
    { header: "تاريخ البداية", key: "startDate", width: 14 },
    { header: "تاريخ النهاية", key: "endDate", width: 14 },
    { header: "الحصة اليومية (ساعات)", key: "dailyQuotaHours", width: 18 },
    { header: "المبلغ المدفوع", key: "amountPaid", width: 14 },
    { header: "الحالة", key: "status", width: 12 },
  ];
  for (const sub of subscriptionsInRange) {
    subsSheet.addRow({
      visitorName: sub.visitor.name,
      packageType: pkgMap[sub.packageType] || sub.packageType,
      startDate: formatPalestineDate(sub.startDate),
      endDate: formatPalestineDate(sub.endDate),
      dailyQuotaHours: sub.dailyQuotaHours,
      amountPaid: Math.round(Number(sub.amountPaid)),
      status: subStatusMap[getEffectiveStatus(sub)] || sub.status,
    });
  }

  // --- Sheet 3: Sales ---
  const salesSheet = workbook.addWorksheet("السناكس والمشروبات");
  salesSheet.columns = [
    { header: "التاريخ", key: "date", width: 14 },
    { header: "اسم الصنف", key: "itemName", width: 18 },
    { header: "الكمية", key: "quantity", width: 10 },
    { header: "الإجمالي", key: "total", width: 12 },
    { header: "مشروب ساخن", key: "isHotDrink", width: 14 },
    { header: "طريقة الدفع", key: "paymentMethod", width: 14 },
  ];
  for (const sale of sales) {
    salesSheet.addRow({
      date: formatPalestineDate(sale.date),
      itemName: sale.itemName,
      quantity: sale.quantity,
      total: Math.round(Number(sale.total)),
      isHotDrink: sale.isHotDrink ? "نعم" : "لا",
      paymentMethod: paymentMethodMap[sale.paymentMethod] || sale.paymentMethod,
    });
  }

  // --- Sheet 4: Expenses ---
  const expensesSheet = workbook.addWorksheet("المصروفات");
  expensesSheet.columns = [
    { header: "التاريخ", key: "date", width: 14 },
    { header: "الوصف", key: "description", width: 24 },
    { header: "الفئة", key: "category", width: 14 },
    { header: "المبلغ", key: "amount", width: 12 },
  ];
  for (const exp of expenses) {
    expensesSheet.addRow({
      date: formatPalestineDate(exp.date),
      description: exp.description,
      category: categoryMap[exp.category] || exp.category,
      amount: Math.round(Number(exp.amount)),
    });
  }

  // --- Sheet 5: Rooms & Courses ---
  const roomsSheet = workbook.addWorksheet("القاعات والدورات");
  roomsSheet.columns = [
    { header: "النوع", key: "type", width: 10 },
    { header: "الاسم / الغرفة", key: "name", width: 22 },
    { header: "الحجز / الدورة", key: "bookerOrCourse", width: 22 },
    { header: "المؤجر / المدرب", key: "trainerOrBooker", width: 18 },
    { header: "الوقت / التواريخ", key: "timeOrDates", width: 28 },
    { header: "السعر / الإيراد", key: "price", width: 14 },
    { header: "عدد المتدربين", key: "traineeCount", width: 14 },
  ];
  for (const bk of bookings) {
    roomsSheet.addRow({
      type: "حجز",
      name: bk.room.name,
      bookerOrCourse: bk.purpose,
      trainerOrBooker: bk.bookerName,
      timeOrDates: `${formatPalestineDateTime(bk.startTime)} - ${formatPalestineDateTime(bk.endTime)}`,
      price: Math.round(Number(bk.price)),
      traineeCount: "—",
    });
  }
  for (const course of courses) {
    const traineeCount = course.trainees.length;
    const revenue = course.trainees.reduce((sum, t) => sum + Number(t.amountPaid), 0);
    roomsSheet.addRow({
      type: "دورة",
      name: course.room.name,
      bookerOrCourse: course.name,
      trainerOrBooker: course.trainer,
      timeOrDates: `${formatPalestineDate(course.startDate)} - ${formatPalestineDate(course.endDate)}`,
      price: r(revenue),
      traineeCount,
    });
  }

  // --- Sheet 6: Financial Summary ---
  const summarySheet = workbook.addWorksheet("الملخص المالي");
  summarySheet.columns = [
    { header: "البند", key: "item", width: 32 },
    { header: "المبلغ", key: "amount", width: 16 },
  ];

  const sessionRev = r(
    sessions
      .filter((s) => s.checkOut !== null && s.paymentStatus === "paid")
      .reduce((sum, s) => {
        const snacksTotal = (s.snackOrders ?? []).reduce((snackSum: number, o: any) => snackSum + Number(o.total), 0);
        return sum + (Number(s.amount) - snacksTotal);
      }, 0),
  );
  const saleRev = r(sales.reduce((sum, s) => sum + Number(s.total), 0));
  let courseRev = 0;
  if (courses.length > 0) {
    const trainees = await prisma.trainee.findMany({
      where: { courseId: { in: courses.map((c) => c.id) } },
      select: { amountPaid: true },
    });
    courseRev = r(trainees.reduce((sum, t) => sum + Number(t.amountPaid), 0));
  }
  const bookingRev = r(
    bookings.filter((b) => b.status === "confirmed").reduce((sum, b) => sum + Number(b.price), 0),
  );
  const debtRev = r(collectedDebts.reduce((sum, d) => sum + Number(d.amount), 0));
  const totalDiscounts = r(
    sessions
      .filter((s) => s.checkOut !== null && s.paymentStatus === "paid")
      .reduce((sum, s) => sum + Number(s.discountAmount), 0),
  );
  const totalExpenses = r(expenses.reduce((sum, e) => sum + Number(e.amount), 0));
  const monthlyHotDrinksCost = pricingSettings ? Number(pricingSettings.hotDrinksMonthlyCost) : 0;
  const daysInRange = Math.max(1, Math.ceil((toDate.getTime() - fromDate.getTime()) / 86400000));
  const hotDrinksProrated = r(monthlyHotDrinksCost * (daysInRange / 30));
  const totalRevenue = r(sessionRev + saleRev + courseRev + bookingRev + debtRev);
  const totalDeductions = r(totalExpenses + hotDrinksProrated);
  const netProfit = r(totalRevenue - totalDeductions);

  summarySheet.addRow({ item: "إيراد الجلسات", amount: sessionRev });
  summarySheet.addRow({ item: "إيراد المبيعات", amount: saleRev });
  summarySheet.addRow({ item: "إيراد الدورات", amount: courseRev });
  summarySheet.addRow({ item: "إيراد الحجوزات", amount: bookingRev });
  summarySheet.addRow({ item: "إيراد الديون المحصلة", amount: debtRev });
  summarySheet.addRow({ item: "الخصومات", amount: totalDiscounts });
  summarySheet.addRow({ item: "الإيرادات الإجمالية", amount: totalRevenue });
  summarySheet.addRow({ item: "المصروفات", amount: totalExpenses });
  summarySheet.addRow({ item: "تكلفة المشروبات الساخنة (نسبة)", amount: hotDrinksProrated });
  summarySheet.addRow({ item: "صافي الربح", amount: netProfit });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/** Build an HTML email body with the financial summary headline numbers. */
export function generateReportHtml(fromDate: Date, toDate: Date, summary: {
  totalRevenue: number;
  sessionRev: number;
  saleRev: number;
  courseRev: number;
  bookingRev: number;
  debtRev: number;
  totalExpenses: number;
  hotDrinksProrated: number;
  netProfit: number;
  totalVisits: number;
  activeSubscribers: number;
}): string {
  const dateStr = formatPalestineDate(fromDate);
  const fmt = (v: number) => v.toLocaleString("ar-EG", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px;">
<div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
  <div style="background: #1a1a2e; color: #fff; padding: 20px; text-align: center;">
    <h1 style="margin: 0; font-size: 20px;">التقرير المالي اليومي</h1>
    <p style="margin: 5px 0 0; opacity: 0.8;">${dateStr}</p>
  </div>
  <div style="padding: 20px;">
    <table style="width: 100%; border-collapse: collapse; direction: rtl;">
      <tr style="background: #f0f0f0;">
        <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #ddd;">الزيارات</td>
        <td style="padding: 10px; text-align: left; border-bottom: 1px solid #ddd;">${summary.totalVisits}</td>
      </tr>
      <tr>
        <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #ddd;">المشتركون النشطون</td>
        <td style="padding: 10px; text-align: left; border-bottom: 1px solid #ddd;">${summary.activeSubscribers}</td>
      </tr>
      <tr style="background: #f0f0f0;">
        <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #ddd;">إيراد الجلسات</td>
        <td style="padding: 10px; text-align: left; border-bottom: 1px solid #ddd;">${fmt(summary.sessionRev)}</td>
      </tr>
      <tr>
        <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #ddd;">إيراد المبيعات</td>
        <td style="padding: 10px; text-align: left; border-bottom: 1px solid #ddd;">${fmt(summary.saleRev)}</td>
      </tr>
      <tr style="background: #f0f0f0;">
        <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #ddd;">إيراد الدورات</td>
        <td style="padding: 10px; text-align: left; border-bottom: 1px solid #ddd;">${fmt(summary.courseRev)}</td>
      </tr>
      <tr>
        <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #ddd;">إيراد الحجوزات</td>
        <td style="padding: 10px; text-align: left; border-bottom: 1px solid #ddd;">${fmt(summary.bookingRev)}</td>
      </tr>
      <tr style="background: #f0f0f0;">
        <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #ddd;">إيراد الديون المحصلة</td>
        <td style="padding: 10px; text-align: left; border-bottom: 1px solid #ddd;">${fmt(summary.debtRev)}</td>
      </tr>
      <tr>
        <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #ddd;">المصروفات</td>
        <td style="padding: 10px; text-align: left; border-bottom: 1px solid #ddd; color: #dc3545;">${fmt(summary.totalExpenses)}</td>
      </tr>
      <tr style="background: #f0f0f0;">
        <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #ddd;">تكلفة المشروبات الساخنة (نسبة)</td>
        <td style="padding: 10px; text-align: left; border-bottom: 1px solid #ddd; color: #dc3545;">${fmt(summary.hotDrinksProrated)}</td>
      </tr>
      <tr style="background: ${summary.netProfit >= 0 ? "#d4edda" : "#f8d7da"};">
        <td style="padding: 12px; font-weight: bold; font-size: 16px;">صافي الربح</td>
        <td style="padding: 12px; text-align: left; font-weight: bold; font-size: 16px; color: ${summary.netProfit >= 0 ? "#155724" : "#721c24"};">${fmt(summary.netProfit)}</td>
      </tr>
    </table>
  </div>
  <div style="background: #f8f9fa; padding: 15px; text-align: center; font-size: 12px; color: #666;">
    مرفق ملف Excel بالتفاصيل الكاملة
  </div>
</div>
</body>
</html>`;
}

export interface DailyReportResult {
  success: boolean;
  message: string;
  date: string;
}

/** Generate and send the daily financial report email. Includes retry logic. */
export async function generateAndSendDailyReport(targetDate?: Date): Promise<DailyReportResult> {
  const now = targetDate ?? new Date();
  const fromDate = palestineStartOfDay(now);
  const toDate = palestineEndOfDay(now);
  const dateStr = formatPalestineDate(now);

  const recipients = (process.env.DAILY_REPORT_RECIPIENTS || "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  if (recipients.length === 0) {
    return { success: false, message: "No recipients configured (DAILY_REPORT_RECIPIENTS)", date: dateStr };
  }

  // Fetch summary data for the HTML body
  const [sessions, sales, expenses, bookings, courses, activeSubscriptions, pricingSettings] = await Promise.all([
    prisma.session.findMany({
      where: { checkIn: { gte: fromDate, lte: toDate }, checkOut: { not: null } },
      select: { sessionType: true, amount: true, paymentStatus: true, visitor: { select: { type: true } }, snackOrders: { select: { total: true } } },
    }),
    prisma.sale.findMany({
      where: { date: { gte: fromDate, lte: toDate } },
      select: { total: true },
    }),
    prisma.expense.findMany({
      where: { date: { gte: fromDate, lte: toDate } },
      select: { amount: true },
    }),
    prisma.booking.findMany({
      where: { startTime: { gte: fromDate, lte: toDate }, status: "confirmed" },
      select: { price: true },
    }),
    prisma.course.findMany({
      where: { startDate: { lte: toDate }, endDate: { gte: fromDate } },
      select: { id: true },
    }),
    prisma.subscription.findMany({
      where: { status: "active", endDate: { gte: new Date() } },
      select: { visitorId: true },
    }),
    prisma.settings.findFirst(),
  ]);

  const collectedDebts = await prisma.debt.findMany({
    where: { status: "collected", collectedAt: { gte: fromDate, lte: toDate } },
    select: { amount: true },
  });

  const sessionRev = r(
    sessions
      .filter((s) => s.paymentStatus === "paid")
      .reduce((sum, s) => {
        const snacksTotal = s.snackOrders.reduce((snackSum, o) => snackSum + Number(o.total), 0);
        return sum + (Number(s.amount) - snacksTotal);
      }, 0),
  );
  const saleRev = r(sales.reduce((sum, s) => sum + Number(s.total), 0));
  let courseRev = 0;
  if (courses.length > 0) {
    const trainees = await prisma.trainee.findMany({
      where: { courseId: { in: courses.map((c) => c.id) } },
      select: { amountPaid: true },
    });
    courseRev = r(trainees.reduce((sum, t) => sum + Number(t.amountPaid), 0));
  }
  const bookingRev = r(bookings.reduce((sum, b) => sum + Number(b.price), 0));
  const debtRev = r(collectedDebts.reduce((sum, d) => sum + Number(d.amount), 0));
  const totalExpenses = r(expenses.reduce((sum, e) => sum + Number(e.amount), 0));
  const monthlyHotDrinksCost = pricingSettings ? Number(pricingSettings.hotDrinksMonthlyCost) : 0;
  const daysInRange = Math.max(1, Math.ceil((toDate.getTime() - fromDate.getTime()) / 86400000));
  const hotDrinksProrated = r(monthlyHotDrinksCost * (daysInRange / 30));
  const totalRevenue = r(sessionRev + saleRev + courseRev + bookingRev + debtRev);
  const netProfit = r(totalRevenue - totalExpenses - hotDrinksProrated);

  const summary = {
    totalRevenue, sessionRev, saleRev, courseRev, bookingRev, debtRev,
    totalExpenses, hotDrinksProrated, netProfit,
    totalVisits: sessions.length,
    activeSubscribers: activeSubscriptions.length,
  };

  // Generate Excel buffer
  const xlsxBuffer = await generateReportBuffer(fromDate, toDate);
  const html = generateReportHtml(fromDate, toDate, summary);

  const subject = `التقرير المالي اليومي - ${dateStr}`;

  // Send with one retry
  const attemptSend = async (attempt: number): Promise<void> => {
    try {
      await sendMail({
        to: recipients,
        subject,
        html,
        attachments: [{
          filename: `daily_report_${dateStr}.xlsx`,
          content: xlsxBuffer,
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }],
      });
    } catch (err) {
      if (attempt < 2) {
        console.error(`[DailyReport] Email send attempt ${attempt} failed, retrying in 30s...`, err);
        await new Promise((resolve) => setTimeout(resolve, 30_000));
        return attemptSend(attempt + 1);
      }
      throw err;
    }
  };

  await attemptSend(1);
  console.log(`[DailyReport] Email sent successfully to ${recipients.join(", ")} for ${dateStr}`);
  return { success: true, message: "Daily report email sent", date: dateStr };
}

import { prisma } from "./prisma";

export interface RevenueBreakdown {
  hoursRevenue: number;
  snacksRevenue: number;
  hotDrinksRevenue: number;
  coursesRevenue: number;
  bookingRevenue: number;
  debtRevenue: number;
  totalRevenue: number;
  expensesTotal: number;
  hotDrinksCost: number;
  netProfit: number;
  totalDiscounts: number;
}

const r = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/**
 * Unified revenue calculation for any date range.
 * This is the single source of truth for revenue aggregation across the entire app.
 *
 * Formula (cash-basis):
 *   totalRevenue = hoursRevenue + snacksRevenue + hotDrinksRevenue
 *                + coursesRevenue + bookingRevenue + debtRevenue
 *   netProfit = totalRevenue - expensesTotal - hotDrinksCost
 *
 * Where:
 *   hoursRevenue     = sum(session.amount - snackOrders.total) for paid sessions only
 *   snacksRevenue    = sum(Sale.total) where isHotDrink === false
 *   hotDrinksRevenue = sum(Sale.total) where isHotDrink === true
 *   coursesRevenue   = sum(Trainee.amountPaid) for courses active in range (lump-sum)
 *   bookingRevenue   = sum(Booking.price) where status === "confirmed"
 *   debtRevenue      = sum(Debt.amount) where status === "collected"
 *   expensesTotal    = sum(Expense.amount)
 *   hotDrinksCost    = settings.hotDrinksMonthlyCost × (daysInRange / 30)
 */
export async function calculateRevenue(fromDate: Date, toDate: Date): Promise<RevenueBreakdown> {
  const [sessions, sales, expenses, bookings, courses, settings, collectedDebts] = await Promise.all([
    prisma.session.findMany({
      where: { checkIn: { gte: fromDate, lte: toDate }, checkOut: { not: null } },
      select: {
        amount: true,
        paymentStatus: true,
        discountAmount: true,
        snackOrders: { select: { total: true } },
      },
    }),
    prisma.sale.findMany({
      where: { date: { gte: fromDate, lte: toDate } },
      select: { total: true, isHotDrink: true },
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
    prisma.settings.findFirst(),
    prisma.debt.findMany({
      where: { status: "collected", collectedAt: { gte: fromDate, lte: toDate } },
      select: { amount: true, sessionId: true, sessionAmount: true, type: true },
    }),
  ]);

  // Split collected debts: session debts → hoursRevenue/snacksRevenue, manual debts → debtRevenue
  let debtHoursRevenue = 0;
  let debtSnacksRevenue = 0;
  let debtManualRevenue = 0;
  for (const d of collectedDebts) {
    const totalAmount = Number(d.amount);
    if (d.sessionId && d.sessionAmount != null) {
      const hoursPortion = Number(d.sessionAmount);
      const snacksPortion = totalAmount - hoursPortion;
      debtHoursRevenue += hoursPortion;
      debtSnacksRevenue += snacksPortion;
    } else {
      debtManualRevenue += totalAmount;
    }
  }

  // Hours revenue: only paid sessions, subtract snack portion + collected session debt hours portion.
  // IMPORTANT: This formula is intentionally identical to getHistorySummary().hoursRevenue
  // in sessions/service.ts. Both use: Σ(session.amount - snackOrders.total) for paid sessions.
  // Any change here must be mirrored in getHistorySummary() to keep daily/weekly reports consistent.
  const hoursRevenue = r(
    sessions.filter((s) => s.paymentStatus === "paid").reduce((sum, s) => {
      const snacksTotal = s.snackOrders.reduce((snackSum, o) => snackSum + Number(o.total), 0);
      return sum + (Number(s.amount) - snacksTotal);
    }, 0) + debtHoursRevenue
  );

  // Sales split: snacks vs hot drinks + collected session debt snacks portion
  const snacksRevenue = r(
    sales.filter((s) => !s.isHotDrink).reduce((sum, s) => sum + Number(s.total), 0) + debtSnacksRevenue
  );
  const hotDrinksRevenue = r(
    sales.filter((s) => s.isHotDrink).reduce((sum, s) => sum + Number(s.total), 0)
  );

  // Courses: lump-sum of trainee.amountPaid
  let coursesRevenue = 0;
  if (courses.length > 0) {
    const trainees = await prisma.trainee.findMany({
      where: { courseId: { in: courses.map((c) => c.id) } },
      select: { amountPaid: true },
    });
    coursesRevenue = r(trainees.reduce((sum, t) => sum + Number(t.amountPaid), 0));
  }

  // Bookings: confirmed only
  const bookingRevenue = r(
    bookings.reduce((sum, b) => sum + Number(b.price), 0)
  );

  // Debts: only manual/subscription debts (session debts already split above)
  const debtRevenue = r(debtManualRevenue);

  // Expenses
  const expensesTotal = r(
    expenses.reduce((sum, e) => sum + Number(e.amount), 0)
  );

  // Hot drinks cost (prorated monthly)
  const monthlyHotDrinksCost = settings ? Number(settings.hotDrinksMonthlyCost) : 0;
  const daysInRange = Math.max(1, Math.ceil((toDate.getTime() - fromDate.getTime()) / 86400000));
  const hotDrinksCost = r(monthlyHotDrinksCost * (daysInRange / 30));

  // Totals
  const totalRevenue = r(hoursRevenue + snacksRevenue + hotDrinksRevenue + coursesRevenue + bookingRevenue + debtRevenue);
  const netProfit = r(totalRevenue - expensesTotal - hotDrinksCost);

  // Discounts (already factored into hoursRevenue via reduced `amount`)
  const totalDiscounts = r(
    sessions.filter((s) => s.paymentStatus === "paid").reduce((sum, s) => sum + Number(s.discountAmount), 0)
  );

  return {
    hoursRevenue,
    snacksRevenue,
    hotDrinksRevenue,
    coursesRevenue,
    bookingRevenue,
    debtRevenue,
    totalRevenue,
    expensesTotal,
    hotDrinksCost,
    netProfit,
    totalDiscounts,
  };
}

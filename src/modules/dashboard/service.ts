import { prisma } from "../../lib/prisma";

const day = 86_400_000;

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function endOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}

// Shared revenue calculation for a single day
async function calcDayRevenue(date: Date): Promise<number> {
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);

  // 1. Session revenue: sum of session.amount where checkOut falls on this day
  const sessions = await prisma.session.findMany({
    where: {
      checkOut: { not: null, gte: dayStart, lte: dayEnd },
    },
    select: { amount: true },
  });
  const sessionRev = sessions.reduce((s, x) => s + Number(x.amount), 0);

  // 2. Sale revenue: sum of sale.total where date falls on this day
  const sales = await prisma.sale.findMany({
    where: { date: { gte: dayStart, lte: dayEnd } },
    select: { total: true },
  });
  const saleRev = sales.reduce((s, x) => s + Number(x.total), 0);

  // 3. Course revenue: pro-rata daily share of trainee.amountPaid
  //    (amountPaid is cumulative — divide by course duration to avoid
  //    counting the same payment on every active day)
  const activeCourses = await prisma.course.findMany({
    where: { startDate: { lte: dayEnd }, endDate: { gte: dayStart } },
    select: { id: true, startDate: true, endDate: true },
  });
  let courseRev = 0;
  if (activeCourses.length > 0) {
    const courseIds = activeCourses.map((c) => c.id);
    const trainees = await prisma.trainee.findMany({
      where: { courseId: { in: courseIds } },
      select: { amountPaid: true, courseId: true },
    });
    const paidByCourse = new Map<string, number>();
    for (const t of trainees) {
      paidByCourse.set(t.courseId, (paidByCourse.get(t.courseId) ?? 0) + Number(t.amountPaid));
    }
    for (const course of activeCourses) {
      const totalPaid = paidByCourse.get(course.id) ?? 0;
      if (totalPaid > 0) {
        const durationDays = Math.max(
          1,
          Math.round((new Date(course.endDate).getTime() - new Date(course.startDate).getTime()) / day),
        );
        courseRev += totalPaid / durationDays;
      }
    }
  }

  // 4. Booking revenue: sum of booking.price where confirmed and startTime falls on this day
  const bookings = await prisma.booking.findMany({
    where: {
      status: "confirmed",
      startTime: { gte: dayStart, lte: dayEnd },
    },
    select: { price: true },
  });
  const bookingRev = bookings.reduce((s, x) => s + Number(x.price), 0);

  // 5. Collected debt revenue (cash-basis): sum of amount where collectedAt falls on this day
  const debts = await prisma.debt.findMany({
    where: {
      status: "collected",
      collectedAt: { gte: dayStart, lte: dayEnd },
    },
    select: { amount: true },
  });
  const debtRev = debts.reduce((s, x) => s + Number(x.amount), 0);

  const total = Math.round((sessionRev + saleRev + courseRev + bookingRev + debtRev + Number.EPSILON) * 100) / 100;
  return total;
}

export class DashboardService {
  async getSummary() {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    // liveVisitorCount: sessions where checkOut is null
    const liveVisitorCount = await prisma.session.count({
      where: { checkOut: null },
    });

    // todayRevenue
    const todayRevenue = await calcDayRevenue(now);

    // todayVisitCount: sessions checked in today
    const todayVisitCount = await prisma.session.count({
      where: {
        checkIn: { gte: todayStart, lte: todayEnd },
      },
    });

    // activeCoursesToday: courses where today falls between startDate and endDate
    const activeCoursesToday = await prisma.course.count({
      where: {
        startDate: { lte: todayEnd },
        endDate: { gte: todayStart },
      },
    });

    // todayBookings: confirmed bookings for today
    const todayBookings = await prisma.booking.count({
      where: {
        status: "confirmed",
        startTime: { gte: todayStart, lte: todayEnd },
      },
    });

    // Alerts
    const alerts: any[] = [];

    // Low stock inventory items
    const lowStockItems = await prisma.$queryRaw`
      SELECT id, name, quantity, "alertThreshold"
      FROM "InventoryItem"
      WHERE quantity < "alertThreshold"
    `;
    for (const item of lowStockItems as any[]) {
      alerts.push({
        type: "low_stock",
        message: `Low stock: ${item.name} (${item.quantity}/${item.alertThreshold})`,
        itemId: item.id,
        quantity: item.quantity,
        threshold: item.alertThreshold,
      });
    }

    // Overdue/unpaid debts
    const unpaidDebts = await prisma.debt.findMany({
      where: { status: "unpaid" },
      select: { id: true, name: true, amount: true, createdAt: true },
    });
    for (const debt of unpaidDebts) {
      alerts.push({
        type: "unpaid_debt",
        message: `Unpaid debt: ${debt.name} - ${debt.amount}`,
        debtId: debt.id,
        amount: Number(debt.amount),
        createdAt: debt.createdAt,
      });
    }

    // Subscriptions expiring within 3 days
    const threeDaysFromNow = new Date(now.getTime() + 3 * day);
    const expiringSubs = await prisma.subscription.findMany({
      where: {
        status: "active",
        endDate: { gte: now, lte: threeDaysFromNow },
      },
      select: { id: true, visitorId: true, endDate: true },
    });
    for (const sub of expiringSubs) {
      alerts.push({
        type: "subscription_expiring",
        message: `Subscription expiring on ${sub.endDate.toISOString().slice(0, 10)}`,
        subscriptionId: sub.id,
        visitorId: sub.visitorId,
        endDate: sub.endDate,
      });
    }

    // Visitors needing follow-up (reuse Step 8 logic - default list count)
    const followUpCount = await prisma.$queryRaw`
      SELECT COUNT(*)::int as count
      FROM "Visitor" v
      LEFT JOIN LATERAL (
        SELECT s."checkIn"
        FROM "Session" s
        WHERE s."visitorId" = v.id
        ORDER BY s."checkIn" DESC
        LIMIT 1
      ) latest ON true
      WHERE v."type" IN ('visitor', 'subscriber')
        AND (v."followUpStatus" IS NULL OR v."followUpStatus" != 'opt_out')
        AND (v."followUpAt" IS NULL OR v."followUpAt" < ${new Date(now.getTime() - 30 * day)})
        AND (
          (latest."checkIn" IS NULL AND v."createdAt" < ${new Date(now.getTime() - 7 * day)})
          OR (latest."checkIn" IS NOT NULL AND latest."checkIn" < ${new Date(now.getTime() - 7 * day)})
        )
    `;
    const followUpNeedsCount = (followUpCount as any[])[0]?.count || 0;
    if (followUpNeedsCount > 0) {
      alerts.push({
        type: "follow_up_needed",
        message: `${followUpNeedsCount} visitor(s) need follow-up`,
        count: followUpNeedsCount,
      });
    }

    return {
      liveVisitorCount,
      todayRevenue,
      todayVisitCount,
      activeCoursesToday,
      todayBookings,
      alerts,
    };
  }

  async getRevenueTrend(days: number = 7) {
    const now = new Date();
    const results: { date: string; revenue: number }[] = [];

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * day);
      const revenue = await calcDayRevenue(d);
      const dateStr = startOfDay(d).toISOString().slice(0, 10);
      results.push({ date: dateStr, revenue });
    }

    return results;
  }
}

export const dashboardService = new DashboardService();

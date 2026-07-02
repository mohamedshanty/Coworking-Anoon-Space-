import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../lib/ApiError";
import { calculateSessionPricing } from "./pricing";
import { CheckInInput, UpdateSessionInput } from "./schema";

const DRINK_PRICES: Record<string, number> = {
  "قهوة": 6,
  "نسكافيه": 5,
  "شاي": 3,
  "كابتشينو": 8,
};

export class SessionsService {
  async visitorLookup(query: string) {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const visitors = await prisma.visitor.findMany({
      where: {
        name: { equals: trimmed, mode: "insensitive" },
      },
      include: {
        _count: { select: { sessions: true } },
      },
    });

    return visitors.map((v) => ({
      id: v.id,
      name: v.name,
      phone: v.phone,
      type: v.type,
      source: v.source,
      sessionCount: v._count.sessions,
    }));
  }

  async getLiveSessions() {
    const sessions = await prisma.session.findMany({
      where: { checkOut: null },
      include: {
        visitor: true,
        snackOrders: true,
      },
    });

    const settings = await prisma.settings.findFirst();
    if (!settings) {
      throw new ApiError(500, "Settings not initialized in database");
    }

    const activeSubscriptions = await prisma.subscription.findMany({
      where: { status: "active" },
    });

    return sessions.map((s) => {
      const hasActiveSub = activeSubscriptions.some(
        (sub) => sub.visitorId === s.visitorId
      );

      const effectiveType = s.sessionType ?? s.visitor.type;

      const pricing = calculateSessionPricing(
        s.checkIn,
        effectiveType,
        hasActiveSub,
        s.snackOrders,
        {
          hourlyRate: Number(settings.hourlyRate),
          fullDayPrice: Number(settings.fullDayPrice),
          fullDayThresholdHours: settings.fullDayThresholdHours,
        }
      );

      return {
        ...s,
        type: effectiveType,
        hours: pricing.hours,
        isSub: pricing.isSub,
        amount: pricing.totalAmount, // Dynamically computed active total amount (time + snacks)
      };
    });
  }

  async checkIn(data: CheckInInput) {
    let visitorId: string;

    if ("visitorId" in data) {
      const visitor = await prisma.visitor.findUnique({
        where: { id: data.visitorId },
      });
      if (!visitor) {
        throw new ApiError(404, "Visitor not found");
      }
      visitorId = visitor.id;
    } else {
      // Check if visitor with this phone already exists
      let visitor = await prisma.visitor.findFirst({
        where: { phone: data.phone },
      });
      if (!visitor) {
        visitor = await prisma.visitor.create({
          data: {
            name: data.name,
            phone: data.phone,
            type: data.type,
            source: "source" in data ? (data as { source?: string }).source ?? null : null,
          },
        });
      }
      visitorId = visitor.id;
    }

    // Check if visitor already has an active session
    const activeSession = await prisma.session.findFirst({
      where: { visitorId, checkOut: null },
    });
    if (activeSession) {
      throw new ApiError(400, "Visitor is already checked in");
    }

    const sessionType = "type" in data ? (data as { type?: string }).type ?? null : null;

    const session = await prisma.session.create({
      data: {
        visitorId,
        sessionType,
        checkIn: new Date(),
        amount: 0,
        paymentStatus: "full_debt",
        notes: "notes" in data ? (data as { notes?: string }).notes ?? null : null,
      },
      include: {
        visitor: true,
        snackOrders: true,
      },
    });

    // Update visitor's lastVisit
    await prisma.visitor.update({
      where: { id: visitorId },
      data: { lastVisit: new Date() },
    });

    return session;
  }

  async editSession(id: string, data: UpdateSessionInput) {
    const session = await prisma.session.findUnique({
      where: { id },
    });
    if (!session) {
      throw new ApiError(404, "Session not found");
    }

    const updated = await prisma.session.update({
      where: { id },
      data: {
        ...(data.checkIn ? { checkIn: new Date(data.checkIn) } : {}),
        ...(data.checkOut !== undefined
          ? { checkOut: data.checkOut ? new Date(data.checkOut) : null }
          : {}),
        ...(data.amount !== undefined ? { amount: data.amount } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(data.sessionType !== undefined ? { sessionType: data.sessionType } : {}),
        ...(data.paymentStatus ? { paymentStatus: data.paymentStatus } : {}),
        ...(data.paymentMethod !== undefined ? { paymentMethod: data.paymentMethod } : {}),
      },
      include: {
        visitor: true,
        snackOrders: true,
      },
    });

    return updated;
  }

  async checkout(id: string, paymentMethod: "cash" | "card" | "transfer") {
    const session = await prisma.session.findUnique({
      where: { id },
      include: { visitor: true, snackOrders: true },
    });
    if (!session) {
      throw new ApiError(404, "Session not found");
    }
    if (session.checkOut) {
      throw new ApiError(400, "Session is already checked out");
    }

    const settings = await prisma.settings.findFirst();
    if (!settings) {
      throw new ApiError(500, "Settings not initialized");
    }

    const activeSub = await prisma.subscription.findFirst({
      where: { visitorId: session.visitorId, status: "active" },
    });

    const effectiveType = session.sessionType ?? session.visitor.type;

    const pricing = calculateSessionPricing(
      session.checkIn,
      effectiveType,
      !!activeSub,
      session.snackOrders,
      {
        hourlyRate: Number(settings.hourlyRate),
        fullDayPrice: Number(settings.fullDayPrice),
        fullDayThresholdHours: settings.fullDayThresholdHours,
      }
    );

    const updated = await prisma.session.update({
      where: { id },
      data: {
        checkOut: new Date(),
        amount: pricing.totalAmount,
        paymentStatus: "paid",
        paymentMethod,
      },
      include: {
        visitor: true,
        snackOrders: true,
      },
    });

    return updated;
  }

  async checkoutUnpaid(id: string) {
    const session = await prisma.session.findUnique({
      where: { id },
      include: { visitor: true, snackOrders: true },
    });
    if (!session) {
      throw new ApiError(404, "Session not found");
    }
    if (session.checkOut) {
      throw new ApiError(400, "Session is already checked out");
    }

    const settings = await prisma.settings.findFirst();
    if (!settings) {
      throw new ApiError(500, "Settings not initialized");
    }

    const activeSub = await prisma.subscription.findFirst({
      where: { visitorId: session.visitorId, status: "active" },
    });

    const effectiveType = session.sessionType ?? session.visitor.type;

    const pricing = calculateSessionPricing(
      session.checkIn,
      effectiveType,
      !!activeSub,
      session.snackOrders,
      {
        hourlyRate: Number(settings.hourlyRate),
        fullDayPrice: Number(settings.fullDayPrice),
        fullDayThresholdHours: settings.fullDayThresholdHours,
      }
    );

    // Update Session
    const updated = await prisma.session.update({
      where: { id },
      data: {
        checkOut: new Date(),
        amount: pricing.totalAmount,
        paymentStatus: "full_debt",
        paymentMethod: null,
      },
      include: {
        visitor: true,
        snackOrders: true,
      },
    });

    // Create Debt Record
    await prisma.debt.create({
      data: {
        visitorId: session.visitorId,
        name: session.visitor.name,
        phone: session.visitor.phone,
        amount: pricing.totalAmount,
        type: "session",
        status: "unpaid",
        createdAt: new Date(),
      },
    });

    return updated;
  }

  async addOrder(sessionId: string, itemId: string, qty: number) {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { visitor: true },
    });
    if (!session) {
      throw new ApiError(404, "Session not found");
    }
    if (session.checkOut) {
      throw new ApiError(400, "Cannot add order to checked-out session");
    }

    let isHotDrink = false;
    let itemName = "";
    let total = 0;
    let dbItemId: string | null = null;
    let hotDrinkName: string | null = null;

    if (itemId.startsWith("hot-")) {
      isHotDrink = true;
      const drinkName = itemId.replace("hot-", "");
      const price = DRINK_PRICES[drinkName] || 5;
      itemName = drinkName;
      total = qty * price;
      hotDrinkName = drinkName;
      // dbItemId stays null — hot drinks are not inventory items
    } else {
      const item = await prisma.inventoryItem.findUnique({
        where: { id: itemId },
      });
      if (!item) {
        throw new ApiError(404, "Inventory item not found");
      }
      if (item.quantity < qty) {
        throw new ApiError(400, `Insufficient inventory stock for ${item.name}`);
      }

      // Deduct inventory
      await prisma.inventoryItem.update({
        where: { id: itemId },
        data: { quantity: item.quantity - qty },
      });

      itemName = item.name;
      total = qty * Number(item.sellPrice);
      dbItemId = itemId;
    }

    // Create SnackOrder record
    const order = await prisma.snackOrder.create({
      data: {
        sessionId,
        itemId: dbItemId,
        hotDrinkName,
        qty,
        total,
        isHotDrink,
      },
    });

    // Create Sale record
    const sale = await prisma.sale.create({
      data: {
        itemId: dbItemId ?? `hot-${hotDrinkName}`,
        itemName,
        quantity: qty,
        total,
        sessionId,
        linkedName: session.visitor.name,
        paymentMethod: "cash",
        isHotDrink,
        date: new Date(),
      },
    });

    return { order, sale };
  }

  async deleteSession(id: string) {
    const session = await prisma.session.findUnique({
      where: { id },
      include: { visitor: true },
    });
    if (!session) {
      throw new ApiError(404, "Session not found");
    }

    // Block delete if unpaid session debt exists for this visitor.
    // checkoutUnpaid creates a Debt (type: "session") referencing the Visitor, not the Session.
    // Deleting the session without resolving the debt would leave an orphaned financial record.
    const unpaidDebt = await prisma.debt.findFirst({
      where: {
        visitorId: session.visitorId,
        type: "session",
        status: "unpaid",
      },
    });
    if (unpaidDebt) {
      throw new ApiError(
        400,
        "Cannot delete session with an unpaid debt. Collect or delete the debt first."
      );
    }

    // SnackOrders cascade-delete via onDelete: Cascade on Session relation.
    // Sales have onDelete: SetNull — sessionId becomes null, sale records survive.
    return prisma.session.delete({
      where: { id },
    });
  }

  async getHistory(params: {
    from: string;
    to: string;
    type?: string;
    paymentStatus?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const fromDate = new Date(params.from);
    const toDate = new Date(params.to);
    toDate.setHours(23, 59, 59, 999);

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      throw new ApiError(400, "Invalid date format for 'from' or 'to'");
    }

    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 50));
    const skip = (page - 1) * limit;

    const where: Prisma.SessionWhereInput = {
      checkIn: { gte: fromDate, lte: toDate },
      checkOut: { not: null },
    };

    if (params.type) {
      where.OR = [
        { sessionType: params.type },
        { AND: [{ sessionType: null }, { visitor: { type: params.type as any } }] },
      ];
    }

    if (params.paymentStatus) {
      where.paymentStatus = params.paymentStatus as any;
    }

    if (params.search) {
      const searchTerm = params.search.trim();
      if (searchTerm) {
        const searchFilter: Prisma.SessionWhereInput = {
          OR: [
            { visitor: { name: { contains: searchTerm, mode: "insensitive" } } },
            { visitor: { phone: { contains: searchTerm, mode: "insensitive" } } },
          ],
        };
        if (where.AND) {
          (where.AND as Prisma.SessionWhereInput[]).push(searchFilter);
        } else {
          where.AND = [searchFilter];
        }
      }
    }

    const [sessions, total] = await Promise.all([
      prisma.session.findMany({
        where,
        include: { visitor: true, snackOrders: true },
        orderBy: { checkIn: "desc" },
        skip,
        take: limit,
      }),
      prisma.session.count({ where }),
    ]);

    const settings = await prisma.settings.findFirst();
    const activeSubscriptions = await prisma.subscription.findMany({
      where: { status: "active" },
    });

    const data = sessions.map((s) => {
      const hasActiveSub = activeSubscriptions.some(
        (sub) => sub.visitorId === s.visitorId
      );

      const effectiveType = s.sessionType ?? s.visitor.type;

      const hours = s.checkOut
        ? Math.round(((s.checkOut.getTime() - s.checkIn.getTime()) / 3600000) * 100) / 100
        : 0;

      const isSub =
        (effectiveType === "subscriber" && hasActiveSub) ||
        effectiveType === "trainee";

      return {
        id: s.id,
        visitorId: s.visitorId,
        sessionType: s.sessionType,
        checkIn: s.checkIn.toISOString(),
        checkOut: s.checkOut ? s.checkOut.toISOString() : null,
        amount: Number(s.amount),
        paymentStatus: s.paymentStatus,
        paymentMethod: s.paymentMethod,
        notes: s.notes,
        visitor: {
          id: s.visitor.id,
          name: s.visitor.name,
          phone: s.visitor.phone,
          type: s.visitor.type,
          source: s.visitor.source,
          lastVisit: s.visitor.lastVisit ? s.visitor.lastVisit.toISOString() : null,
          followUpStatus: s.visitor.followUpStatus,
          followUpAt: s.visitor.followUpAt ? s.visitor.followUpAt.toISOString() : null,
        },
        snackOrders: s.snackOrders.map((o) => ({
          id: o.id,
          sessionId: o.sessionId,
          itemId: o.itemId,
          hotDrinkName: o.hotDrinkName,
          qty: o.qty,
          total: Number(o.total),
          isHotDrink: o.isHotDrink,
        })),
        hours,
        isSub,
      };
    });

    return { sessions: data, total, page, limit };
  }

  async getHistorySummary(params: { from: string; to: string }) {
    const fromDate = new Date(params.from);
    const toDate = new Date(params.to);
    toDate.setHours(23, 59, 59, 999);

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      throw new ApiError(400, "Invalid date format for 'from' or 'to'");
    }

    const [sessions, sales, expenses, activeSubscriptions] = await Promise.all([
      prisma.session.findMany({
        where: {
          checkIn: { gte: fromDate, lte: toDate },
          checkOut: { not: null },
        },
        select: { sessionType: true, visitorId: true, paymentStatus: true, amount: true, visitor: { select: { type: true } } },
      }),
      prisma.sale.findMany({
        where: { date: { gte: fromDate, lte: toDate } },
        select: { total: true },
      }),
      prisma.expense.findMany({
        where: { date: { gte: fromDate, lte: toDate } },
        select: { amount: true },
      }),
      prisma.subscription.findMany({
        where: { status: "active" },
        select: { visitorId: true },
      }),
    ]);

    const r = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

    const visitCount = sessions.length;

    // Cash-basis: only count sessions where payment was actually collected
    const hoursRevenue = r(
      sessions
        .filter((s) => s.paymentStatus === "paid")
        .reduce((sum, s) => sum + Number(s.amount), 0)
    );

    const snacksRevenue = r(
      sales.reduce((sum, s) => sum + Number(s.total), 0)
    );

    const expensesTotal = r(
      expenses.reduce((sum, e) => sum + Number(e.amount), 0)
    );

    const netProfit = r(hoursRevenue + snacksRevenue - expensesTotal);

    const avgRevenuePerVisit = visitCount > 0 ? r(hoursRevenue / visitCount) : 0;

    const subscriberCount = sessions.filter(
      (s) =>
        (s.sessionType ?? s.visitor.type) === "subscriber" &&
        activeSubscriptions.some((sub) => sub.visitorId === s.visitorId)
    ).length;

    const subscriberRatio = visitCount > 0 ? r((subscriberCount / visitCount) * 100) : 0;

    return {
      visitCount,
      hoursRevenue,
      snacksRevenue,
      expenses: expensesTotal,
      netProfit,
      avgRevenuePerVisit,
      subscriberCount,
      subscriberRatio,
    };
  }
}

export const sessionsService = new SessionsService();

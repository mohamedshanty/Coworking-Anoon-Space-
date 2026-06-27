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

      const pricing = calculateSessionPricing(
        s.checkIn,
        s.visitor.type,
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

    const session = await prisma.session.create({
      data: {
        visitorId,
        checkIn: new Date(),
        amount: 0,
        paymentStatus: "full_debt",
      },
      include: {
        visitor: true,
        snackOrders: true,
      },
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

    const pricing = calculateSessionPricing(
      session.checkIn,
      session.visitor.type,
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

    const pricing = calculateSessionPricing(
      session.checkIn,
      session.visitor.type,
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

    if (itemId.startsWith("hot-")) {
      isHotDrink = true;
      const drinkName = itemId.replace("hot-", "");
      const price = DRINK_PRICES[drinkName] || 5;
      itemName = drinkName;
      total = qty * price;
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
    }

    // Create SnackOrder record
    const order = await prisma.snackOrder.create({
      data: {
        sessionId,
        itemId,
        qty,
        total,
        isHotDrink,
      },
    });

    // Create Sale record
    const sale = await prisma.sale.create({
      data: {
        itemId,
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
}

export const sessionsService = new SessionsService();

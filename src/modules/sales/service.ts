import { prisma } from "../../lib/prisma";
import { ApiError } from "../../lib/ApiError";
import { palestineStartOfDay, palestineEndOfDay } from "../../lib/timezone";
import {
  CreateSnackSaleInput,
  CreateOtherSaleInput,
  CreateBatchSaleInput,
  CreateHotDrinkSaleInput,
  UpdateSnackSaleInput,
  UpdateHotDrinkSaleInput,
} from "./schema";

async function getHotDrinkPrice(drinkName: string): Promise<number> {
  const hotDrink = await prisma.hotDrink.findFirst({
    where: { name: drinkName, isActive: true },
  });
  return hotDrink ? Number(hotDrink.price) : 0;
}

export class SalesService {
  async getSnackSales(params: { page?: number; limit?: number }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 25));
    const skip = (page - 1) * limit;
    const where = { isHotDrink: false };

    const [sales, total] = await Promise.all([
      prisma.sale.findMany({
        where,
        orderBy: { date: "desc" },
        skip,
        take: limit,
      }),
      prisma.sale.count({ where }),
    ]);

    const items = sales.map((sale) => ({
      ...sale,
      total: Math.round((Number(sale.total) + Number.EPSILON) * 100) / 100,
    }));

    return { items, total, page, limit };
  }

  async getHotDrinkSales(params: { page?: number; limit?: number }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 25));
    const skip = (page - 1) * limit;
    const where = { isHotDrink: true };

    const [sales, total] = await Promise.all([
      prisma.sale.findMany({
        where,
        orderBy: { date: "desc" },
        skip,
        take: limit,
      }),
      prisma.sale.count({ where }),
    ]);

    const items = sales.map((sale) => ({
      ...sale,
      total: Math.round((Number(sale.total) + Number.EPSILON) * 100) / 100,
    }));

    return { items, total, page, limit };
  }

  async createSnackSale(data: CreateSnackSaleInput) {
    const item = await prisma.inventoryItem.findUnique({
      where: { id: data.itemId },
    });
    if (!item) {
      throw new ApiError(404, "Inventory item not found");
    }

    if (item.quantity < data.quantity) {
      throw new ApiError(400, `Insufficient inventory stock for ${item.name}`);
    }

    // Validate session if provided
    let linkedName: string | null = null;
    let sessionId: string | null = null;

    if (data.sessionId) {
      const session = await prisma.session.findUnique({
        where: { id: data.sessionId },
        include: { visitor: true },
      });
      if (!session) {
        throw new ApiError(404, "Session not found");
      }
      if (session.checkOut !== null) {
        throw new ApiError(400, "Session is no longer active (already checked out)");
      }
      sessionId = session.id;
      linkedName = session.visitor.name;
    }

    // Deduct stock
    await prisma.inventoryItem.update({
      where: { id: data.itemId },
      data: { quantity: item.quantity - data.quantity },
    });

    const totalRaw = data.quantity * Number(item.sellPrice);
    const total = Math.round((totalRaw + Number.EPSILON) * 100) / 100;

    return prisma.sale.create({
      data: {
        itemId: data.itemId,
        itemName: item.name,
        quantity: data.quantity,
        total,
        paymentMethod: data.paymentMethod,
        isHotDrink: false,
        date: new Date(),
        customerName: data.customerName || null,
        notes: data.notes || null,
        ...(sessionId ? { sessionId, linkedName } : {}),
      },
    });
  }

  async createHotDrinkSale(data: CreateHotDrinkSaleInput) {
    const price = await getHotDrinkPrice(data.itemName);
    if (price === 0) {
      throw new ApiError(404, `Hot drink "${data.itemName}" not found or inactive`);
    }
    const total = Math.round((price + Number.EPSILON) * 100) / 100;

    return prisma.sale.create({
      data: {
        itemId: `hot-${data.itemName}`,
        itemName: data.itemName,
        quantity: 1,
        total,
        paymentMethod: data.paymentMethod,
        isHotDrink: true,
        date: new Date(),
        customerName: data.customerName || null,
        notes: data.notes || null,
      },
    });
  }

  async createOtherSale(data: CreateOtherSaleInput) {
    return prisma.sale.create({
      data: {
        itemId: null,
        itemName: "مصروفات أخرى",
        quantity: 1,
        total: data.amount,
        paymentMethod: data.paymentMethod,
        isHotDrink: false,
        date: new Date(),
        customerName: data.customerName || null,
        notes: data.notes || null,
      },
    });
  }

  async createBatchSale(data: CreateBatchSaleInput) {
    // Validate session if provided
    let linkedName: string | null = null;
    let sessionId: string | null = null;

    if (data.sessionId) {
      const session = await prisma.session.findUnique({
        where: { id: data.sessionId },
        include: { visitor: true },
      });
      if (!session) {
        throw new ApiError(404, "Session not found");
      }
      if (session.checkOut !== null) {
        throw new ApiError(400, "Session is no longer active (already checked out)");
      }
      sessionId = session.id;
      linkedName = session.visitor.name;
    }

    const results: any[] = [];

    await prisma.$transaction(async (tx) => {
      for (const item of data.items) {
        const invItem = await tx.inventoryItem.findUnique({
          where: { id: item.itemId },
        });
        if (!invItem) {
          throw new ApiError(404, `Inventory item "${item.itemId}" not found`);
        }
        if (invItem.quantity < item.quantity) {
          throw new ApiError(400, `Insufficient inventory stock for ${invItem.name}`);
        }

        await tx.inventoryItem.update({
          where: { id: item.itemId },
          data: { quantity: invItem.quantity - item.quantity },
        });

        const totalRaw = item.quantity * Number(invItem.sellPrice);
        const total = Math.round((totalRaw + Number.EPSILON) * 100) / 100;

        const sale = await tx.sale.create({
          data: {
            itemId: item.itemId,
            itemName: invItem.name,
            quantity: item.quantity,
            total,
            paymentMethod: data.paymentMethod,
            isHotDrink: false,
            date: new Date(),
            customerName: data.customerName || null,
            notes: data.notes || null,
            ...(sessionId ? { sessionId, linkedName } : {}),
          },
        });

        results.push(sale);
      }
    });

    return results;
  }

  async editSnackSale(id: string, data: UpdateSnackSaleInput) {
    const sale = await prisma.sale.findUnique({ where: { id } });
    if (!sale) throw new ApiError(404, "Sale not found");
    if (sale.isHotDrink) throw new ApiError(400, "Use hot drinks endpoint for hot drink sales");

    const oldQty = sale.quantity;
    const oldItemId = sale.itemId;
    const newQty = data.quantity ?? oldQty;
    const newItemId = data.itemId ?? oldItemId;

    // If quantity or item changed, adjust inventory stock
    if (newQty !== oldQty || newItemId !== oldItemId) {
      // Restore old item stock
      if (oldItemId) {
        const oldItem = await prisma.inventoryItem.findUnique({ where: { id: oldItemId } });
        if (oldItem) {
          await prisma.inventoryItem.update({
            where: { id: oldItemId },
            data: { quantity: oldItem.quantity + oldQty },
          });
        }
      }

      // Deduct new item stock
      if (newItemId) {
        const newItem = await prisma.inventoryItem.findUnique({ where: { id: newItemId } });
        if (!newItem) throw new ApiError(404, "New inventory item not found");
        if (newItem.quantity < newQty) {
          throw new ApiError(400, `Insufficient stock for ${newItem.name}`);
        }
        await prisma.inventoryItem.update({
          where: { id: newItemId },
          data: { quantity: newItem.quantity - newQty },
        });
      }
    }

    // Recalculate total from new item's sell price
    let total = Number(sale.total);
    if (newItemId && (data.quantity !== undefined || data.itemId !== undefined)) {
      const item = await prisma.inventoryItem.findUnique({ where: { id: newItemId } });
      if (item) {
        total = Math.round((newQty * Number(item.sellPrice) + Number.EPSILON) * 100) / 100;
      }
    }

    const itemName =
      newItemId !== oldItemId && newItemId
        ? (await prisma.inventoryItem.findUnique({ where: { id: newItemId } }))?.name ?? sale.itemName
        : sale.itemName;

    return prisma.sale.update({
      where: { id },
      data: {
        ...(data.itemId ? { itemId: data.itemId } : {}),
        ...(itemName !== sale.itemName ? { itemName } : {}),
        ...(data.quantity !== undefined ? { quantity: data.quantity } : {}),
        total,
        ...(data.paymentMethod ? { paymentMethod: data.paymentMethod } : {}),
        ...(data.customerName !== undefined ? { customerName: data.customerName || null } : {}),
        ...(data.notes !== undefined ? { notes: data.notes || null } : {}),
      },
    });
  }

  async deleteSnackSale(id: string) {
    const sale = await prisma.sale.findUnique({ where: { id } });
    if (!sale) throw new ApiError(404, "Sale not found");
    if (sale.isHotDrink) throw new ApiError(400, "Use hot drinks endpoint for hot drink sales");

    // Restore inventory stock that was deducted on creation
    if (sale.itemId) {
      const item = await prisma.inventoryItem.findUnique({ where: { id: sale.itemId } });
      if (item) {
        await prisma.inventoryItem.update({
          where: { id: sale.itemId },
          data: { quantity: item.quantity + sale.quantity },
        });
      }
    }

    return prisma.sale.delete({ where: { id } });
  }

  async editHotDrinkSale(id: string, data: UpdateHotDrinkSaleInput) {
    const sale = await prisma.sale.findUnique({ where: { id } });
    if (!sale) throw new ApiError(404, "Sale not found");
    if (!sale.isHotDrink) throw new ApiError(400, "Use snacks endpoint for snack sales");

    // Recalculate total if item name changed
    let total = Number(sale.total);
    if (data.itemName && data.itemName !== sale.itemName) {
      const price = await getHotDrinkPrice(data.itemName);
      if (price === 0) {
        throw new ApiError(404, `Hot drink "${data.itemName}" not found or inactive`);
      }
      total = Math.round((price + Number.EPSILON) * 100) / 100;
    }

    return prisma.sale.update({
      where: { id },
      data: {
        ...(data.itemName
          ? { itemName: data.itemName, itemId: `hot-${data.itemName}` }
          : {}),
        ...(data.paymentMethod ? { paymentMethod: data.paymentMethod } : {}),
        total,
        ...(data.customerName !== undefined ? { customerName: data.customerName || null } : {}),
        ...(data.notes !== undefined ? { notes: data.notes || null } : {}),
      },
    });
  }

  async deleteHotDrinkSale(id: string) {
    const sale = await prisma.sale.findUnique({ where: { id } });
    if (!sale) throw new ApiError(404, "Sale not found");
    if (!sale.isHotDrink) throw new ApiError(400, "Use snacks endpoint for snack sales");

    // Hot drinks have no inventory to restore
    return prisma.sale.delete({ where: { id } });
  }

  async getRevenueSummary(isHotDrink?: boolean) {
    const now = new Date();
    const todayStart = palestineStartOfDay(now);
    const todayEnd = palestineEndOfDay(now);

    // Palestine start of current month
    const monthStartParts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Hebron",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const year = parseInt(monthStartParts.find((p) => p.type === "year")!.value);
    const month = parseInt(monthStartParts.find((p) => p.type === "month")!.value);
    const monthStart = palestineStartOfDay(new Date(Date.UTC(year, month - 1, 1)));

    const where: any = {};
    if (isHotDrink !== undefined) {
      where.isHotDrink = isHotDrink;
    }

    const [todaySales, monthSales] = await Promise.all([
      prisma.sale.findMany({
        where: { ...where, date: { gte: todayStart, lte: todayEnd } },
        select: { total: true },
      }),
      prisma.sale.findMany({
        where: { ...where, date: { gte: monthStart, lte: now } },
        select: { total: true },
      }),
    ]);

    const r = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
    const todayRevenue = r(todaySales.reduce((sum, s) => sum + Number(s.total), 0));
    const monthRevenue = r(monthSales.reduce((sum, s) => sum + Number(s.total), 0));

    return { todayRevenue, monthRevenue };
  }
}

export const salesService = new SalesService();

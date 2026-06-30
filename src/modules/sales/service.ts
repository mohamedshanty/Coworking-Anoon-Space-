import { prisma } from "../../lib/prisma";
import { ApiError } from "../../lib/ApiError";
import { CreateSnackSaleInput, CreateHotDrinkSaleInput } from "./schema";

const DRINK_PRICES: Record<string, number> = {
  "قهوة": 6,
  "نسكافيه": 5,
  "شاي": 3,
  "كابتشينو": 8,
};

export class SalesService {
  async getSnackSales() {
    const sales = await prisma.sale.findMany({
      where: { isHotDrink: false },
      orderBy: { date: "desc" },
    });
    return sales.map((sale) => ({
      ...sale,
      total: Math.round((Number(sale.total) + Number.EPSILON) * 100) / 100,
    }));
  }

  async getHotDrinkSales() {
    const sales = await prisma.sale.findMany({
      where: { isHotDrink: true },
      orderBy: { date: "desc" },
    });
    return sales.map((sale) => ({
      ...sale,
      total: Math.round((Number(sale.total) + Number.EPSILON) * 100) / 100,
    }));
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
        ...(sessionId ? { sessionId, linkedName } : {}),
      },
    });
  }

  async createHotDrinkSale(data: CreateHotDrinkSaleInput) {
    const price = DRINK_PRICES[data.itemName] || 5;
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
      },
    });
  }
}

export const salesService = new SalesService();

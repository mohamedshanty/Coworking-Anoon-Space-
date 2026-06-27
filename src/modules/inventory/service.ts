import { prisma } from "../../lib/prisma";
import { ApiError } from "../../lib/ApiError";
import { CreateInventoryItemInput, UpdateInventoryItemInput } from "./schema";

export class InventoryService {
  async getInventory() {
    return prisma.inventoryItem.findMany({
      orderBy: { name: "asc" },
    });
  }

  async createItem(data: CreateInventoryItemInput) {
    const roundedCost = Math.round((data.costPrice + Number.EPSILON) * 100) / 100;
    const roundedSell = Math.round((data.sellPrice + Number.EPSILON) * 100) / 100;

    return prisma.inventoryItem.create({
      data: {
        name: data.name,
        quantity: data.quantity,
        costPrice: roundedCost,
        sellPrice: roundedSell,
        alertThreshold: data.alertThreshold,
        lastRestockDate: new Date(),
      },
    });
  }

  async editItem(id: string, data: UpdateInventoryItemInput) {
    const item = await prisma.inventoryItem.findUnique({
      where: { id },
    });
    if (!item) {
      throw new ApiError(404, "Inventory item not found");
    }

    const roundedCost =
      data.costPrice !== undefined
        ? Math.round((data.costPrice + Number.EPSILON) * 100) / 100
        : undefined;
    const roundedSell =
      data.sellPrice !== undefined
        ? Math.round((data.sellPrice + Number.EPSILON) * 100) / 100
        : undefined;

    return prisma.inventoryItem.update({
      where: { id },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.quantity !== undefined ? { quantity: data.quantity } : {}),
        ...(roundedCost !== undefined ? { costPrice: roundedCost } : {}),
        ...(roundedSell !== undefined ? { sellPrice: roundedSell } : {}),
        ...(data.alertThreshold !== undefined ? { alertThreshold: data.alertThreshold } : {}),
      },
    });
  }

  async restockItem(id: string, quantity: number) {
    const item = await prisma.inventoryItem.findUnique({
      where: { id },
    });
    if (!item) {
      throw new ApiError(404, "Inventory item not found");
    }

    return prisma.inventoryItem.update({
      where: { id },
      data: {
        quantity: item.quantity + quantity,
        lastRestockDate: new Date(),
      },
    });
  }

  async deleteItem(id: string) {
    const item = await prisma.inventoryItem.findUnique({
      where: { id },
    });
    if (!item) {
      throw new ApiError(404, "Inventory item not found");
    }

    return prisma.inventoryItem.delete({
      where: { id },
    });
  }
}

export const inventoryService = new InventoryService();

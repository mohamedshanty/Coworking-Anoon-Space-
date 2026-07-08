import { prisma } from "../../lib/prisma";
import { ApiError } from "../../lib/ApiError";
import { CreateDrinkInput, UpdateDrinkInput } from "./schema";

export class DrinksService {
  async getDrinks() {
    return prisma.drink.findMany({ orderBy: { name: "asc" } });
  }

  async createDrink(data: CreateDrinkInput) {
    const roundedSell = Math.round((data.sellPrice + Number.EPSILON) * 100) / 100;
    const roundedCost = Math.round((data.costPrice + Number.EPSILON) * 100) / 100;

    return prisma.drink.create({
      data: {
        name: data.name,
        quantity: data.quantity,
        unit: data.unit ?? "PIECE",
        sellPrice: roundedSell,
        costPrice: roundedCost,
        lastRestockDate: new Date(),
        alertThreshold: data.alertThreshold,
      },
    });
  }

  async editDrink(id: string, data: UpdateDrinkInput) {
    const existing = await prisma.drink.findUnique({ where: { id } });
    if (!existing) {
      throw new ApiError(404, "Drink not found");
    }

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.quantity !== undefined) updateData.quantity = data.quantity;
    if (data.unit !== undefined) updateData.unit = data.unit;
    if (data.sellPrice !== undefined) updateData.sellPrice = Math.round((data.sellPrice + Number.EPSILON) * 100) / 100;
    if (data.costPrice !== undefined) updateData.costPrice = Math.round((data.costPrice + Number.EPSILON) * 100) / 100;
    if (data.alertThreshold !== undefined) updateData.alertThreshold = data.alertThreshold;

    return prisma.drink.update({ where: { id }, data: updateData });
  }

  async restockDrink(id: string, quantity: number) {
    const existing = await prisma.drink.findUnique({ where: { id } });
    if (!existing) {
      throw new ApiError(404, "Drink not found");
    }

    return prisma.drink.update({
      where: { id },
      data: {
        quantity: existing.quantity + quantity,
        lastRestockDate: new Date(),
      },
    });
  }

  async deleteDrink(id: string) {
    const existing = await prisma.drink.findUnique({ where: { id } });
    if (!existing) {
      throw new ApiError(404, "Drink not found");
    }

    return prisma.drink.delete({ where: { id } });
  }
}

export const drinksService = new DrinksService();

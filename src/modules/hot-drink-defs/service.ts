import { prisma } from "../../lib/prisma";
import { ApiError } from "../../lib/ApiError";
import { CreateHotDrinkDefInput, UpdateHotDrinkDefInput } from "./schema";

export class HotDrinkDefsService {
  async getHotDrinks() {
    return prisma.hotDrink.findMany({ orderBy: { name: "asc" } });
  }

  async createHotDrink(data: CreateHotDrinkDefInput) {
    const roundedPrice = Math.round((data.price + Number.EPSILON) * 100) / 100;

    return prisma.hotDrink.create({
      data: {
        name: data.name,
        price: roundedPrice,
      },
    });
  }

  async updateHotDrink(id: string, data: UpdateHotDrinkDefInput) {
    const existing = await prisma.hotDrink.findUnique({ where: { id } });
    if (!existing) {
      throw new ApiError(404, "Hot drink not found");
    }

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.price !== undefined) updateData.price = Math.round((data.price + Number.EPSILON) * 100) / 100;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    return prisma.hotDrink.update({ where: { id }, data: updateData });
  }

  async deleteHotDrink(id: string) {
    const existing = await prisma.hotDrink.findUnique({ where: { id } });
    if (!existing) {
      throw new ApiError(404, "Hot drink not found");
    }

    // Guard: block deletion if there are existing sales for this drink
    const saleCount = await prisma.sale.count({
      where: { itemName: existing.name, isHotDrink: true },
    });
    if (saleCount > 0) {
      throw new ApiError(
        400,
        `Cannot delete "${existing.name}" — ${saleCount} sale record(s) exist. Deactivate it instead.`
      );
    }

    return prisma.hotDrink.delete({ where: { id } });
  }
}

export const hotDrinkDefsService = new HotDrinkDefsService();

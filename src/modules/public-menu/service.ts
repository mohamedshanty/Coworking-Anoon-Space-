import { prisma } from "../../lib/prisma";
import { ApiError } from "../../lib/ApiError";
import { CreatePublicOrderInput } from "./schema";

interface PublicMenuItem {
  id: string;
  type: "inventory" | "drink" | "hotdrink";
  name: string;
  price: number;
  stock: number | null;
  unit?: string;
}

export class PublicMenuService {
  async getPublicMenu(): Promise<PublicMenuItem[]> {
    const [inventoryItems, drinks, hotDrinks] = await Promise.all([
      prisma.inventoryItem.findMany({ orderBy: { name: "asc" } }),
      prisma.drink.findMany({ orderBy: { name: "asc" } }),
      prisma.hotDrink.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    ]);

    const menu: PublicMenuItem[] = [
      ...inventoryItems.map((item) => ({
        id: item.id,
        type: "inventory" as const,
        name: item.name,
        price: Number(item.sellPrice),
        stock: item.quantity,
      })),
      ...drinks.map((drink) => ({
        id: drink.id,
        type: "drink" as const,
        name: drink.name,
        price: Number(drink.sellPrice),
        stock: drink.quantity,
        unit: drink.unit,
      })),
      ...hotDrinks.map((hd) => ({
        id: hd.id,
        type: "hotdrink" as const,
        name: hd.name,
        price: Number(hd.price),
        stock: null,
      })),
    ];

    return menu;
  }

  async createPublicOrder(data: CreatePublicOrderInput) {
    return prisma.$transaction(async (tx) => {
      const sales: any[] = [];

      for (const line of data.items) {
        if (line.type === "inventory") {
          const item = await tx.inventoryItem.findUnique({ where: { id: line.id } });
          if (!item) {
            throw new ApiError(404, `Inventory item not found: ${line.id}`);
          }
          if (item.quantity < line.quantity) {
            throw new ApiError(400, `Insufficient stock: ${item.name}`);
          }

          await tx.inventoryItem.update({
            where: { id: line.id },
            data: { quantity: item.quantity - line.quantity },
          });

          const total = Math.round((line.quantity * Number(item.sellPrice) + Number.EPSILON) * 100) / 100;

          const sale = await tx.sale.create({
            data: {
              itemId: item.id,
              itemName: item.name,
              quantity: line.quantity,
              total,
              paymentMethod: "cash",
              isHotDrink: false,
              date: new Date(),
              customerName: data.customerName,
              notes: "Order from public menu page",
            },
          });
          sales.push(sale);
        } else if (line.type === "drink") {
          const drink = await tx.drink.findUnique({ where: { id: line.id } });
          if (!drink) {
            throw new ApiError(404, `Drink not found: ${line.id}`);
          }
          if (drink.quantity < line.quantity) {
            throw new ApiError(400, `Insufficient stock: ${drink.name}`);
          }

          await tx.drink.update({
            where: { id: line.id },
            data: { quantity: drink.quantity - line.quantity },
          });

          const total = Math.round((line.quantity * Number(drink.sellPrice) + Number.EPSILON) * 100) / 100;

          const sale = await tx.sale.create({
            data: {
              itemId: drink.id,
              itemName: drink.name,
              quantity: line.quantity,
              total,
              paymentMethod: "cash",
              isHotDrink: false,
              date: new Date(),
              customerName: data.customerName,
              notes: "Order from public menu page",
            },
          });
          sales.push(sale);
        } else if (line.type === "hotdrink") {
          const hotDrink = await tx.hotDrink.findUnique({ where: { id: line.id } });
          if (!hotDrink) {
            throw new ApiError(404, `Hot drink not found: ${line.id}`);
          }

          const total = Math.round((line.quantity * Number(hotDrink.price) + Number.EPSILON) * 100) / 100;

          const sale = await tx.sale.create({
            data: {
              itemId: null,
              itemName: hotDrink.name,
              quantity: line.quantity,
              total,
              paymentMethod: "cash",
              isHotDrink: true,
              date: new Date(),
              customerName: data.customerName,
              notes: "Order from public menu page",
            },
          });
          sales.push(sale);
        }
      }

      return sales;
    });
  }
}

export const publicMenuService = new PublicMenuService();

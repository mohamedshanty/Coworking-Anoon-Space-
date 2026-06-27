import { z } from "zod";

export const createSnackSaleSchema = z.object({
  itemId: z.string().min(1, "Item ID is required"),
  quantity: z.number().int().min(1, "Quantity must be at least 1"),
  paymentMethod: z.enum(["cash", "card", "transfer"]),
});

export const createHotDrinkSaleSchema = z.object({
  itemName: z.string().min(1, "Item name is required"),
  paymentMethod: z.enum(["cash", "card", "transfer"]),
});

export type CreateSnackSaleInput = z.infer<typeof createSnackSaleSchema>;
export type CreateHotDrinkSaleInput = z.infer<typeof createHotDrinkSaleSchema>;

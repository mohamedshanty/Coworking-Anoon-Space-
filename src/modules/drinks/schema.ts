import { z } from "zod";

export const drinkUnitEnum = z.enum(["PIECE", "OUNCE", "GRAM", "ML"]);
export type DrinkUnitValue = z.infer<typeof drinkUnitEnum>;

export const createDrinkSchema = z.object({
  name: z.string().min(1, "Name is required"),
  quantity: z.number().int().min(0),
  unit: drinkUnitEnum.default("PIECE"),
  sellPrice: z.number().min(0),
  costPrice: z.number().min(0),
  alertThreshold: z.number().int().min(0),
});

export const updateDrinkSchema = z.object({
  name: z.string().min(1).optional(),
  quantity: z.number().int().min(0).optional(),
  unit: drinkUnitEnum.optional(),
  sellPrice: z.number().min(0).optional(),
  costPrice: z.number().min(0).optional(),
  alertThreshold: z.number().int().min(0).optional(),
});

export const restockDrinkSchema = z.object({
  quantity: z.number().int().min(1, "Quantity must be at least 1"),
});

export type CreateDrinkInput = z.infer<typeof createDrinkSchema>;
export type UpdateDrinkInput = z.infer<typeof updateDrinkSchema>;
export type RestockDrinkInput = z.infer<typeof restockDrinkSchema>;

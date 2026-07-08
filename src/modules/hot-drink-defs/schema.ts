import { z } from "zod";

export const createHotDrinkDefSchema = z.object({
  name: z.string().min(1, "Name is required"),
  price: z.number().min(0, "Price must be at least 0"),
});

export const updateHotDrinkDefSchema = z.object({
  name: z.string().min(1).optional(),
  price: z.number().min(0).optional(),
  isActive: z.boolean().optional(),
});

export type CreateHotDrinkDefInput = z.infer<typeof createHotDrinkDefSchema>;
export type UpdateHotDrinkDefInput = z.infer<typeof updateHotDrinkDefSchema>;

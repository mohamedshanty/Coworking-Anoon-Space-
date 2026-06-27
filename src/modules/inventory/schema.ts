import { z } from "zod";

export const createInventoryItemSchema = z.object({
  name: z.string().min(1, "Name is required"),
  quantity: z.number().int().min(0),
  sellPrice: z.number().min(0),
  costPrice: z.number().min(0),
  alertThreshold: z.number().int().min(0),
});

export const updateInventoryItemSchema = z.object({
  name: z.string().min(1).optional(),
  quantity: z.number().int().min(0).optional(),
  sellPrice: z.number().min(0).optional(),
  costPrice: z.number().min(0).optional(),
  alertThreshold: z.number().int().min(0).optional(),
});

export const restockSchema = z.object({
  quantity: z.number().int().min(1, "Quantity must be at least 1"),
});

export type CreateInventoryItemInput = z.infer<typeof createInventoryItemSchema>;
export type UpdateInventoryItemInput = z.infer<typeof updateInventoryItemSchema>;
export type RestockInput = z.infer<typeof restockSchema>;

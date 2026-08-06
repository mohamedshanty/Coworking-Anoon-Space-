import { z } from "zod";

export const createSnackSaleSchema = z.object({
  itemId: z.string().min(1, "Item ID is required"),
  quantity: z.number().int().min(1, "Quantity must be at least 1"),
  paymentMethod: z.enum(["cash", "card", "transfer"]),
  sessionId: z.string().uuid("Session ID must be a valid UUID").optional(),
  customerName: z.string().optional(),
  notes: z.string().optional(),
});

export const createOtherSaleSchema = z.object({
  customerName: z.string().min(1, "اسم الشخص مطلوب"),
  amount: z.number().positive("المبلغ يجب أن يكون أكبر من صفر"),
  paymentMethod: z.enum(["cash", "card", "transfer"]),
  notes: z.string().optional(),
});

export const createBatchSaleSchema = z.object({
  items: z
    .array(
      z.object({
        itemId: z.string().min(1, "Item ID is required"),
        quantity: z.number().int().min(1, "Quantity must be at least 1"),
      }),
    )
    .min(1, "At least one item is required"),
  paymentMethod: z.enum(["cash", "card", "transfer"]),
  customerName: z.string().optional(),
  notes: z.string().optional(),
  sessionId: z.string().uuid("Session ID must be a valid UUID").optional(),
});

export const createHotDrinkSaleSchema = z.object({
  itemName: z.string().min(1, "Item name is required"),
  paymentMethod: z.enum(["cash", "card", "transfer"]),
  customerName: z.string().optional(),
  notes: z.string().optional(),
});

export const updateSnackSaleSchema = z.object({
  itemId: z.string().min(1).optional(),
  quantity: z.number().int().min(1).optional(),
  paymentMethod: z.enum(["cash", "card", "transfer"]).optional(),
  customerName: z.string().optional(),
  notes: z.string().optional(),
});

export const updateHotDrinkSaleSchema = z.object({
  itemName: z.string().min(1).optional(),
  paymentMethod: z.enum(["cash", "card", "transfer"]).optional(),
  customerName: z.string().optional(),
  notes: z.string().optional(),
});

export type CreateSnackSaleInput = z.infer<typeof createSnackSaleSchema>;
export type CreateOtherSaleInput = z.infer<typeof createOtherSaleSchema>;
export type CreateBatchSaleInput = z.infer<typeof createBatchSaleSchema>;
export type CreateHotDrinkSaleInput = z.infer<typeof createHotDrinkSaleSchema>;
export type UpdateSnackSaleInput = z.infer<typeof updateSnackSaleSchema>;
export type UpdateHotDrinkSaleInput = z.infer<typeof updateHotDrinkSaleSchema>;

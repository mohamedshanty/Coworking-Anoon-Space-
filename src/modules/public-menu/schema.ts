import { z } from "zod";

export const orderLineSchema = z.object({
  id: z.string().uuid("Item ID must be a valid UUID"),
  type: z.enum(["inventory", "drink", "hotdrink"]),
  quantity: z.number().int().min(1, "Quantity must be at least 1"),
});

export const createPublicOrderSchema = z.object({
  customerName: z.string().min(1, "Customer name is required").max(100),
  items: z.array(orderLineSchema).min(1, "At least one item is required"),
});

export type OrderLineInput = z.infer<typeof orderLineSchema>;
export type CreatePublicOrderInput = z.infer<typeof createPublicOrderSchema>;

import { z } from "zod";

export const createDebtSchema = z.object({
  visitorId: z.string().optional().nullable(),
  name: z.string().min(1, "Name is required"),
  phone: z.string().min(1, "Phone is required"),
  amount: z.number().min(0, "Amount must be positive"),
  type: z.enum(["session", "manual"]),
  createdAt: z.string().datetime(),
  note: z.string().optional().nullable(),
});

export const updateDebtSchema = z.object({
  visitorId: z.string().optional().nullable(),
  name: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  amount: z.number().min(0).optional(),
  status: z.enum(["unpaid", "collected"]).optional(),
  note: z.string().optional().nullable(),
});

export type CreateDebtInput = z.infer<typeof createDebtSchema>;
export type UpdateDebtInput = z.infer<typeof updateDebtSchema>;

import { z } from "zod";

export const createExpenseSchema = z.object({
  description: z.string().min(1, "Description is required"),
  category: z.enum(["electricity", "rent", "salaries", "maintenance", "marketing", "other"]),
  amount: z.number().min(0, "Amount must be positive"),
  date: z.string().datetime(),
  notes: z.string().optional().nullable(),
});

export const updateExpenseSchema = z.object({
  description: z.string().min(1).optional(),
  category: z.enum(["electricity", "rent", "salaries", "maintenance", "marketing", "other"]).optional(),
  amount: z.number().min(0).optional(),
  date: z.string().datetime().optional(),
  notes: z.string().optional().nullable(),
});

export const byCategoryQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;

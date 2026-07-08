import { z } from "zod";

export const createSubscriberSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().min(1, "Phone is required"),
  notes: z.string().optional(),
  packageType: z.enum(["monthly", "weekly", "half_month"]),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  dailyQuotaHours: z.number().int().min(0),
  amountPaid: z.number().min(0),
});

export const renewSubscriptionSchema = z.object({
  packageType: z.enum(["monthly", "weekly", "half_month"]),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  dailyQuotaHours: z.number().int().min(0),
  amountPaid: z.number().min(0),
});

export const updateSubscriberSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  notes: z.string().optional(),
  source: z.string().optional(),
  packageType: z.enum(["monthly", "weekly", "half_month"]).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  dailyQuotaHours: z.number().int().min(0).optional(),
  amountPaid: z.number().min(0).optional(),
  status: z.enum(["active", "expired", "paused", "renewing"]).optional(),
});

export type CreateSubscriberInput = z.infer<typeof createSubscriberSchema>;
export type RenewSubscriptionInput = z.infer<typeof renewSubscriptionSchema>;
export type UpdateSubscriberInput = z.infer<typeof updateSubscriberSchema>;

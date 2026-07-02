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
});

export type CreateSubscriberInput = z.infer<typeof createSubscriberSchema>;
export type RenewSubscriptionInput = z.infer<typeof renewSubscriptionSchema>;
export type UpdateSubscriberInput = z.infer<typeof updateSubscriberSchema>;

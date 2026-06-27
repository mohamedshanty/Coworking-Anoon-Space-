import { z } from "zod";

export const updateSettingsSchema = z.object({
  hourlyRate: z.number().min(0).optional(),
  fullDayPrice: z.number().min(0).optional(),
  fullDayThresholdHours: z.number().int().min(1).optional(),
  hotDrinksMonthlyCost: z.number().min(0).optional(),
  company: z
    .object({
      name: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      address: z.string().optional(),
    })
    .optional(),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

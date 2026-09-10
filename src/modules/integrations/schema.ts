import { z } from "zod";

export const anoonCheckInSchema = z.object({
  // Missing type = legacy Anoon QR payload → subscriber (backward compatible).
  type: z.enum(["visitor", "subscriber", "trainee", "employee"]).default("subscriber"),
  name: z.string().min(1),
  phone: z.string().min(1),
  // Only visitors may select a speed; all other types are forced to noon-10m
  // in the service layer regardless of what is sent here.
  internetSpeed: z.enum(["10M", "20M", "30M"]).optional(),
  routerProfile: z.string().optional(),
  source: z.string().optional(),
  clientCheckinId: z.string().optional(),
});

export type AnoonCheckInInput = z.infer<typeof anoonCheckInSchema>;

export const anoonVisitorCheckInSchema = z.object({
  phone: z.string().min(1),
  name: z.string().min(1),
});

export type AnoonVisitorCheckInInput = z.infer<typeof anoonVisitorCheckInSchema>;

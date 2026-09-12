import { z } from "zod";

export const anoonCheckInSchema = z.object({
  // Two-tab Anoon QR: "member" (backend resolves subscriber/trainee/
  // employee) or "visitor" (auto-created). The three legacy values are
  // still accepted and mapped to the member path for backward
  // compatibility with older kiosk builds. Missing type = legacy
  // payload → subscriber → member path.
  type: z.enum(["member", "visitor", "subscriber", "trainee", "employee"]).default("subscriber"),
  name: z.string().min(1),
  phone: z.string().min(1),
  // Only visitors may select a speed; members are forced to noon-10m
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

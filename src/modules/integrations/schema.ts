import { z } from "zod";

export const anoonCheckInSchema = z.object({
  phone: z.string().min(1),
  name: z.string().min(1),
});

export type AnoonCheckInInput = z.infer<typeof anoonCheckInSchema>;

export const anoonVisitorCheckInSchema = z.object({
  phone: z.string().min(1),
  name: z.string().min(1),
});

export type AnoonVisitorCheckInInput = z.infer<typeof anoonVisitorCheckInSchema>;

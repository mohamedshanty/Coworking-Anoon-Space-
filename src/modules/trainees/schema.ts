import { z } from "zod";

export const createTraineeSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().min(1, "Phone is required"),
  source: z.string().optional(),
  notes: z.string().optional(),
});

export const updateTraineeSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
});

export type CreateTraineeInput = z.infer<typeof createTraineeSchema>;
export type UpdateTraineeInput = z.infer<typeof updateTraineeSchema>;

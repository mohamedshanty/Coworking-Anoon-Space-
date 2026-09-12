import { z } from "zod";

export const createEmployeeSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().min(1, "Phone is required"),
});

export const updateEmployeeSchema = z.object({
  name: z.string().min(1).optional(),
  active: z.boolean().optional(),
});

export const listEmployeesQuerySchema = z.object({
  active: z.enum(["true", "false"]).optional(),
});

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;

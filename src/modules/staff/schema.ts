import { z } from "zod";

export const createStaffSchema = z.object({
  name: z.string().min(1, "Name is required"),
  username: z.string().min(1, "Username is required").regex(/^[a-zA-Z0-9_]+$/, "Username must be alphanumeric"),
  role: z.enum(["admin", "manager", "staff"]),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const updateStaffSchema = z.object({
  name: z.string().min(1).optional(),
  username: z.string().min(1).regex(/^[a-zA-Z0-9_]+$/).optional(),
  role: z.enum(["admin", "manager", "staff"]).optional(),
  password: z.string().min(6).optional(),
});

export type CreateStaffInput = z.infer<typeof createStaffSchema>;
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;

import { z } from "zod";

export const createTamkeenStudentSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().min(1, "Phone is required"),
  source: z.string().optional(),
  notes: z.string().optional(),
});

export const updateTamkeenStudentSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
});

export type CreateTamkeenStudentInput = z.infer<typeof createTamkeenStudentSchema>;
export type UpdateTamkeenStudentInput = z.infer<typeof updateTamkeenStudentSchema>;

// Bulk Excel import (validate-then-commit): flat name+phone roster, mirroring
// the trainees import. The frontend parses the .xlsx/.csv file and sends JSON
// rows here; the backend is the authority on phone normalization
// (hotspot normalizePhone) and cross-table uniqueness.
export const importTamkeenStudentRowSchema = z.object({
  name: z.string(),
  phone: z.string(),
  rowNumber: z.number().int().positive().optional(),
});

export const validateTamkeenStudentImportSchema = z.object({
  rows: z.array(importTamkeenStudentRowSchema).min(1, "No rows to import").max(1000),
});

export const commitTamkeenStudentImportSchema = z.object({
  rows: z.array(importTamkeenStudentRowSchema).min(1, "No rows to import").max(1000),
});

export type ImportTamkeenStudentRowInput = z.infer<typeof importTamkeenStudentRowSchema>;

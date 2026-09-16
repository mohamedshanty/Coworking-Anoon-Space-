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

// Bulk Excel import (validate-then-commit): flat name+phone roster, no
// course/batch field by design. The frontend parses the .xlsx/.csv file
// (reusing the contacts parse-import-file infrastructure) and sends JSON
// rows here; the backend is the authority on phone normalization
// (hotspot normalizePhone) and cross-table uniqueness.
export const importTraineeRowSchema = z.object({
  name: z.string(),
  phone: z.string(),
  rowNumber: z.number().int().positive().optional(),
});

export const validateTraineeImportSchema = z.object({
  rows: z.array(importTraineeRowSchema).min(1, "No rows to import").max(1000),
});

export const commitTraineeImportSchema = z.object({
  rows: z.array(importTraineeRowSchema).min(1, "No rows to import").max(1000),
});

export type ImportTraineeRowInput = z.infer<typeof importTraineeRowSchema>;

import { z } from "zod";

export const addNoteSchema = z.object({
  content: z.string().min(1, "Note content is required"),
});

export const updateVisitorSchema = z.object({
  followUpStatus: z.enum(["needs", "contacted", "opt_out"]).optional(),
  notes: z.string().optional(),
});

export type AddNoteInput = z.infer<typeof addNoteSchema>;
export type UpdateVisitorInput = z.infer<typeof updateVisitorSchema>;

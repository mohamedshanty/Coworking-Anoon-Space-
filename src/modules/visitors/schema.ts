import { z } from "zod";

export const addNoteSchema = z.object({
  content: z.string().min(1, "Note content is required"),
});

export const whatsappReplySchema = z.object({
  message: z.string().min(1, "Message is required"),
  aiReply: z.string().optional(),
  timestamp: z.string().datetime(),
});

export const updateVisitorSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  type: z.enum(["visitor", "subscriber", "trainee"]).optional(),
  source: z.string().optional(),
  followUpStatus: z.enum(["needs", "contacted", "opt_out"]).optional(),
  notes: z.string().optional(),
});

export type AddNoteInput = z.infer<typeof addNoteSchema>;
export type WhatsAppReplyInput = z.infer<typeof whatsappReplySchema>;
export type UpdateVisitorInput = z.infer<typeof updateVisitorSchema>;

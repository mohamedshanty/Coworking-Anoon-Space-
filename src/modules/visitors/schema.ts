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
  // `type` is intentionally NOT editable here — type changes go only through
  // the convert-type operation (with uniqueness checks), never raw PATCH.
  source: z.string().optional(),
  followUpStatus: z.enum(["needs", "contacted", "opt_out"]).optional(),
  notes: z.string().optional(),
});

export const convertTypeSchema = z.object({
  type: z.enum(["visitor", "subscriber", "trainee", "employee", "tamkeen"]),
  // Required when converting TO subscriber without a live subscription.
  // Mirrors the create-subscriber fields; the Subscription is created in the
  // same transaction, only on final confirmation.
  subscription: z
    .object({
      packageType: z.enum(["monthly", "weekly", "half_month"]),
      startDate: z.string().datetime(),
      endDate: z.string().datetime(),
      dailyQuotaHours: z.number().int().min(0),
      amountPaid: z.number().min(0),
      paymentType: z.enum(["full", "installment"]).optional(),
      totalFee: z.number().min(0).optional(),
    })
    .optional(),
});

export const mergePersonsSchema = z.object({
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
});

export type AddNoteInput = z.infer<typeof addNoteSchema>;
export type WhatsAppReplyInput = z.infer<typeof whatsappReplySchema>;
export type UpdateVisitorInput = z.infer<typeof updateVisitorSchema>;
export type ConvertTypeInput = z.infer<typeof convertTypeSchema>;
export type MergePersonsInput = z.infer<typeof mergePersonsSchema>;

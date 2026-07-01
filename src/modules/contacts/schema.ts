import { z } from "zod";

export const createContactSchema = z.object({
  fullName: z.string().min(1, "الاسم مطلوب"),
  phone: z.string().min(1, "رقم الجوال مطلوب"),
  notes: z.string().optional(),
});

export const updateContactSchema = z.object({
  fullName: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  notes: z.string().optional(),
});

export const importContactSchema = z.object({
  fullName: z.string().min(1),
  phone: z.string().min(1),
});

export const importContactsSchema = z.object({
  contacts: z.array(importContactSchema).min(1, "لا توجد بيانات للاستيراد"),
});

export type CreateContactInput = z.infer<typeof createContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;
export type ImportContactInput = z.infer<typeof importContactSchema>;
export type ImportContactsInput = z.infer<typeof importContactsSchema>;

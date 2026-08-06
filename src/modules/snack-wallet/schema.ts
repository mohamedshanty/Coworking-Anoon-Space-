import { z } from "zod";

export const createWalletSchema = z.object({
  visitorName: z.string().min(1, "اسم الزائر مطلوب"),
  phone: z.string().min(1, "رقم الجوال مطلوب"),
});

export const topUpSchema = z.object({
  amount: z.number().positive("المبلغ يجب أن يكون أكبر من صفر"),
});

export const walletLookupSchema = z.object({
  phone: z.string().min(1, "رقم الجوال مطلوب"),
});

export type CreateWalletInput = z.infer<typeof createWalletSchema>;
export type TopUpInput = z.infer<typeof topUpSchema>;

import { z } from "zod";

export const checkInSchema = z.union([
  z.object({
    visitorId: z.string().min(1),
    notes: z.string().optional(),
    hourlyRate: z.number().min(0).optional(),
  }),
  z.object({
    name: z.string().min(1),
    phone: z.string().min(1),
    type: z.enum(["visitor", "subscriber", "trainee"]),
    source: z.string().optional(),
    notes: z.string().optional(),
    hourlyRate: z.number().min(0).optional(),
  }),
]);

export const updateSessionSchema = z.object({
  checkIn: z.string().datetime().optional(),
  checkOut: z.string().datetime().nullable().optional(),
  amount: z.number().min(0).optional(),
  notes: z.string().nullable().optional(),
  sessionType: z.string().nullable().optional(),
  paymentStatus: z.enum(["paid", "partial_debt", "full_debt"]).optional(),
  paymentMethod: z.enum(["cash", "card", "transfer"]).nullable().optional(),
  hourlyRate: z.number().min(0).optional(),
  discountAmount: z.number().min(0).optional(),
  discountNote: z.string().optional(),
  paymentAccount: z.string().optional(),
  calculatedPrice: z.number().min(0).nullable().optional(),
  finalPrice: z.number().min(0).nullable().optional(),
  adjustmentNote: z.string().nullable().optional(),
  visitorName: z.string().optional(),
  visitorPhone: z.string().optional(),
});

export const checkoutSchema = z.object({
  paymentMethod: z.enum(["cash", "card", "transfer"]),
  discountAmount: z.number().min(0).default(0),
  discountNote: z.string().optional(),
  paymentAccount: z.string().optional(),
  adjustedPrice: z.number().min(0).nullable().optional(),
  adjustmentNote: z.string().nullable().optional(),
});

export const addOrderSchema = z.object({
  itemId: z.string().min(1),
  qty: z.number().int().min(1),
});

export type CheckInInput = z.infer<typeof checkInSchema>;
export type UpdateSessionInput = z.infer<typeof updateSessionSchema>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type AddOrderInput = z.infer<typeof addOrderSchema>;

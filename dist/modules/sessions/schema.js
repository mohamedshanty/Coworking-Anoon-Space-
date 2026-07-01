"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addOrderSchema = exports.checkoutSchema = exports.updateSessionSchema = exports.checkInSchema = void 0;
const zod_1 = require("zod");
exports.checkInSchema = zod_1.z.union([
    zod_1.z.object({
        visitorId: zod_1.z.string().min(1),
        notes: zod_1.z.string().optional(),
    }),
    zod_1.z.object({
        name: zod_1.z.string().min(1),
        phone: zod_1.z.string().min(1),
        type: zod_1.z.enum(["visitor", "subscriber", "trainee"]),
        source: zod_1.z.string().optional(),
        notes: zod_1.z.string().optional(),
    }),
]);
exports.updateSessionSchema = zod_1.z.object({
    checkIn: zod_1.z.string().datetime().optional(),
    checkOut: zod_1.z.string().datetime().nullable().optional(),
    amount: zod_1.z.number().min(0).optional(),
    paymentStatus: zod_1.z.enum(["paid", "partial_debt", "full_debt"]).optional(),
    paymentMethod: zod_1.z.enum(["cash", "card", "transfer"]).nullable().optional(),
});
exports.checkoutSchema = zod_1.z.object({
    paymentMethod: zod_1.z.enum(["cash", "card", "transfer"]),
});
exports.addOrderSchema = zod_1.z.object({
    itemId: zod_1.z.string().min(1),
    qty: zod_1.z.number().int().min(1),
});

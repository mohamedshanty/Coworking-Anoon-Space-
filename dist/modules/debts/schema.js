"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateDebtSchema = exports.createDebtSchema = void 0;
const zod_1 = require("zod");
exports.createDebtSchema = zod_1.z.object({
    visitorId: zod_1.z.string().optional().nullable(),
    name: zod_1.z.string().min(1, "Name is required"),
    phone: zod_1.z.string().min(1, "Phone is required"),
    amount: zod_1.z.number().min(0, "Amount must be positive"),
    type: zod_1.z.enum(["session", "manual"]),
    createdAt: zod_1.z.string().datetime(),
    note: zod_1.z.string().optional().nullable(),
});
exports.updateDebtSchema = zod_1.z.object({
    visitorId: zod_1.z.string().optional().nullable(),
    name: zod_1.z.string().min(1).optional(),
    phone: zod_1.z.string().min(1).optional(),
    amount: zod_1.z.number().min(0).optional(),
    status: zod_1.z.enum(["unpaid", "collected"]).optional(),
    note: zod_1.z.string().optional().nullable(),
});

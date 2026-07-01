"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateSubscriberSchema = exports.renewSubscriptionSchema = exports.createSubscriberSchema = void 0;
const zod_1 = require("zod");
exports.createSubscriberSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, "Name is required"),
    phone: zod_1.z.string().min(1, "Phone is required"),
    packageType: zod_1.z.enum(["monthly", "weekly"]),
    startDate: zod_1.z.string().datetime(),
    endDate: zod_1.z.string().datetime(),
    dailyQuotaHours: zod_1.z.number().int().min(0),
    amountPaid: zod_1.z.number().min(0),
});
exports.renewSubscriptionSchema = zod_1.z.object({
    packageType: zod_1.z.enum(["monthly", "weekly"]),
    startDate: zod_1.z.string().datetime(),
    endDate: zod_1.z.string().datetime(),
    dailyQuotaHours: zod_1.z.number().int().min(0),
    amountPaid: zod_1.z.number().min(0),
});
exports.updateSubscriberSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).optional(),
    phone: zod_1.z.string().min(1).optional(),
});

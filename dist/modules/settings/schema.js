"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateSettingsSchema = void 0;
const zod_1 = require("zod");
exports.updateSettingsSchema = zod_1.z.object({
    hourlyRate: zod_1.z.number().min(0).optional(),
    fullDayPrice: zod_1.z.number().min(0).optional(),
    fullDayThresholdHours: zod_1.z.number().int().min(1).optional(),
    hotDrinksMonthlyCost: zod_1.z.number().min(0).optional(),
    company: zod_1.z
        .object({
        name: zod_1.z.string().optional(),
        phone: zod_1.z.string().optional(),
        email: zod_1.z.string().optional(),
        address: zod_1.z.string().optional(),
    })
        .optional(),
});

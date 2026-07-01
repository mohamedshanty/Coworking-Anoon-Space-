"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.restockSchema = exports.updateInventoryItemSchema = exports.createInventoryItemSchema = void 0;
const zod_1 = require("zod");
exports.createInventoryItemSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, "Name is required"),
    quantity: zod_1.z.number().int().min(0),
    sellPrice: zod_1.z.number().min(0),
    costPrice: zod_1.z.number().min(0),
    alertThreshold: zod_1.z.number().int().min(0),
});
exports.updateInventoryItemSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).optional(),
    quantity: zod_1.z.number().int().min(0).optional(),
    sellPrice: zod_1.z.number().min(0).optional(),
    costPrice: zod_1.z.number().min(0).optional(),
    alertThreshold: zod_1.z.number().int().min(0).optional(),
});
exports.restockSchema = zod_1.z.object({
    quantity: zod_1.z.number().int().min(1, "Quantity must be at least 1"),
});

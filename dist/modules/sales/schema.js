"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createHotDrinkSaleSchema = exports.createSnackSaleSchema = void 0;
const zod_1 = require("zod");
exports.createSnackSaleSchema = zod_1.z.object({
    itemId: zod_1.z.string().min(1, "Item ID is required"),
    quantity: zod_1.z.number().int().min(1, "Quantity must be at least 1"),
    paymentMethod: zod_1.z.enum(["cash", "card", "transfer"]),
    sessionId: zod_1.z.string().uuid("Session ID must be a valid UUID").optional(),
});
exports.createHotDrinkSaleSchema = zod_1.z.object({
    itemName: zod_1.z.string().min(1, "Item name is required"),
    paymentMethod: zod_1.z.enum(["cash", "card", "transfer"]),
});

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.byCategoryQuerySchema = exports.updateExpenseSchema = exports.createExpenseSchema = void 0;
const zod_1 = require("zod");
exports.createExpenseSchema = zod_1.z.object({
    description: zod_1.z.string().min(1, "Description is required"),
    category: zod_1.z.enum(["electricity", "rent", "salaries", "maintenance", "marketing", "other"]),
    amount: zod_1.z.number().min(0, "Amount must be positive"),
    date: zod_1.z.string().datetime(),
    notes: zod_1.z.string().optional().nullable(),
});
exports.updateExpenseSchema = zod_1.z.object({
    description: zod_1.z.string().min(1).optional(),
    category: zod_1.z.enum(["electricity", "rent", "salaries", "maintenance", "marketing", "other"]).optional(),
    amount: zod_1.z.number().min(0).optional(),
    date: zod_1.z.string().datetime().optional(),
    notes: zod_1.z.string().optional().nullable(),
});
exports.byCategoryQuerySchema = zod_1.z.object({
    from: zod_1.z.string().datetime().optional(),
    to: zod_1.z.string().datetime().optional(),
});

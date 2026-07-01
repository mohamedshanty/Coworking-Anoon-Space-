"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.importContactsSchema = exports.importContactSchema = exports.updateContactSchema = exports.createContactSchema = void 0;
const zod_1 = require("zod");
exports.createContactSchema = zod_1.z.object({
    fullName: zod_1.z.string().min(1, "الاسم مطلوب"),
    phone: zod_1.z.string().min(1, "رقم الجوال مطلوب"),
    notes: zod_1.z.string().optional(),
});
exports.updateContactSchema = zod_1.z.object({
    fullName: zod_1.z.string().min(1).optional(),
    phone: zod_1.z.string().min(1).optional(),
    notes: zod_1.z.string().optional(),
});
exports.importContactSchema = zod_1.z.object({
    fullName: zod_1.z.string().min(1),
    phone: zod_1.z.string().min(1),
});
exports.importContactsSchema = zod_1.z.object({
    contacts: zod_1.z.array(exports.importContactSchema).min(1, "لا توجد بيانات للاستيراد"),
});

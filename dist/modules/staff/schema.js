"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateStaffSchema = exports.createStaffSchema = void 0;
const zod_1 = require("zod");
exports.createStaffSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, "Name is required"),
    username: zod_1.z.string().min(1, "Username is required").regex(/^[a-zA-Z0-9_]+$/, "Username must be alphanumeric"),
    role: zod_1.z.enum(["admin", "manager", "staff"]),
    password: zod_1.z.string().min(6, "Password must be at least 6 characters"),
});
exports.updateStaffSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).optional(),
    username: zod_1.z.string().min(1).regex(/^[a-zA-Z0-9_]+$/).optional(),
    role: zod_1.z.enum(["admin", "manager", "staff"]).optional(),
    password: zod_1.z.string().min(6).optional(),
});

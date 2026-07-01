"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.staffService = exports.StaffService = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const prisma_1 = require("../../lib/prisma");
const ApiError_1 = require("../../lib/ApiError");
const SALT_ROUNDS = 10;
const staffSelect = {
    id: true,
    name: true,
    username: true,
    role: true,
    failedAttempts: true,
    lockedUntil: true,
};
class StaffService {
    async getAll() {
        return prisma_1.prisma.staff.findMany({
            select: staffSelect,
            orderBy: { name: "asc" },
        });
    }
    async getById(id) {
        const staff = await prisma_1.prisma.staff.findUnique({
            where: { id },
            select: staffSelect,
        });
        if (!staff)
            throw new ApiError_1.ApiError(404, "Staff member not found");
        return staff;
    }
    async create(data) {
        const existing = await prisma_1.prisma.staff.findUnique({ where: { username: data.username } });
        if (existing)
            throw new ApiError_1.ApiError(409, "Username already exists");
        const passwordHash = await bcrypt_1.default.hash(data.password, SALT_ROUNDS);
        return prisma_1.prisma.staff.create({
            data: {
                name: data.name,
                username: data.username,
                role: data.role,
                passwordHash,
            },
            select: staffSelect,
        });
    }
    async update(id, data) {
        const staff = await prisma_1.prisma.staff.findUnique({ where: { id } });
        if (!staff)
            throw new ApiError_1.ApiError(404, "Staff member not found");
        if (data.username && data.username !== staff.username) {
            const dup = await prisma_1.prisma.staff.findUnique({ where: { username: data.username } });
            if (dup)
                throw new ApiError_1.ApiError(409, "Username already exists");
        }
        const updateData = {};
        if (data.name !== undefined)
            updateData.name = data.name;
        if (data.username !== undefined)
            updateData.username = data.username;
        if (data.role !== undefined)
            updateData.role = data.role;
        if (data.password !== undefined)
            updateData.passwordHash = await bcrypt_1.default.hash(data.password, SALT_ROUNDS);
        return prisma_1.prisma.staff.update({
            where: { id },
            data: updateData,
            select: staffSelect,
        });
    }
    async delete(id) {
        const staff = await prisma_1.prisma.staff.findUnique({ where: { id } });
        if (!staff)
            throw new ApiError_1.ApiError(404, "Staff member not found");
        return prisma_1.prisma.staff.delete({ where: { id }, select: staffSelect });
    }
}
exports.StaffService = StaffService;
exports.staffService = new StaffService();

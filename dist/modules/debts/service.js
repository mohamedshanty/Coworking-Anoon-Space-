"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.debtsService = exports.DebtsService = void 0;
const prisma_1 = require("../../lib/prisma");
const ApiError_1 = require("../../lib/ApiError");
class DebtsService {
    async getDebts() {
        return prisma_1.prisma.debt.findMany({
            orderBy: { createdAt: "desc" },
        });
    }
    async createDebt(data) {
        const roundedAmount = Math.round((data.amount + Number.EPSILON) * 100) / 100;
        return prisma_1.prisma.debt.create({
            data: {
                visitorId: data.visitorId || null,
                name: data.name,
                phone: data.phone,
                amount: roundedAmount,
                type: data.type,
                status: "unpaid",
                createdAt: new Date(data.createdAt),
                note: data.note || null,
            },
        });
    }
    async editDebt(id, data) {
        const debt = await prisma_1.prisma.debt.findUnique({
            where: { id },
        });
        if (!debt) {
            throw new ApiError_1.ApiError(404, "Debt not found");
        }
        const roundedAmount = data.amount !== undefined
            ? Math.round((data.amount + Number.EPSILON) * 100) / 100
            : undefined;
        return prisma_1.prisma.debt.update({
            where: { id },
            data: {
                visitorId: data.visitorId !== undefined ? data.visitorId : undefined,
                name: data.name ? data.name : undefined,
                phone: data.phone ? data.phone : undefined,
                amount: roundedAmount !== undefined ? roundedAmount : undefined,
                status: data.status ? data.status : undefined,
                note: data.note !== undefined ? data.note : undefined,
            },
        });
    }
    async deleteDebt(id) {
        const debt = await prisma_1.prisma.debt.findUnique({
            where: { id },
        });
        if (!debt) {
            throw new ApiError_1.ApiError(404, "Debt not found");
        }
        return prisma_1.prisma.debt.delete({
            where: { id },
        });
    }
    async collectDebt(id) {
        const debt = await prisma_1.prisma.debt.findUnique({
            where: { id },
        });
        if (!debt) {
            throw new ApiError_1.ApiError(404, "Debt not found");
        }
        if (debt.status === "collected") {
            throw new ApiError_1.ApiError(400, "Debt is already collected");
        }
        return prisma_1.prisma.debt.update({
            where: { id },
            data: {
                status: "collected",
                collectedAt: new Date(),
            },
        });
    }
}
exports.DebtsService = DebtsService;
exports.debtsService = new DebtsService();

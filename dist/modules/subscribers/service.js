"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.subscribersService = exports.SubscribersService = void 0;
const prisma_1 = require("../../lib/prisma");
const ApiError_1 = require("../../lib/ApiError");
class SubscribersService {
    async getSubscribers() {
        return prisma_1.prisma.visitor.findMany({
            where: { type: "subscriber" },
            include: {
                subscriptions: {
                    orderBy: { startDate: "desc" },
                },
            },
        });
    }
    async createSubscriber(data) {
        const roundedAmount = Math.round((data.amountPaid + Number.EPSILON) * 100) / 100;
        let visitor = await prisma_1.prisma.visitor.findFirst({
            where: { phone: data.phone },
        });
        if (visitor) {
            // Update existing visitor to subscriber type
            visitor = await prisma_1.prisma.visitor.update({
                where: { id: visitor.id },
                data: { type: "subscriber", name: data.name },
            });
        }
        else {
            visitor = await prisma_1.prisma.visitor.create({
                data: {
                    name: data.name,
                    phone: data.phone,
                    type: "subscriber",
                },
            });
        }
        const subscription = await prisma_1.prisma.subscription.create({
            data: {
                visitorId: visitor.id,
                packageType: data.packageType,
                startDate: new Date(data.startDate),
                endDate: new Date(data.endDate),
                dailyQuotaHours: data.dailyQuotaHours,
                daysUsed: 0,
                amountPaid: roundedAmount,
                status: "active",
            },
        });
        return { visitor, subscription };
    }
    async renewSubscription(visitorId, data) {
        const visitor = await prisma_1.prisma.visitor.findUnique({
            where: { id: visitorId },
        });
        if (!visitor) {
            throw new ApiError_1.ApiError(404, "Visitor not found");
        }
        const roundedAmount = Math.round((data.amountPaid + Number.EPSILON) * 100) / 100;
        // Find and expire previous active/paused subscriptions
        await prisma_1.prisma.subscription.updateMany({
            where: {
                visitorId,
                status: { in: ["active", "paused", "renewing"] },
            },
            data: { status: "expired" },
        });
        const newSub = await prisma_1.prisma.subscription.create({
            data: {
                visitorId,
                packageType: data.packageType,
                startDate: new Date(data.startDate),
                endDate: new Date(data.endDate),
                dailyQuotaHours: data.dailyQuotaHours,
                daysUsed: 0,
                amountPaid: roundedAmount,
                status: "active",
            },
        });
        return newSub;
    }
    async pauseSubscription(visitorId) {
        const visitor = await prisma_1.prisma.visitor.findUnique({
            where: { id: visitorId },
        });
        if (!visitor) {
            throw new ApiError_1.ApiError(404, "Visitor not found");
        }
        const activeSub = await prisma_1.prisma.subscription.findFirst({
            where: { visitorId, status: "active" },
        });
        if (!activeSub) {
            throw new ApiError_1.ApiError(404, "No active subscription found to pause");
        }
        const updated = await prisma_1.prisma.subscription.update({
            where: { id: activeSub.id },
            data: { status: "paused" },
        });
        return updated;
    }
    async updateSubscriber(visitorId, data) {
        const visitor = await prisma_1.prisma.visitor.findUnique({
            where: { id: visitorId },
        });
        if (!visitor) {
            throw new ApiError_1.ApiError(404, "Visitor not found");
        }
        const updated = await prisma_1.prisma.visitor.update({
            where: { id: visitorId },
            data: {
                ...(data.name ? { name: data.name } : {}),
                ...(data.phone ? { phone: data.phone } : {}),
            },
        });
        return updated;
    }
}
exports.SubscribersService = SubscribersService;
exports.subscribersService = new SubscribersService();

import { prisma } from "../../lib/prisma";
import { ApiError } from "../../lib/ApiError";
import { CreateSubscriberInput, RenewSubscriptionInput, UpdateSubscriberInput } from "./schema";

export class SubscribersService {
  async getSubscribers(params: { search?: string; page?: number; limit?: number }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 25));
    const skip = (page - 1) * limit;

    const where: any = { type: "subscriber" };
    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: "insensitive" } },
        { phone: { contains: params.search, mode: "insensitive" } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.visitor.findMany({
        where,
        include: {
          subscriptions: {
            orderBy: { startDate: "desc" },
          },
        },
        skip,
        take: limit,
      }),
      prisma.visitor.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async createSubscriber(data: CreateSubscriberInput) {
    const roundedAmount = Math.round((data.amountPaid + Number.EPSILON) * 100) / 100;

    let visitor = await prisma.visitor.findFirst({
      where: { phone: data.phone },
    });

    if (visitor) {
      // Check if this visitor already has a live (non-expired) subscription.
      // Uses the same status set as renewSubscription to stay consistent.
      const activeSub = await prisma.subscription.findFirst({
        where: {
          visitorId: visitor.id,
          status: { in: ["active", "paused", "renewing"] },
        },
      });
      if (activeSub) {
        throw new ApiError(
          409,
          `يوجد مشترك مسجل مسبقاً بنفس رقم الهاتف: ${visitor.name}`
        );
      }
      // Reactivation: visitor exists but has no live subscription — allow creating a new one.
      visitor = await prisma.visitor.update({
        where: { id: visitor.id },
        data: {
          type: "subscriber",
          name: data.name,
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
        },
      });
    } else {
      visitor = await prisma.visitor.create({
        data: {
          name: data.name,
          phone: data.phone,
          type: "subscriber",
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
        },
      });
    }

    const subscription = await prisma.subscription.create({
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

  async renewSubscription(visitorId: string, data: RenewSubscriptionInput) {
    const visitor = await prisma.visitor.findUnique({
      where: { id: visitorId },
    });
    if (!visitor) {
      throw new ApiError(404, "Visitor not found");
    }

    const roundedAmount = Math.round((data.amountPaid + Number.EPSILON) * 100) / 100;

    // Find and expire previous active/paused subscriptions
    await prisma.subscription.updateMany({
      where: {
        visitorId,
        status: { in: ["active", "paused", "renewing"] },
      },
      data: { status: "expired" },
    });

    const newSub = await prisma.subscription.create({
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

  async pauseSubscription(visitorId: string) {
    const visitor = await prisma.visitor.findUnique({
      where: { id: visitorId },
    });
    if (!visitor) {
      throw new ApiError(404, "Visitor not found");
    }

    const activeSub = await prisma.subscription.findFirst({
      where: { visitorId, status: "active" },
    });

    if (!activeSub) {
      throw new ApiError(404, "No active subscription found to pause");
    }

    const updated = await prisma.subscription.update({
      where: { id: activeSub.id },
      data: { status: "paused" },
    });

    return updated;
  }

  async updateSubscriber(visitorId: string, data: UpdateSubscriberInput) {
    const visitor = await prisma.visitor.findUnique({
      where: { id: visitorId },
    });
    if (!visitor) {
      throw new ApiError(404, "Visitor not found");
    }

    const updated = await prisma.visitor.update({
      where: { id: visitorId },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.phone ? { phone: data.phone } : {}),
        ...(data.notes !== undefined ? { notes: data.notes || null } : {}),
        ...(data.source !== undefined ? { source: data.source || null } : {}),
      },
    });

    return updated;
  }

  async deleteSubscriber(visitorId: string) {
    const visitor = await prisma.visitor.findUnique({
      where: { id: visitorId },
    });
    if (!visitor) {
      throw new ApiError(404, "Visitor not found");
    }
    if (visitor.type !== "subscriber") {
      throw new ApiError(400, "Visitor is not a subscriber");
    }

    // Cascade: Sessions (onDelete: Cascade), Subscriptions (onDelete: Cascade).
    // Debts: onDelete: SetNull — debts survive with visitorId nulled out.
    // This is acceptable: debts are financial records that should persist even after subscriber removal.
    return prisma.visitor.delete({
      where: { id: visitorId },
    });
  }
}

export const subscribersService = new SubscribersService();

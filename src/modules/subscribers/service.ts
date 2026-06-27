import { prisma } from "../../lib/prisma";
import { ApiError } from "../../lib/ApiError";
import { CreateSubscriberInput, RenewSubscriptionInput, UpdateSubscriberInput } from "./schema";

export class SubscribersService {
  async getSubscribers() {
    return prisma.visitor.findMany({
      where: { type: "subscriber" },
      include: {
        subscriptions: {
          orderBy: { startDate: "desc" },
        },
      },
    });
  }

  async createSubscriber(data: CreateSubscriberInput) {
    const roundedAmount = Math.round((data.amountPaid + Number.EPSILON) * 100) / 100;

    let visitor = await prisma.visitor.findFirst({
      where: { phone: data.phone },
    });

    if (visitor) {
      // Update existing visitor to subscriber type
      visitor = await prisma.visitor.update({
        where: { id: visitor.id },
        data: { type: "subscriber", name: data.name },
      });
    } else {
      visitor = await prisma.visitor.create({
        data: {
          name: data.name,
          phone: data.phone,
          type: "subscriber",
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
      },
    });

    return updated;
  }
}

export const subscribersService = new SubscribersService();

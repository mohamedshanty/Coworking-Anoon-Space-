import { prisma } from "../../lib/prisma";
import { ApiError } from "../../lib/ApiError";
import { CreateDebtInput, UpdateDebtInput, CollectPartialDebtInput } from "./schema";
import { palestineStartOfDay, palestineEndOfDay } from "../../lib/timezone";

export class DebtsService {
  async getDebts(params: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
    from?: string;
    to?: string;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 25));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (params.status === "unpaid" || params.status === "collected") {
      where.status = params.status;
    }

    if (params.search) {
      const s = params.search.trim();
      if (s) {
        where.OR = [
          { name: { contains: s, mode: "insensitive" } },
          { phone: { contains: s, mode: "insensitive" } },
        ];
      }
    }

    if (params.from || params.to) {
      where.createdAt = {};
      if (params.from) {
        const fromDate = palestineStartOfDay(new Date(params.from));
        if (!isNaN(fromDate.getTime())) where.createdAt.gte = fromDate;
      }
      if (params.to) {
        const toDate = palestineEndOfDay(new Date(params.to));
        if (!isNaN(toDate.getTime())) where.createdAt.lte = toDate;
      }
      if (Object.keys(where.createdAt).length === 0) delete where.createdAt;
    }

    const [items, total] = await Promise.all([
      prisma.debt.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: { subscription: true },
        skip,
        take: limit,
      }),
      prisma.debt.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async getOutstanding(params: { visitorId?: string; phone?: string }) {
    const { visitorId, phone } = params;
    if (!visitorId && !phone) {
      throw new ApiError(400, "visitorId or phone is required");
    }

    let phones: string[] = [];
    let vId: string | undefined = visitorId;

    if (visitorId) {
      const visitor = await prisma.visitor.findUnique({ where: { id: visitorId } });
      if (!visitor) throw new ApiError(404, "Visitor not found");
      phones.push(visitor.phone);
    }
    if (phone && !phones.includes(phone)) phones.push(phone);

    const orConditions: any[] = [];
    if (vId) orConditions.push({ visitorId: vId });
    for (const p of phones) orConditions.push({ phone: p });

    const debts = await prisma.debt.findMany({
      where: {
        status: "unpaid",
        OR: orConditions,
      },
      select: { id: true, amount: true },
    });

    const total = Math.round(
      (debts.reduce((sum, d) => sum + Number(d.amount), 0) + Number.EPSILON) * 100,
    ) / 100;

    return { total, count: debts.length };
  }

  async createDebt(data: CreateDebtInput) {
    const roundedAmount = Math.round((data.amount + Number.EPSILON) * 100) / 100;

    return prisma.debt.create({
      data: {
        visitorId: data.visitorId || null,
        subscriptionId: data.subscriptionId || null,
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

  async editDebt(id: string, data: UpdateDebtInput) {
    const debt = await prisma.debt.findUnique({
      where: { id },
    });
    if (!debt) {
      throw new ApiError(404, "Debt not found");
    }

    const roundedAmount =
      data.amount !== undefined
        ? Math.round((data.amount + Number.EPSILON) * 100) / 100
        : undefined;

    return prisma.debt.update({
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

  async deleteDebt(id: string) {
    const debt = await prisma.debt.findUnique({
      where: { id },
    });
    if (!debt) {
      throw new ApiError(404, "Debt not found");
    }

    return prisma.debt.delete({
      where: { id },
    });
  }

  async collectDebt(id: string) {
    const debt = await prisma.debt.findUnique({
      where: { id },
    });
    if (!debt) {
      throw new ApiError(404, "Debt not found");
    }
    if (debt.status === "collected") {
      throw new ApiError(400, "Debt is already collected");
    }

    const paidNow = Number(debt.amount);

    const result = await prisma.$transaction(async (tx) => {
      // Preserve the original amount so calculateRevenue() can count it as debtRevenue
      // on the collection day. The status field indicates collection, not amount=0.
      const updatedDebt = await tx.debt.update({
        where: { id },
        data: {
          status: "collected",
          collectedAt: new Date(),
        },
      });

      // Sync Subscription.amountPaid if this is a subscription debt
      if (debt.subscriptionId && paidNow > 0) {
        const sub = await tx.subscription.findUnique({ where: { id: debt.subscriptionId } });
        if (sub) {
          const newAmountPaid = Math.round((Number(sub.amountPaid) + paidNow + Number.EPSILON) * 100) / 100;
          await tx.subscription.update({
            where: { id: debt.subscriptionId },
            data: { amountPaid: newAmountPaid },
          });
        }
      }

      return updatedDebt;
    });

    return result;
  }

  async collectPartialDebt(id: string, data: CollectPartialDebtInput) {
    const debt = await prisma.debt.findUnique({
      where: { id },
    });
    if (!debt) {
      throw new ApiError(404, "Debt not found");
    }
    if (debt.status === "collected") {
      throw new ApiError(400, "Debt is already collected");
    }

    const paidAmount = Math.round((data.amount + Number.EPSILON) * 100) / 100;
    const currentAmount = Number(debt.amount);

    if (paidAmount > currentAmount) {
      throw new ApiError(400, "Payment amount exceeds remaining balance");
    }

    const newBalance = Math.round((currentAmount - paidAmount + Number.EPSILON) * 100) / 100;

    const result = await prisma.$transaction(async (tx) => {
      // If fully paid, mark as collected. Preserve original amount for revenue calculation.
      const updatedDebt = newBalance <= 0
        ? await tx.debt.update({
            where: { id },
            data: { status: "collected", collectedAt: new Date() },
          })
        : await tx.debt.update({
            where: { id },
            data: { amount: newBalance },
          });

      // Sync Subscription.amountPaid if this is a subscription debt
      if (debt.subscriptionId && paidAmount > 0) {
        const sub = await tx.subscription.findUnique({ where: { id: debt.subscriptionId } });
        if (sub) {
          const newAmountPaid = Math.round((Number(sub.amountPaid) + paidAmount + Number.EPSILON) * 100) / 100;
          await tx.subscription.update({
            where: { id: debt.subscriptionId },
            data: { amountPaid: newAmountPaid },
          });
        }
      }

      return updatedDebt;
    });

    return result;
  }
}

export const debtsService = new DebtsService();

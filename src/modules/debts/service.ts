import { prisma } from "../../lib/prisma";
import { ApiError } from "../../lib/ApiError";
import { CreateDebtInput, UpdateDebtInput } from "./schema";

export class DebtsService {
  async getDebts(params: { page?: number; limit?: number }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 25));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      prisma.debt.findMany({
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.debt.count(),
    ]);

    return { items, total, page, limit };
  }

  async createDebt(data: CreateDebtInput) {
    const roundedAmount = Math.round((data.amount + Number.EPSILON) * 100) / 100;

    return prisma.debt.create({
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

    return prisma.debt.update({
      where: { id },
      data: {
        status: "collected",
        collectedAt: new Date(),
      },
    });
  }
}

export const debtsService = new DebtsService();

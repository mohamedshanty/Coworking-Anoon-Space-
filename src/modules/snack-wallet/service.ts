import { prisma } from "../../lib/prisma";
import { ApiError } from "../../lib/ApiError";
import { CreateWalletInput, TopUpInput } from "./schema";

export class SnackWalletService {
  async getByPhone(phone: string) {
    return prisma.snackWallet.findUnique({
      where: { phone },
      include: { transactions: { orderBy: { createdAt: "desc" }, take: 10 } },
    });
  }

  async getById(id: string) {
    return prisma.snackWallet.findUnique({
      where: { id },
      include: { transactions: { orderBy: { createdAt: "desc" } } },
    });
  }

  async list(params: { page?: number; limit?: number; search?: string }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 25));
    const skip = (page - 1) * limit;

    const where = params.search
      ? {
          OR: [
            { visitorName: { contains: params.search, mode: "insensitive" as const } },
            { phone: { contains: params.search, mode: "insensitive" as const } },
          ],
        }
      : {};

    const [wallets, total] = await Promise.all([
      prisma.snackWallet.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.snackWallet.count({ where }),
    ]);

    return { wallets, total, page, limit };
  }

  async create(data: CreateWalletInput) {
    const existing = await prisma.snackWallet.findUnique({
      where: { phone: data.phone },
    });
    if (existing) {
      throw new ApiError(409, "محفظة بهذا الرقم موجودة مسبقاً");
    }

    return prisma.snackWallet.create({
      data: {
        visitorName: data.visitorName,
        phone: data.phone,
        balance: 0,
      },
    });
  }

  async topUp(id: string, data: TopUpInput) {
    const wallet = await prisma.snackWallet.findUnique({ where: { id } });
    if (!wallet) {
      throw new ApiError(404, "المحفظة غير موجودة");
    }

    const balanceBefore = Number(wallet.balance);
    const balanceAfter = balanceBefore + data.amount;

    return prisma.$transaction(async (tx) => {
      const updated = await tx.snackWallet.update({
        where: { id },
        data: { balance: balanceAfter },
      });

      const transaction = await tx.snackWalletTransaction.create({
        data: {
          walletId: id,
          type: "topup",
          amount: data.amount,
          balanceBefore,
          balanceAfter,
          description: `شحن المحفظة بـ ${data.amount} ₪`,
        },
      });

      return { wallet: updated, transaction };
    });
  }

  async deduct(walletId: string, amount: number, sessionId: string, description?: string) {
    const wallet = await prisma.snackWallet.findUnique({ where: { id: walletId } });
    if (!wallet) {
      throw new ApiError(404, "المحفظة غير موجودة");
    }

    if (Number(wallet.balance) < amount) {
      throw new ApiError(400, "رصيد غير كافٍ");
    }

    const balanceBefore = Number(wallet.balance);
    const balanceAfter = balanceBefore - amount;

    return prisma.$transaction(async (tx) => {
      const updated = await tx.snackWallet.update({
        where: { id: walletId },
        data: { balance: balanceAfter },
      });

      const transaction = await tx.snackWalletTransaction.create({
        data: {
          walletId,
          sessionId,
          type: "deduction",
          amount,
          balanceBefore,
          balanceAfter,
          description: description ?? null,
        },
      });

      return { wallet: updated, transaction };
    });
  }

  async getTransactions(walletId: string, params: { page?: number; limit?: number }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 50));
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      prisma.snackWalletTransaction.findMany({
        where: { walletId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.snackWalletTransaction.count({ where: { walletId } }),
    ]);

    return { transactions, total, page, limit };
  }

  async getWalletWithSessionInfo(visitorPhone: string, sessionId: string) {
    const wallet = await prisma.snackWallet.findUnique({
      where: { phone: visitorPhone },
    });
    if (!wallet) return null;

    const txn = await prisma.snackWalletTransaction.findFirst({
      where: { walletId: wallet.id, sessionId },
      orderBy: { createdAt: "desc" },
    });

    return { wallet, sessionTransaction: txn };
  }
}

export const snackWalletService = new SnackWalletService();

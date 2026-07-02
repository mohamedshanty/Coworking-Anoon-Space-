import { prisma } from "../../lib/prisma";
import { ApiError } from "../../lib/ApiError";
import { CreateExpenseInput, UpdateExpenseInput } from "./schema";

export class ExpensesService {
  async getExpenses(params: { page?: number; limit?: number }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 25));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      prisma.expense.findMany({
        orderBy: { date: "desc" },
        skip,
        take: limit,
      }),
      prisma.expense.count(),
    ]);

    return { items, total, page, limit };
  }

  async createExpense(data: CreateExpenseInput) {
    const roundedAmount = Math.round((data.amount + Number.EPSILON) * 100) / 100;

    return prisma.expense.create({
      data: {
        description: data.description,
        category: data.category,
        amount: roundedAmount,
        date: new Date(data.date),
        notes: data.notes || null,
      },
    });
  }

  async editExpense(id: string, data: UpdateExpenseInput) {
    const expense = await prisma.expense.findUnique({
      where: { id },
    });
    if (!expense) {
      throw new ApiError(404, "Expense not found");
    }

    const roundedAmount =
      data.amount !== undefined
        ? Math.round((data.amount + Number.EPSILON) * 100) / 100
        : undefined;

    return prisma.expense.update({
      where: { id },
      data: {
        ...(data.description ? { description: data.description } : {}),
        ...(data.category ? { category: data.category } : {}),
        ...(roundedAmount !== undefined ? { amount: roundedAmount } : {}),
        ...(data.date ? { date: new Date(data.date) } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      },
    });
  }

  async deleteExpense(id: string) {
    const expense = await prisma.expense.findUnique({
      where: { id },
    });
    if (!expense) {
      throw new ApiError(404, "Expense not found");
    }

    return prisma.expense.delete({
      where: { id },
    });
  }

  async getExpensesByCategory(from?: string, to?: string) {
    const where: any = {};
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to);
    }

    const expenses = await prisma.expense.findMany({ where });

    const categories = ["electricity", "rent", "salaries", "maintenance", "marketing", "other"];
    const totals: Record<string, number> = {};
    categories.forEach((cat) => {
      totals[cat] = 0;
    });

    expenses.forEach((exp) => {
      totals[exp.category] = (totals[exp.category] || 0) + Number(exp.amount);
    });

    return Object.entries(totals).map(([category, amount]) => ({
      category,
      total: Math.round((amount + Number.EPSILON) * 100) / 100,
    }));
  }
}

export const expensesService = new ExpensesService();

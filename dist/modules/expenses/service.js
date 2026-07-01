"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.expensesService = exports.ExpensesService = void 0;
const prisma_1 = require("../../lib/prisma");
const ApiError_1 = require("../../lib/ApiError");
class ExpensesService {
    async getExpenses() {
        return prisma_1.prisma.expense.findMany({
            orderBy: { date: "desc" },
        });
    }
    async createExpense(data) {
        const roundedAmount = Math.round((data.amount + Number.EPSILON) * 100) / 100;
        return prisma_1.prisma.expense.create({
            data: {
                description: data.description,
                category: data.category,
                amount: roundedAmount,
                date: new Date(data.date),
                notes: data.notes || null,
            },
        });
    }
    async editExpense(id, data) {
        const expense = await prisma_1.prisma.expense.findUnique({
            where: { id },
        });
        if (!expense) {
            throw new ApiError_1.ApiError(404, "Expense not found");
        }
        const roundedAmount = data.amount !== undefined
            ? Math.round((data.amount + Number.EPSILON) * 100) / 100
            : undefined;
        return prisma_1.prisma.expense.update({
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
    async deleteExpense(id) {
        const expense = await prisma_1.prisma.expense.findUnique({
            where: { id },
        });
        if (!expense) {
            throw new ApiError_1.ApiError(404, "Expense not found");
        }
        return prisma_1.prisma.expense.delete({
            where: { id },
        });
    }
    async getExpensesByCategory(from, to) {
        const where = {};
        if (from || to) {
            where.date = {};
            if (from)
                where.date.gte = new Date(from);
            if (to)
                where.date.lte = new Date(to);
        }
        const expenses = await prisma_1.prisma.expense.findMany({ where });
        const categories = ["electricity", "rent", "salaries", "maintenance", "marketing", "other"];
        const totals = {};
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
exports.ExpensesService = ExpensesService;
exports.expensesService = new ExpensesService();

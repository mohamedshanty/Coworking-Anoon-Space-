import { Request, Response, NextFunction } from "express";
import { expensesService } from "./service";
import { getParam } from "../../lib/getParam";
import { createExpenseSchema, updateExpenseSchema, byCategoryQuerySchema } from "./schema";

export class ExpensesController {
  async getExpenses(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
      const data = await expensesService.getExpenses({ page, limit });
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async createExpense(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = createExpenseSchema.parse(req.body);
      const data = await expensesService.createExpense(input);
      res.status(201).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async editExpense(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = getParam(req.params.id);
      const input = updateExpenseSchema.parse(req.body);
      const data = await expensesService.editExpense(id, input);
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteExpense(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = getParam(req.params.id);
      const data = await expensesService.deleteExpense(id);
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async getExpensesByCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Validate query params if they exist
      const query = byCategoryQuerySchema.parse(req.query);
      const data = await expensesService.getExpensesByCategory(query.from, query.to);
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const expensesController = new ExpensesController();

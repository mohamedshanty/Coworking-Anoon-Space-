import { Request, Response, NextFunction } from "express";
import { debtsService } from "./service";
import { getParam } from "../../lib/getParam";
import { createDebtSchema, updateDebtSchema } from "./schema";

export class DebtsController {
  async getDebts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
      const data = await debtsService.getDebts({ page, limit });
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async createDebt(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = createDebtSchema.parse(req.body);
      const data = await debtsService.createDebt(input);
      res.status(201).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async editDebt(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = getParam(req.params.id);
      const input = updateDebtSchema.parse(req.body);
      const data = await debtsService.editDebt(id, input);
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteDebt(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = getParam(req.params.id);
      const data = await debtsService.deleteDebt(id);
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async collectDebt(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = getParam(req.params.id);
      const data = await debtsService.collectDebt(id);
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const debtsController = new DebtsController();

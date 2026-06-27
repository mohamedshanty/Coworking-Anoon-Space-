import { Request, Response, NextFunction } from "express";
import { debtsService } from "./service";
import { createDebtSchema, updateDebtSchema } from "./schema";

export class DebtsController {
  async getDebts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await debtsService.getDebts();
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
      const { id } = req.params;
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
      const { id } = req.params;
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
      const { id } = req.params;
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

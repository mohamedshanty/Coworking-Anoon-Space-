import { Request, Response, NextFunction } from "express";
import { salesService } from "./service";
import {
  createSnackSaleSchema,
  createHotDrinkSaleSchema,
  updateSnackSaleSchema,
  updateHotDrinkSaleSchema,
} from "./schema";

export class SalesController {
  async getSnackSales(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
      const data = await salesService.getSnackSales({ page, limit });
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async getHotDrinkSales(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
      const data = await salesService.getHotDrinkSales({ page, limit });
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async createSnackSale(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = createSnackSaleSchema.parse(req.body);
      const data = await salesService.createSnackSale(input);
      res.status(201).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async createHotDrinkSale(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = createHotDrinkSaleSchema.parse(req.body);
      const data = await salesService.createHotDrinkSale(input);
      res.status(201).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async editSnackSale(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const input = updateSnackSaleSchema.parse(req.body);
      const data = await salesService.editSnackSale(id, input);
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteSnackSale(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const data = await salesService.deleteSnackSale(id);
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async editHotDrinkSale(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const input = updateHotDrinkSaleSchema.parse(req.body);
      const data = await salesService.editHotDrinkSale(id, input);
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteHotDrinkSale(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const data = await salesService.deleteHotDrinkSale(id);
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const salesController = new SalesController();

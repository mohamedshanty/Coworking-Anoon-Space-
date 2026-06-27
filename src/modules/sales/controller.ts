import { Request, Response, NextFunction } from "express";
import { salesService } from "./service";
import { createSnackSaleSchema, createHotDrinkSaleSchema } from "./schema";

export class SalesController {
  async getSnackSales(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await salesService.getSnackSales();
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
      const data = await salesService.getHotDrinkSales();
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
}

export const salesController = new SalesController();

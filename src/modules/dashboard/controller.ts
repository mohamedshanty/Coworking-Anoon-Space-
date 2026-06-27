import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { dashboardService } from "./service";

const revenueTrendQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional().default(7),
});

export class DashboardController {
  async getSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await dashboardService.getSummary();
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async getRevenueTrend(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = revenueTrendQuerySchema.parse(req.query);
      const data = await dashboardService.getRevenueTrend(parsed.days);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
}

export const dashboardController = new DashboardController();

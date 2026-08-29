import { Request, Response, NextFunction } from "express";
import { publicMenuService } from "./service";
import { createPublicOrderSchema } from "./schema";

export class PublicMenuController {
  async getMenu(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await publicMenuService.getPublicMenu();
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async postOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = createPublicOrderSchema.parse(req.body);
      const data = await publicMenuService.createPublicOrder(input);
      res.status(201).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const publicMenuController = new PublicMenuController();

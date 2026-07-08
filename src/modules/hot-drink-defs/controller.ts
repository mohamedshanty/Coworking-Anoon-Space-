import { Request, Response, NextFunction } from "express";
import { hotDrinkDefsService } from "./service";
import { createHotDrinkDefSchema, updateHotDrinkDefSchema } from "./schema";

export class HotDrinkDefsController {
  async getHotDrinks(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await hotDrinkDefsService.getHotDrinks();
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async createHotDrink(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = createHotDrinkDefSchema.parse(req.body);
      const data = await hotDrinkDefsService.createHotDrink(input);
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async updateHotDrink(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const input = updateHotDrinkDefSchema.parse(req.body);
      const data = await hotDrinkDefsService.updateHotDrink(id, input);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async deleteHotDrink(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const data = await hotDrinkDefsService.deleteHotDrink(id);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
}

export const hotDrinkDefsController = new HotDrinkDefsController();

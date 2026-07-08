import { Request, Response, NextFunction } from "express";
import { drinksService } from "./service";
import { createDrinkSchema, updateDrinkSchema, restockDrinkSchema } from "./schema";

export class DrinksController {
  async getDrinks(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await drinksService.getDrinks();
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async createDrink(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = createDrinkSchema.parse(req.body);
      const data = await drinksService.createDrink(input);
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async editDrink(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const input = updateDrinkSchema.parse(req.body);
      const data = await drinksService.editDrink(id, input);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async restockDrink(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const { quantity } = restockDrinkSchema.parse(req.body);
      const data = await drinksService.restockDrink(id, quantity);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async deleteDrink(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const data = await drinksService.deleteDrink(id);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
}

export const drinksController = new DrinksController();

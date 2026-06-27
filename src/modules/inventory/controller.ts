import { Request, Response, NextFunction } from "express";
import { inventoryService } from "./service";
import { createInventoryItemSchema, updateInventoryItemSchema, restockSchema } from "./schema";

export class InventoryController {
  async getInventory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await inventoryService.getInventory();
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async createItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = createInventoryItemSchema.parse(req.body);
      const data = await inventoryService.createItem(input);
      res.status(201).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async editItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const input = updateInventoryItemSchema.parse(req.body);
      const data = await inventoryService.editItem(id, input);
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async restockItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const { quantity } = restockSchema.parse(req.body);
      const data = await inventoryService.restockItem(id, quantity);
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const data = await inventoryService.deleteItem(id);
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const inventoryController = new InventoryController();

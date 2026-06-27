import { Request, Response, NextFunction } from "express";
import { staffService } from "./service";
import { createStaffSchema, updateStaffSchema } from "./schema";

export class StaffController {
  async getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await staffService.getAll();
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await staffService.getById(req.params.id);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = createStaffSchema.parse(req.body);
      const data = await staffService.create(input);
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = updateStaffSchema.parse(req.body);
      const data = await staffService.update(req.params.id, input);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await staffService.delete(req.params.id);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
}

export const staffController = new StaffController();

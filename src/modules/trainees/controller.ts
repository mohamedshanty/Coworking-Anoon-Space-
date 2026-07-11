import { Request, Response, NextFunction } from "express";
import { traineesService } from "./service";
import { createTraineeSchema, updateTraineeSchema } from "./schema";

export class TraineesController {
  async getTrainees(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const search = req.query.search as string | undefined;
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
      const data = await traineesService.getTrainees({ search, page, limit });
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async createTrainee(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = createTraineeSchema.parse(req.body);
      const visitor = await traineesService.createTrainee(input);
      res.status(201).json({ success: true, data: visitor });
    } catch (error) {
      next(error);
    }
  }

  async updateTrainee(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const input = updateTraineeSchema.parse(req.body);
      const visitor = await traineesService.updateTrainee(id, input);
      res.status(200).json({ success: true, data: visitor });
    } catch (error) {
      next(error);
    }
  }

  async deleteTrainee(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      await traineesService.deleteTrainee(id);
      res.status(200).json({ success: true });
    } catch (error) {
      next(error);
    }
  }
}

export const traineesController = new TraineesController();

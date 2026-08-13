import { Request, Response, NextFunction } from "express";
import { dailyNotesService } from "./service";

export class DailyNotesController {
  async listByDate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { date } = req.query;
      if (!date) {
        res.status(400).json({ success: false, message: "date query param is required (YYYY-MM-DD)" });
        return;
      }
      const data = await dailyNotesService.listByDate(date as string);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { date, content } = req.body;
      if (!date || !content) {
        res.status(400).json({ success: false, message: "date and content are required" });
        return;
      }
      const authorName = req.user?.name ?? "Unknown";
      const data = await dailyNotesService.create(content, authorName, date);
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      if (!req.user) {
        res.status(401).json({ success: false, message: "Not authenticated" });
        return;
      }
      const data = await dailyNotesService.delete(id, { name: req.user.name, role: req.user.role });
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
}

export const dailyNotesController = new DailyNotesController();

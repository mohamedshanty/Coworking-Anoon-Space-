import { Request, Response, NextFunction } from "express";
import { visitorsService } from "./service";
import { addNoteSchema, updateVisitorSchema } from "./schema";

export class VisitorsController {
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const data = await visitorsService.getById(id);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const input = updateVisitorSchema.parse(req.body);
      const data = await visitorsService.update(id, input);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async addNote(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const visitorId = req.params.id as string;
      const input = addNoteSchema.parse(req.body);
      const data = await visitorsService.addNote(visitorId, input);
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async deleteNote(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const noteId = req.params.noteId as string;
      const data = await visitorsService.deleteNote(noteId);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
}

export const visitorsController = new VisitorsController();

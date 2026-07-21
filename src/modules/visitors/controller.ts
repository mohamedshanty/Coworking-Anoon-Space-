import { Request, Response, NextFunction } from "express";
import { visitorsService } from "./service";
import { addNoteSchema, updateVisitorSchema, whatsappReplySchema } from "./schema";

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

  async getChurned(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const days = req.query.days ? Number(req.query.days) : 14;
      const data = await visitorsService.getChurned(days);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async addWhatsAppReply(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const visitorId = req.params.id as string;
      const input = whatsappReplySchema.parse(req.body);
      const data = await visitorsService.addWhatsAppReply(visitorId, input);
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async getByPhone(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const phone = req.params.phone as string;
      const data = await visitorsService.getByPhone(phone);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
}

export const visitorsController = new VisitorsController();

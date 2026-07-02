import { Request, Response, NextFunction } from "express";
import { contactsService } from "./service";
import { createContactSchema, updateContactSchema, importContactsSchema } from "./schema";

export class ContactsController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const search = req.query.search as string | undefined;
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
      const data = await contactsService.list({ search, page, limit });
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async search(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const q = (req.query.q as string) ?? "";
      const data = await contactsService.search(q);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async fuzzySearch(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const q = (req.query.q as string) ?? "";
      const data = await contactsService.fuzzySearch(q);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const data = await contactsService.getById(id);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = createContactSchema.parse(req.body);
      const data = await contactsService.create(input);
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const input = updateContactSchema.parse(req.body);
      const data = await contactsService.update(id, input);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      await contactsService.delete(id);
      res.status(204).json({ success: true });
    } catch (error) {
      next(error);
    }
  }

  async import(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = importContactsSchema.parse(req.body);
      const data = await contactsService.import(input.contacts);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
}

export const contactsController = new ContactsController();

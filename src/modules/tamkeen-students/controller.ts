import { Request, Response, NextFunction } from "express";
import { tamkeenStudentsService } from "./service";
import { commitTamkeenStudentImportSchema, createTamkeenStudentSchema, updateTamkeenStudentSchema, validateTamkeenStudentImportSchema } from "./schema";

export class TamkeenStudentsController {
  async getTamkeenStudents(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const search = req.query.search as string | undefined;
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
      const sortField = req.query.sortField as string | undefined;
      const sortDir = req.query.sortDir === "asc" || req.query.sortDir === "desc" ? req.query.sortDir as "asc" | "desc" : undefined;
      const data = await tamkeenStudentsService.getTamkeenStudents({ search, page, limit, sortField, sortDir });
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async createTamkeenStudent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = createTamkeenStudentSchema.parse(req.body);
      const visitor = await tamkeenStudentsService.createTamkeenStudent(input);
      res.status(201).json({ success: true, data: visitor });
    } catch (error) {
      next(error);
    }
  }

  async updateTamkeenStudent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const input = updateTamkeenStudentSchema.parse(req.body);
      const visitor = await tamkeenStudentsService.updateTamkeenStudent(id, input);
      res.status(200).json({ success: true, data: visitor });
    } catch (error) {
      next(error);
    }
  }

  async deleteTamkeenStudent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      await tamkeenStudentsService.deleteTamkeenStudent(id);
      res.status(200).json({ success: true });
    } catch (error) {
      next(error);
    }
  }

  async validateImport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = validateTamkeenStudentImportSchema.parse(req.body);
      const data = await tamkeenStudentsService.validateTamkeenStudentImport(input.rows);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async commitImport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = commitTamkeenStudentImportSchema.parse(req.body);
      const data = await tamkeenStudentsService.commitTamkeenStudentImport(input.rows);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
}

export const tamkeenStudentsController = new TamkeenStudentsController();

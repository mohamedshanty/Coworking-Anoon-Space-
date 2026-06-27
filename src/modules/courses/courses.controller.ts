// src/modules/courses/courses.controller.ts
import { Request, Response, NextFunction } from 'express';
import { CoursesService } from './courses.service';
import { z } from 'zod';

const courseSchema = z.object({
  name: z.string().min(1),
  trainer: z.string().min(1),
  startDate: z.string().refine((v) => !isNaN(Date.parse(v)), { message: 'Invalid startDate' }),
  endDate: z.string().refine((v) => !isNaN(Date.parse(v)), { message: 'Invalid endDate' }),
  sessionsCount: z.number().int().min(1),
  pricePerTrainee: z.number(),
  maxSeats: z.number().int().min(1),
  roomId: z.string(),
});

const traineeSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  amountPaid: z.number(),
  paymentStatus: z.enum(['full', 'installment']),
  attendancePercent: z.number().min(0).max(100),
});

export class CoursesController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = courseSchema.parse(req.body);
      const course = await new CoursesService().create({
        ...parsed,
        startDate: new Date(parsed.startDate),
        endDate: new Date(parsed.endDate),
      });
      res.status(201).json({ success: true, data: course });
    } catch (err) {
      next(err);
    }
  }

  static async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const courses = await new CoursesService().findAll();
      res.json({ success: true, data: courses });
    } catch (err) {
      next(err);
    }
  }

  static async getOne(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const course = await new CoursesService().findOne(id);
      if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
      res.json({ success: true, data: course });
    } catch (err) {
      next(err);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const parsed = courseSchema.partial().parse(req.body);
      const course = await new CoursesService().update(id, {
        ...parsed,
        ...(parsed.startDate ? { startDate: new Date(parsed.startDate as any) } : {}),
        ...(parsed.endDate ? { endDate: new Date(parsed.endDate as any) } : {}),
      });
      res.json({ success: true, data: course });
    } catch (err) {
      next(err);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      await new CoursesService().delete(id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }

  // Trainees endpoints
  static async getTrainees(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params; // course id
      const trainees = await new CoursesService().getTrainees(id);
      res.json({ success: true, data: trainees });
    } catch (err) {
      next(err);
    }
  }

  static async addTrainee(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params; // course id
      const parsed = traineeSchema.parse(req.body);
      const trainee = await new CoursesService().addTrainee(id, parsed);
      res.status(201).json({ success: true, data: trainee });
    } catch (err) {
      next(err);
    }
  }

  static async updateAttendance(req: Request, res: Response, next: NextFunction) {
    try {
      const { id, traineeId } = req.params;
      const attendanceSchema = z.object({
        attendancePercent: z.number().min(0).max(100),
      });
      const { attendancePercent } = attendanceSchema.parse(req.body);
      const trainee = await new CoursesService().updateAttendance(id, traineeId, attendancePercent);
      res.json({ success: true, data: trainee });
    } catch (err) {
      next(err);
    }
  }
}

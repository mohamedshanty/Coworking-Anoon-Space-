// src/modules/rooms/bookings.controller.ts
import { Request, Response, NextFunction } from 'express';
import { BookingsService } from './bookings.service';
import { z } from 'zod';

const bookingSchema = z.object({
  roomId: z.string(),
  bookerName: z.string().min(1),
  bookerPhone: z.string().min(1),
  purpose: z.string().min(1),
  startTime: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid startTime' }),
  endTime: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid endTime' }),
  price: z.number(),
  status: z.enum(['confirmed', 'pending', 'cancelled']),
});

export class BookingsController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = bookingSchema.parse(req.body);
      const booking = await new BookingsService().create({
        ...parsed,
        startTime: new Date(parsed.startTime),
        endTime: new Date(parsed.endTime),
      });
      res.status(201).json({ success: true, data: booking });
    } catch (err) {
      if (err.message === 'Conflict') {
        return res.status(409).json({ success: false, message: 'Booking time conflict' });
      }
      next(err);
    }
  }

  static async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const bookings = await new BookingsService().findAll();
      res.json({ success: true, data: bookings });
    } catch (err) {
      next(err);
    }
  }

  static async getOne(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const booking = await new BookingsService().findOne(id);
      if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
      res.json({ success: true, data: booking });
    } catch (err) {
      next(err);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const parsed = bookingSchema.partial().parse(req.body);
      const booking = await new BookingsService().update(id, {
        ...parsed,
        ...(parsed.startTime ? { startTime: new Date(parsed.startTime as any) } : {}),
        ...(parsed.endTime ? { endTime: new Date(parsed.endTime as any) } : {}),
      });
      res.json({ success: true, data: booking });
    } catch (err) {
      if (err.message === 'Conflict') {
        return res.status(409).json({ success: false, message: 'Booking time conflict' });
      }
      next(err);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      await new BookingsService().delete(id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }

  static async checkConflict(req: Request, res: Response, next: NextFunction) {
    try {
      const conflictQuerySchema = z.object({
        roomId: z.string().min(1),
        start: z.string().refine((val) => !isNaN(Date.parse(val)), { message: "Invalid start" }),
        end: z.string().refine((val) => !isNaN(Date.parse(val)), { message: "Invalid end" }),
        excludeId: z.string().optional(),
      });
      const parsed = conflictQuerySchema.parse(req.query);
      const conflict = await new BookingsService().findConflict(
        parsed.roomId,
        new Date(parsed.start),
        new Date(parsed.end),
        parsed.excludeId,
      );
      if (conflict) {
        return res.json({ success: true, conflict });
      }
      res.json({ success: true, conflict: null });
    } catch (err) {
      next(err);
    }
  }
}

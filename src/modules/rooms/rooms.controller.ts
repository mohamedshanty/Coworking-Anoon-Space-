// src/modules/rooms/rooms.controller.ts
import { Request, Response, NextFunction } from 'express';
import { RoomsService } from './rooms.service';
import { z } from 'zod';

const roomSchema = z.object({
  name: z.string().min(1),
});

export class RoomsController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = roomSchema.parse(req.body);
      const room = await new RoomsService().create(parsed);
      res.status(201).json({ success: true, data: room });
    } catch (err) {
      next(err);
    }
  }

  static async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const rooms = await new RoomsService().findAll();
      res.json({ success: true, data: rooms });
    } catch (err) {
      next(err);
    }
  }

  static async getOne(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const room = await new RoomsService().findOne(id);
      if (!room) return res.status(404).json({ success: false, message: 'Room not found' });
      res.json({ success: true, data: room });
    } catch (err) {
      next(err);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const parsed = roomSchema.partial().parse(req.body);
      const room = await new RoomsService().update(id, parsed);
      res.json({ success: true, data: room });
    } catch (err) {
      next(err);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      await new RoomsService().delete(id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
}

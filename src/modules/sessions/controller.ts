import { Request, Response, NextFunction } from "express";
import { sessionsService } from "./service";
import { checkInSchema, updateSessionSchema, checkoutSchema, addOrderSchema } from "./schema";

export class SessionsController {
  async getLiveSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await sessionsService.getLiveSessions();
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async checkIn(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = checkInSchema.parse(req.body);
      const session = await sessionsService.checkIn(input);

      // Socket broadcast
      const io = req.app.get("io");
      if (io) {
        io.emit("session:checked_in", session);
      }

      res.status(201).json({
        success: true,
        data: session,
      });
    } catch (error) {
      next(error);
    }
  }

  async editSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const input = updateSessionSchema.parse(req.body);
      const session = await sessionsService.editSession(id, input);

      res.status(200).json({
        success: true,
        data: session,
      });
    } catch (error) {
      next(error);
    }
  }

  async checkout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const { paymentMethod } = checkoutSchema.parse(req.body);
      const session = await sessionsService.checkout(id, paymentMethod);

      // Socket broadcast
      const io = req.app.get("io");
      if (io) {
        io.emit("session:checked_out", session);
      }

      res.status(200).json({
        success: true,
        data: session,
      });
    } catch (error) {
      next(error);
    }
  }

  async checkoutUnpaid(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const session = await sessionsService.checkoutUnpaid(id);

      // Socket broadcast
      const io = req.app.get("io");
      if (io) {
        io.emit("session:checked_out", session);
      }

      res.status(200).json({
        success: true,
        data: session,
      });
    } catch (error) {
      next(error);
    }
  }

  async addOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const { itemId, qty } = addOrderSchema.parse(req.body);
      const { order, sale } = await sessionsService.addOrder(id, itemId, qty);

      // Socket broadcast
      const io = req.app.get("io");
      if (io) {
        io.emit("session:order_added", { sessionId: id, order, sale });
      }

      res.status(201).json({
        success: true,
        order,
        sale,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const sessionsController = new SessionsController();

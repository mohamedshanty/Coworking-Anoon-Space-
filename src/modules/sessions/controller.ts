import { Request, Response, NextFunction } from "express";
import { sessionsService } from "./service";
import { checkInSchema, updateSessionSchema, checkoutSchema, addOrderSchema } from "./schema";

export class SessionsController {
  async visitorLookup(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const q = (req.query.q as string) ?? "";
      const data = await sessionsService.visitorLookup(q);
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

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
      const { paymentMethod, discountAmount, discountNote, paymentAccount, adjustedPrice, adjustmentNote } = checkoutSchema.parse(req.body);
      const session = await sessionsService.checkout(id, paymentMethod, discountAmount, discountNote, paymentAccount, adjustedPrice, adjustmentNote);

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

  async editOrderItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderId = req.params.orderId as string;
      const { itemId, qty } = req.body;
      const order = await sessionsService.editOrderItem(orderId, { itemId, qty });

      const io = req.app.get("io");
      if (io) {
        io.emit("session:order_added", { sessionId: order.sessionId, order });
      }

      res.status(200).json({ success: true, data: order });
    } catch (error) {
      next(error);
    }
  }

  async deleteOrderItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderId = req.params.orderId as string;
      const result = await sessionsService.deleteOrderItem(orderId);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async deleteSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const data = await sessionsService.deleteSession(id);
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async getHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { from, to, type, paymentStatus, search, page, limit, sortField, sortDir } = req.query;

      if (!from || !to) {
        res.status(400).json({ success: false, message: "'from' and 'to' query params are required" });
        return;
      }

      const data = await sessionsService.getHistory({
        from: from as string,
        to: to as string,
        type: type as string | undefined,
        paymentStatus: paymentStatus as string | undefined,
        search: search as string | undefined,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        sortField: sortField as string | undefined,
        sortDir: sortDir === "asc" || sortDir === "desc" ? sortDir : undefined,
      });

      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async getHistorySummary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { from, to } = req.query;

      if (!from || !to) {
        res.status(400).json({ success: false, message: "'from' and 'to' query params are required" });
        return;
      }

      const data = await sessionsService.getHistorySummary({
        from: from as string,
        to: to as string,
      });

      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
}

export const sessionsController = new SessionsController();

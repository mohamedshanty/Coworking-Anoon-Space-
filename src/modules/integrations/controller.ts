import { Request, Response, NextFunction } from "express";
import { integrationsService } from "./service";
import { anoonCheckInSchema, anoonVisitorCheckInSchema, guestQuickLoginSchema } from "./schema";

export class IntegrationsController {
  async anoonCheckIn(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = anoonCheckInSchema.parse(req.body);
      const result = await integrationsService.anoonCheckIn(input);

      if (!result.alreadyActive) {
        const io = req.app.get("io");
        if (io) {
          io.emit("session:checked_in", result.session);
        }
      }

      // `data` keeps the legacy shape (the session itself) so existing
      // clients keep working; person/plan/type are additive. `type` is the
      // resolved person type; requestedType/resolvedType tell the QR side
      // what was asked and what it resolved to.
      res.status(200).json({
        success: true,
        data: result.session,
        person: result.person,
        plan: result.plan,
        type: result.type,
        requestedType: result.requestedType,
        resolvedType: result.resolvedType,
        alreadyActive: result.alreadyActive,
      });
    } catch (error) {
      next(error);
    }
  }

  async anoonVisitorCheckIn(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = anoonVisitorCheckInSchema.parse(req.body);
      const result = await integrationsService.anoonVisitorCheckIn(input.phone, input.name);

      if (!result.alreadyActive) {
        const io = req.app.get("io");
        if (io) {
          io.emit("session:checked_in", result.session);
        }
      }

      res.status(200).json({
        success: true,
        data: { sessionId: result.session.id },
      });
    } catch (error) {
      next(error);
    }
  }

  async guestQuickLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = guestQuickLoginSchema.parse(req.body);
      const result = await integrationsService.guestQuickLogin(input);
      // Deliberately NO session/person/plan payload and NO socket.io emit:
      // guests are invisible to Live, attendance, and reports by design.
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
}

export const integrationsController = new IntegrationsController();

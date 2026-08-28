import { Request, Response, NextFunction } from "express";
import { integrationsService } from "./service";
import { anoonCheckInSchema, anoonVisitorCheckInSchema } from "./schema";

export class IntegrationsController {
  async anoonCheckIn(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = anoonCheckInSchema.parse(req.body);
      const result = await integrationsService.anoonCheckIn(input.phone);

      if (!result) {
        console.warn(
          `[AnoonCheckIn] No visitor found for phone=${input.phone} (name=${input.name}) at ${new Date().toISOString()} — not auto-creating; review Anoon QR subscriber sync/backfill`
        );
        res.status(404).json({
          success: false,
          message: "Visitor not found",
        });
        return;
      }

      if (!result.alreadyActive) {
        const io = req.app.get("io");
        if (io) {
          io.emit("session:checked_in", result.session);
        }
      }

      res.status(200).json({
        success: true,
        data: result.session,
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
}

export const integrationsController = new IntegrationsController();

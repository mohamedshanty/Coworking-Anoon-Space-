import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { followUpService } from "./service";
import { getParam } from "../../lib/getParam";

const followUpQuerySchema = z.object({
  showAll: z.enum(["true", "false"]).optional(),
});

export class FollowUpController {
  async getFollowUpList(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = followUpQuerySchema.parse(req.query);
      const showAll = parsed.showAll === "true";
      const data = await followUpService.getFollowUpList(showAll);
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async markContacted(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const visitorId = getParam(req.params.visitorId, 'visitorId');
      const data = await followUpService.markContacted(visitorId);
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async optOut(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const visitorId = getParam(req.params.visitorId, 'visitorId');
      const data = await followUpService.optOut(visitorId);
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const followUpController = new FollowUpController();

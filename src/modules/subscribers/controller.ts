import { Request, Response, NextFunction } from "express";
import { subscribersService } from "./service";
import { createSubscriberSchema, renewSubscriptionSchema, updateSubscriberSchema } from "./schema";

export class SubscribersController {
  async getSubscribers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const search = req.query.search as string | undefined;
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
      const data = await subscribersService.getSubscribers({ search, page, limit });
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async createSubscriber(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = createSubscriberSchema.parse(req.body);
      const result = await subscribersService.createSubscriber(input);
      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async renewSubscription(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const input = renewSubscriptionSchema.parse(req.body);
      const data = await subscribersService.renewSubscription(id, input);
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async pauseSubscription(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const data = await subscribersService.pauseSubscription(id);
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateSubscriber(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const input = updateSubscriberSchema.parse(req.body);
      const data = await subscribersService.updateSubscriber(id, input);
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteSubscriber(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const data = await subscribersService.deleteSubscriber(id);
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const subscribersController = new SubscribersController();

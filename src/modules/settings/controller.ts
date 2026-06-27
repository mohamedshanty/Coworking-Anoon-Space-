import { Request, Response, NextFunction } from "express";
import { settingsService } from "./service";
import { updateSettingsSchema } from "./schema";

export class SettingsController {
  async getSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await settingsService.getSettings();
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async updateSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = updateSettingsSchema.parse(req.body);
      const data = await settingsService.updateSettings(input);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
}

export const settingsController = new SettingsController();

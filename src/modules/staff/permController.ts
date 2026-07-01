import { Request, Response, NextFunction } from "express";
import { permissionsService } from "./permService";
import { getParam } from "../../lib/getParam";
import { updatePermissionsSchema } from "./permSchema";

export class PermissionsController {
  async getMatrix(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await permissionsService.getMatrix(getParam(req.params.staffId, 'staffId'));
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async updateMatrix(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = updatePermissionsSchema.parse(req.body);
      const data = await permissionsService.updateMatrix(getParam(req.params.staffId, 'staffId'), input);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
}

export const permissionsController = new PermissionsController();

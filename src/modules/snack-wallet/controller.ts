import { Request, Response, NextFunction } from "express";
import { snackWalletService } from "./service";
import { createWalletSchema, topUpSchema } from "./schema";

export class SnackWalletController {
  async lookup(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const phone = req.query.phone as string;
      if (!phone) {
        res.status(400).json({ success: false, message: "phone query param is required" });
        return;
      }
      const wallet = await snackWalletService.getByPhone(phone);
      res.status(200).json({ success: true, data: wallet ?? null });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const wallet = await snackWalletService.getById(id);
      if (!wallet) {
        res.status(404).json({ success: false, message: "المحفظة غير موجودة" });
        return;
      }
      res.status(200).json({ success: true, data: wallet });
    } catch (error) {
      next(error);
    }
  }

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
      const search = (req.query.search as string) || undefined;
      const data = await snackWalletService.list({ page, limit, search });
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = createWalletSchema.parse(req.body);
      const wallet = await snackWalletService.create(input);
      res.status(201).json({ success: true, data: wallet });
    } catch (error) {
      next(error);
    }
  }

  async topUp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const input = topUpSchema.parse(req.body);
      const result = await snackWalletService.topUp(id, input);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async getTransactions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
      const data = await snackWalletService.getTransactions(id, { page, limit });
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
}

export const snackWalletController = new SnackWalletController();

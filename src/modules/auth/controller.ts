import { Request, Response, NextFunction } from "express";
import { authService } from "./service";
import { loginSchema, refreshSchema, changePasswordSchema } from "./schema";

export class AuthController {
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { username, password } = loginSchema.parse(req.body);
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      const userAgent = req.headers["user-agent"];

      const result = await authService.validateLogin(username, password, ip, userAgent);

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { refreshToken } = refreshSchema.parse(req.body);

      const result = await authService.refreshTokens(refreshToken);

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({
        success: true,
        message: "Logged out successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  async changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = changePasswordSchema.parse(req.body);
      const result = await authService.changePassword(req.user!.id, data);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();

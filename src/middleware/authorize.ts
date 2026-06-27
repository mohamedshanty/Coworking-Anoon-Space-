import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/ApiError";

export const authorize = (
  pageKey: string,
  action: "view" | "edit" | "delete"
) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user;

      if (!user) {
        throw new ApiError(401, "User not authenticated");
      }

      // Admin has absolute permissions bypass
      if (user.role === "admin") {
        return next();
      }

      const permission = await prisma.permission.findUnique({
        where: {
          staffId_pageKey: {
            staffId: user.id,
            pageKey,
          },
        },
      });

      if (!permission) {
        throw new ApiError(403, "Access denied. Insufficient permissions.");
      }

      let allowed = false;
      if (action === "view" && permission.canView) allowed = true;
      if (action === "edit" && permission.canEdit) allowed = true;
      if (action === "delete" && permission.canDelete) allowed = true;

      if (!allowed) {
        throw new ApiError(403, "Access denied. Insufficient permissions.");
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

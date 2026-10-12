import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/ApiError";

export const authorize = (
  pageKey: string,
  action: "view" | "edit" | "delete",
) => {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
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

      // Deny by default (permissions are opt-in, not opt-out).
      // Missing row means no grant: fail closed.
      if (!permission) {
        throw new ApiError(403, "Access denied. Insufficient permissions.");
      }

      // Enforce the exact action: view needs canView, edit needs canEdit,
      // delete needs canDelete. canView alone never grants edit/delete.
      const allowed =
        action === "view"
          ? permission.canView
          : action === "edit"
            ? permission.canEdit
            : permission.canDelete;

      if (!allowed) {
        throw new ApiError(403, "Access denied. Insufficient permissions.");
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

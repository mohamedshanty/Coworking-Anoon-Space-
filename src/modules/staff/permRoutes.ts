import { Router, Request, Response, NextFunction } from "express";
import { permissionsController } from "./permController";
import { permissionsService } from "./permService";
import { authenticate } from "../../middleware/authenticate";
import { ApiError } from "../../lib/ApiError";

const adminOnly = (req: Request, res: Response, next: NextFunction) => {
  if (req.user?.role !== "admin") {
    return next(new ApiError(403, "Access denied. Admin only."));
  }
  next();
};

const router = Router();

router.use(authenticate);

// Any authenticated staff member can fetch their own permissions
router.get("/me", async (req, res, next) => {
  try {
    const data = await permissionsService.getMatrix(req.user!.id);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// Admin-only routes below
router.use(adminOnly);

router.get("/:staffId", (req, res, next) => permissionsController.getMatrix(req, res, next));
router.patch("/:staffId", (req, res, next) => permissionsController.updateMatrix(req, res, next));

export default router;

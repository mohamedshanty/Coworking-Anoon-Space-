import { Router, Request, Response, NextFunction } from "express";
import { permissionsController } from "./permController";
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
router.use(adminOnly);

router.get("/:staffId", (req, res, next) => permissionsController.getMatrix(req, res, next));
router.patch("/:staffId", (req, res, next) => permissionsController.updateMatrix(req, res, next));

export default router;

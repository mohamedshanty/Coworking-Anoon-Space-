import { Router, Request, Response, NextFunction } from "express";
import { loginLogsController } from "./controller";
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

router.get("/", (req, res, next) => loginLogsController.getLogs(req, res, next));

export default router;

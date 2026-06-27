import { Router, Request, Response, NextFunction } from "express";
import { staffController } from "./controller";
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

router.get("/", (req, res, next) => staffController.getAll(req, res, next));
router.get("/:id", (req, res, next) => staffController.getById(req, res, next));
router.post("/", (req, res, next) => staffController.create(req, res, next));
router.patch("/:id", (req, res, next) => staffController.update(req, res, next));
router.delete("/:id", (req, res, next) => staffController.delete(req, res, next));

export default router;

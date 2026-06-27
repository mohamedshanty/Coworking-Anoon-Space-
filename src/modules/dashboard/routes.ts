import { Router } from "express";
import { dashboardController } from "./controller";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";

const router = Router();

router.use(authenticate);

router.get(
  "/summary",
  authorize("الرئيسية", "view"),
  (req, res, next) => dashboardController.getSummary(req, res, next)
);

router.get(
  "/revenue-trend",
  authorize("الرئيسية", "view"),
  (req, res, next) => dashboardController.getRevenueTrend(req, res, next)
);

export default router;

import { Router } from "express";
import { reportsController } from "./controller";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";

const router = Router();

router.use(authenticate);

router.get(
  "/export",
  authorize("التقارير", "view"),
  (req, res, next) => reportsController.exportReport(req, res, next)
);

export default router;

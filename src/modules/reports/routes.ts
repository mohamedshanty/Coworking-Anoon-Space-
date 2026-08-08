import { Router, Request, Response } from "express";
import { reportsController } from "./controller";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { generateAndSendDailyReport } from "../../lib/daily-report";

const router = Router();

router.use(authenticate);

router.get(
  "/preview",
  authorize("التقارير", "view"),
  (req, res, next) => reportsController.getPreview(req, res, next)
);

router.get(
  "/export",
  authorize("التقارير", "view"),
  (req, res, next) => reportsController.exportReport(req, res, next)
);

router.post(
  "/send-daily-email",
  authorize("التقارير", "edit"),
  async (req: Request, res: Response) => {
    try {
      const result = await generateAndSendDailyReport();
      res.json(result);
    } catch (err) {
      console.error("[DailyReport] Manual trigger failed:", err);
      res.status(500).json({ success: false, message: "Failed to send daily report" });
    }
  }
);

export default router;

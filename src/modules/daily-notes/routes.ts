import { Router } from "express";
import { dailyNotesController } from "./controller";
import { authenticate } from "../../middleware/authenticate";

const router = Router();

router.use(authenticate);

// GET /daily-notes?date=YYYY-MM-DD
router.get(
  "/",
  (req, res, next) => dailyNotesController.listByDate(req, res, next),
);

// POST /daily-notes
router.post(
  "/",
  (req, res, next) => dailyNotesController.create(req, res, next),
);

// DELETE /daily-notes/:id
router.delete(
  "/:id",
  (req, res, next) => dailyNotesController.delete(req, res, next),
);

export default router;

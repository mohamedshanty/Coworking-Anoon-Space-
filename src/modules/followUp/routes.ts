import { Router } from "express";
import { followUpController } from "./controller";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";

const router = Router();

router.use(authenticate);

// GET follow-up list (default or showAll)
router.get(
  "/",
  authorize("المتابعة", "view"),
  (req, res, next) => followUpController.getFollowUpList(req, res, next)
);

// POST mark visitor as contacted
router.post(
  "/:visitorId/contacted",
  authorize("المتابعة", "edit"),
  (req, res, next) => followUpController.markContacted(req, res, next)
);

// POST opt-out visitor from follow-up
router.post(
  "/:visitorId/opt-out",
  authorize("المتابعة", "edit"),
  (req, res, next) => followUpController.optOut(req, res, next)
);

export default router;

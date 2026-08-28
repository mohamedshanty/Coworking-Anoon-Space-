import { Router } from "express";
import { integrationsController } from "./controller";
import { verifyInternalSecret } from "./secret";

const router = Router();

router.post(
  "/anoon-checkin",
  verifyInternalSecret,
  (req, res, next) => integrationsController.anoonCheckIn(req, res, next)
);

router.post(
  "/anoon-visitor-checkin",
  verifyInternalSecret,
  (req, res, next) => integrationsController.anoonVisitorCheckIn(req, res, next)
);

export default router;

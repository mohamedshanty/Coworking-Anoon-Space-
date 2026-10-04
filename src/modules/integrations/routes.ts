import { Router } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { integrationsController } from "./controller";
import { verifyInternalSecret } from "./secret";

const router = Router();

// Abuse guard for the unauthenticated-device endpoint: same budget as the
// public hotspot portal login (20 req/min per MAC).
const guestLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    `${ipKeyGenerator(req.ip ?? "")}:${String(req.body?.mac ?? "").toUpperCase()}`,
  message: { success: false, message: "Too many attempts, wait a minute" },
});

router.post(
  "/anoon-checkin",
  verifyInternalSecret,
  (req, res, next) => integrationsController.anoonCheckIn(req, res, next)
);

// Guest quick-login: fixed shared hotspot code → router-only authorization.
// No person/tracking writes by design (see service.guestQuickLogin).
router.post(
  "/guest-quick-login",
  guestLimiter,
  verifyInternalSecret,
  (req, res, next) => integrationsController.guestQuickLogin(req, res, next)
);

export default router;

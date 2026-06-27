import { Router } from "express";
import { sessionsController } from "./controller";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";

const router = Router();

// Apply authenticate to all sessions routes
router.use(authenticate);

// GET active sessions
router.get(
  "/live",
  authorize("داخل المساحة", "view"),
  (req, res, next) => sessionsController.getLiveSessions(req, res, next)
);

// POST check-in
router.post(
  "/",
  authorize("داخل المساحة", "edit"),
  (req, res, next) => sessionsController.checkIn(req, res, next)
);

// PATCH edit details
router.patch(
  "/:id",
  authorize("داخل المساحة", "edit"),
  (req, res, next) => sessionsController.editSession(req, res, next)
);

// POST normal paid checkout
router.post(
  "/:id/checkout",
  authorize("داخل المساحة", "edit"),
  (req, res, next) => sessionsController.checkout(req, res, next)
);

// POST unpaid checkout (creates Debt)
router.post(
  "/:id/checkout-unpaid",
  authorize("داخل المساحة", "edit"),
  (req, res, next) => sessionsController.checkoutUnpaid(req, res, next)
);

// POST add snack order
router.post(
  "/:id/orders",
  authorize("داخل المساحة", "edit"),
  (req, res, next) => sessionsController.addOrder(req, res, next)
);

export default router;

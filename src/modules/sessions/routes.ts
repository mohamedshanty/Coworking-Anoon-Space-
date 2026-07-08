import { Router } from "express";
import { sessionsController } from "./controller";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";

const router = Router();

// Apply authenticate to all sessions routes
router.use(authenticate);

// GET visitor lookup by name (MUST be before /:id routes)
router.get(
  "/visitor-lookup",
  authorize("داخل المساحة", "view"),
  (req, res, next) => sessionsController.visitorLookup(req, res, next)
);

// GET history (MUST be before /:id routes)
router.get(
  "/history",
  authorize("السجل", "view"),
  (req, res, next) => sessionsController.getHistory(req, res, next)
);

// GET history summary (MUST be before /:id routes)
router.get(
  "/history/summary",
  authorize("السجل", "view"),
  (req, res, next) => sessionsController.getHistorySummary(req, res, next)
);

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

// PATCH edit an order line item
router.patch(
  "/orders/:orderId",
  authorize("داخل المساحة", "edit"),
  (req, res, next) => sessionsController.editOrderItem(req, res, next)
);

// DELETE an order line item
router.delete(
  "/orders/:orderId",
  authorize("داخل المساحة", "edit"),
  (req, res, next) => sessionsController.deleteOrderItem(req, res, next)
);

// DELETE session (works for both live and history since same model)
router.delete(
  "/:id",
  authorize("داخل المساحة", "delete"),
  (req, res, next) => sessionsController.deleteSession(req, res, next)
);

export default router;

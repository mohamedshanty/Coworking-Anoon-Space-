import { Router } from "express";
import { subscribersController } from "./controller";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";

const router = Router();

router.use(authenticate);

// GET subscribers list
router.get(
  "/",
  authorize("المشتركون", "view"),
  (req, res, next) => subscribersController.getSubscribers(req, res, next)
);

// POST create subscriber (Visitor + Subscription)
router.post(
  "/",
  authorize("المشتركون", "edit"),
  (req, res, next) => subscribersController.createSubscriber(req, res, next)
);

// PATCH pause active subscription
router.patch(
  "/:id/pause",
  authorize("المشتركون", "edit"),
  (req, res, next) => subscribersController.pauseSubscription(req, res, next)
);

// POST renew subscription
router.post(
  "/:id/renew",
  authorize("المشتركون", "edit"),
  (req, res, next) => subscribersController.renewSubscription(req, res, next)
);

// PATCH edit subscriber visitor details
router.patch(
  "/:id",
  authorize("المشتركون", "edit"),
  (req, res, next) => subscribersController.updateSubscriber(req, res, next)
);

// DELETE subscriber (Visitor + cascade subscriptions/sessions)
router.delete(
  "/:id",
  authorize("المشتركون", "delete"),
  (req, res, next) => subscribersController.deleteSubscriber(req, res, next)
);

export default router;

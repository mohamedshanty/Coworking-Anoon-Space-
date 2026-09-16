import { Router } from "express";
import { traineesController } from "./controller";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";

const router = Router();

router.use(authenticate);

// GET trainees list
router.get(
  "/",
  authorize("المتدربون", "view"),
  (req, res, next) => traineesController.getTrainees(req, res, next)
);

// POST validate bulk import (Phase 1: preview, no writes)
router.post(
  "/import/validate",
  authorize("المتدربون", "edit"),
  (req, res, next) => traineesController.validateImport(req, res, next)
);

// POST commit bulk import (Phase 2: create/update in one transaction)
router.post(
  "/import/commit",
  authorize("المتدربون", "edit"),
  (req, res, next) => traineesController.commitImport(req, res, next)
);

// POST create trainee
router.post(
  "/",
  authorize("المتدربون", "edit"),
  (req, res, next) => traineesController.createTrainee(req, res, next)
);

// PATCH update trainee
router.patch(
  "/:id",
  authorize("المتدربون", "edit"),
  (req, res, next) => traineesController.updateTrainee(req, res, next)
);

// DELETE trainee
router.delete(
  "/:id",
  authorize("المتدربون", "delete"),
  (req, res, next) => traineesController.deleteTrainee(req, res, next)
);

export default router;

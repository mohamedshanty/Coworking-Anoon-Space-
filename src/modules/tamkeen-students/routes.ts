import { Router } from "express";
import { tamkeenStudentsController } from "./controller";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";

const router = Router();

router.use(authenticate);

// GET Tamkeen students list
router.get(
  "/",
  authorize("طلبة تمكين", "view"),
  (req, res, next) => tamkeenStudentsController.getTamkeenStudents(req, res, next)
);

// POST validate bulk import (Phase 1: preview, no writes)
router.post(
  "/import/validate",
  authorize("طلبة تمكين", "edit"),
  (req, res, next) => tamkeenStudentsController.validateImport(req, res, next)
);

// POST commit bulk import (Phase 2: create/update in one transaction)
router.post(
  "/import/commit",
  authorize("طلبة تمكين", "edit"),
  (req, res, next) => tamkeenStudentsController.commitImport(req, res, next)
);

// POST create Tamkeen student
router.post(
  "/",
  authorize("طلبة تمكين", "edit"),
  (req, res, next) => tamkeenStudentsController.createTamkeenStudent(req, res, next)
);

// PATCH update Tamkeen student
router.patch(
  "/:id",
  authorize("طلبة تمكين", "edit"),
  (req, res, next) => tamkeenStudentsController.updateTamkeenStudent(req, res, next)
);

// DELETE Tamkeen student
router.delete(
  "/:id",
  authorize("طلبة تمكين", "delete"),
  (req, res, next) => tamkeenStudentsController.deleteTamkeenStudent(req, res, next)
);

export default router;

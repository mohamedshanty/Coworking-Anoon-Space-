import { Router } from "express";
import { debtsController } from "./controller";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";

const router = Router();

router.use(authenticate);

// GET debts list
router.get(
  "/",
  authorize("المديونيات", "view"),
  (req, res, next) => debtsController.getDebts(req, res, next)
);

// POST create manual debt
router.post(
  "/",
  authorize("المديونيات", "edit"),
  (req, res, next) => debtsController.createDebt(req, res, next)
);

// POST collect unpaid debt
router.post(
  "/:id/collect",
  authorize("المديونيات", "edit"),
  (req, res, next) => debtsController.collectDebt(req, res, next)
);

// PATCH edit details
router.patch(
  "/:id",
  authorize("المديونيات", "edit"),
  (req, res, next) => debtsController.editDebt(req, res, next)
);

// DELETE remove debt
router.delete(
  "/:id",
  authorize("المديونيات", "delete"),
  (req, res, next) => debtsController.deleteDebt(req, res, next)
);

export default router;

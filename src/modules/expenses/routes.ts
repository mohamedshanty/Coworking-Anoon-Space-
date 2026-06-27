import { Router } from "express";
import { expensesController } from "./controller";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";

const router = Router();

router.use(authenticate);

// GET aggregated analytics (put this BEFORE /:id so it's not matched as an id param)
router.get(
  "/by-category",
  authorize("المصروفات", "view"),
  (req, res, next) => expensesController.getExpensesByCategory(req, res, next)
);

// GET expenses list
router.get(
  "/",
  authorize("المصروفات", "view"),
  (req, res, next) => expensesController.getExpenses(req, res, next)
);

// POST create expense
router.post(
  "/",
  authorize("المصروفات", "edit"),
  (req, res, next) => expensesController.createExpense(req, res, next)
);

// PATCH edit details
router.patch(
  "/:id",
  authorize("المصروفات", "edit"),
  (req, res, next) => expensesController.editExpense(req, res, next)
);

// DELETE remove expense
router.delete(
  "/:id",
  authorize("المصروفات", "delete"),
  (req, res, next) => expensesController.deleteExpense(req, res, next)
);

export default router;

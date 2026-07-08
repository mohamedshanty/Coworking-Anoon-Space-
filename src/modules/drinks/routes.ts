import { Router } from "express";
import { drinksController } from "./controller";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";

const router = Router();

router.use(authenticate);

// GET all drinks
router.get(
  "/",
  authorize("المشروبات", "view"),
  (req, res, next) => drinksController.getDrinks(req, res, next)
);

// POST create drink
router.post(
  "/",
  authorize("المشروبات", "edit"),
  (req, res, next) => drinksController.createDrink(req, res, next)
);

// POST restock drink
router.post(
  "/:id/restock",
  authorize("المشروبات", "edit"),
  (req, res, next) => drinksController.restockDrink(req, res, next)
);

// PATCH edit drink
router.patch(
  "/:id",
  authorize("المشروبات", "edit"),
  (req, res, next) => drinksController.editDrink(req, res, next)
);

// DELETE drink
router.delete(
  "/:id",
  authorize("المشروبات", "delete"),
  (req, res, next) => drinksController.deleteDrink(req, res, next)
);

export default router;

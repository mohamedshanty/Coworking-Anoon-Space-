import { Router } from "express";
import { hotDrinkDefsController } from "./controller";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";

const router = Router();

router.use(authenticate);

// GET all hot drink definitions
router.get(
  "/",
  authorize("المشروبات", "view"),
  (req, res, next) => hotDrinkDefsController.getHotDrinks(req, res, next)
);

// POST create hot drink definition
router.post(
  "/",
  authorize("المشروبات", "edit"),
  (req, res, next) => hotDrinkDefsController.createHotDrink(req, res, next)
);

// PATCH update hot drink definition
router.patch(
  "/:id",
  authorize("المشروبات", "edit"),
  (req, res, next) => hotDrinkDefsController.updateHotDrink(req, res, next)
);

// DELETE hot drink definition
router.delete(
  "/:id",
  authorize("المشروبات", "delete"),
  (req, res, next) => hotDrinkDefsController.deleteHotDrink(req, res, next)
);

export default router;

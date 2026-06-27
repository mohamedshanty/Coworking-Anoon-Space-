import { Router } from "express";
import { salesController } from "./controller";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";

const router = Router();

router.use(authenticate);

// GET hot drinks sales logs
router.get(
  "/",
  authorize("المشروبات", "view"),
  (req, res, next) => salesController.getHotDrinkSales(req, res, next)
);

// POST direct purchase hot drink
router.post(
  "/",
  authorize("المشروبات", "edit"),
  (req, res, next) => salesController.createHotDrinkSale(req, res, next)
);

export default router;

import { Router } from "express";
import { salesController } from "./controller";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";

const router = Router();

router.use(authenticate);

// GET snack sales logs
router.get(
  "/",
  authorize("السناكس", "view"),
  (req, res, next) => salesController.getSnackSales(req, res, next)
);

// POST direct purchase snack sale
router.post(
  "/",
  authorize("السناكس", "edit"),
  (req, res, next) => salesController.createSnackSale(req, res, next)
);

export default router;

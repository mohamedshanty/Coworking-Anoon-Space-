import { Router } from "express";
import rateLimit from "express-rate-limit";
import { publicMenuController } from "./controller";

const router = Router();

const orderLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 attempts per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many order requests. Please try again in a minute." },
});

router.get("/menu", (req, res, next) => publicMenuController.getMenu(req, res, next));

router.post("/orders", orderLimiter, (req, res, next) => publicMenuController.postOrder(req, res, next));

export default router;

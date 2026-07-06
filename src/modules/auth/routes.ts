import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authController } from "./controller";
import { authenticate } from "../../middleware/authenticate";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 attempts per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many login attempts. Please try again in a minute." },
});

router.post("/login", loginLimiter, (req, res, next) => authController.login(req, res, next));
router.post("/refresh", (req, res, next) => authController.refresh(req, res, next));
router.post("/logout", (req, res, next) => authController.logout(req, res, next));
router.post("/change-password", authenticate, (req, res, next) => authController.changePassword(req, res, next));

export default router;

import { Router } from "express";
import { authController } from "./controller";
import { authenticate } from "../../middleware/authenticate";

const router = Router();

router.post("/login", (req, res, next) => authController.login(req, res, next));
router.post("/refresh", (req, res, next) => authController.refresh(req, res, next));
router.post("/logout", (req, res, next) => authController.logout(req, res, next));
router.post("/change-password", authenticate, (req, res, next) => authController.changePassword(req, res, next));

export default router;

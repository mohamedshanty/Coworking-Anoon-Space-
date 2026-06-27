import { Router } from "express";
import { settingsController } from "./controller";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";

const router = Router();

router.use(authenticate);

router.get("/", authorize("الإعدادات", "view"), (req, res, next) => settingsController.getSettings(req, res, next));
router.patch("/", authorize("الإعدادات", "edit"), (req, res, next) => settingsController.updateSettings(req, res, next));

export default router;

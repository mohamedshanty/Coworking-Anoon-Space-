import { Router } from "express";
import { visitorsController } from "./controller";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { n8nAuth } from "../../middleware/n8nAuth";

const router = Router();

// ─── N8N-protected routes (API key auth, no JWT) ──────────────────────────────
router.get("/churned", n8nAuth, (req, res, next) => visitorsController.getChurned(req, res, next));
router.post("/:id/whatsapp-reply", n8nAuth, (req, res, next) => visitorsController.addWhatsAppReply(req, res, next));
router.get("/by-phone/:phone", n8nAuth, (req, res, next) => visitorsController.getByPhone(req, res, next));

// ─── Admin dashboard routes (JWT + permission auth) ───────────────────────────
router.use(authenticate);

// GET visitor profile by ID
router.get(
  "/:id",
  authorize("داخل المساحة", "view"),
  (req, res, next) => visitorsController.getById(req, res, next)
);

// PATCH update visitor (follow-up status, notes)
router.patch(
  "/:id",
  authorize("داخل المساحة", "edit"),
  (req, res, next) => visitorsController.update(req, res, next)
);

// POST add a timestamped note
router.post(
  "/:id/notes",
  authorize("داخل المساحة", "edit"),
  (req, res, next) => visitorsController.addNote(req, res, next)
);

// DELETE a note
router.delete(
  "/:id/notes/:noteId",
  authorize("داخل المساحة", "edit"),
  (req, res, next) => visitorsController.deleteNote(req, res, next)
);

export default router;

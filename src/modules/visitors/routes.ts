import { Router } from "express";
import { visitorsController } from "./controller";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { n8nAuth } from "../../middleware/n8nAuth";

const router = Router();

// ─── n8n-protected routes (shared API key, no JWT) ────────────────────────────
// WhatsApp churn outreach: list churned visitors, log a reply, look up by phone.
router.get("/churned", n8nAuth, (req, res, next) => visitorsController.getChurned(req, res, next));
router.post("/:id/whatsapp-reply", n8nAuth, (req, res, next) => visitorsController.addWhatsAppReply(req, res, next));
router.get("/by-phone/:phone", n8nAuth, (req, res, next) => visitorsController.getByPhoneN8n(req, res, next));

// ─── Admin dashboard routes (JWT + permission auth) ───────────────────────────
router.use(authenticate);

// GET active person by phone (MUST be before /:id routes)
router.get(
  "/by-phone",
  authorize("داخل المساحة", "view"),
  (req, res, next) => visitorsController.getByPhone(req, res, next)
);

// POST merge two person records (MUST be before /:id routes)
router.post(
  "/merge",
  authorize("داخل المساحة", "edit"),
  (req, res, next) => visitorsController.mergePersons(req, res, next)
);

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

// POST restore an archived (soft-deleted) visitor
router.post(
  "/:id/restore",
  authorize("داخل المساحة", "edit"),
  (req, res, next) => visitorsController.restore(req, res, next)
);

// POST convert a person's type (ANY → ANY, same id, history preserved)
router.post(
  "/:id/convert-type",
  authorize("داخل المساحة", "edit"),
  (req, res, next) => visitorsController.convertType(req, res, next)
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

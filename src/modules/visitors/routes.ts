import { Router } from "express";
import { visitorsController } from "./controller";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";

const router = Router();

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

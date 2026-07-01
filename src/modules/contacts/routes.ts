import { Router } from "express";
import { contactsController } from "./controller";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";

const router = Router();

router.use(authenticate);

// GET search contacts (for autocomplete — must be before /:id)
router.get(
  "/search",
  authorize("جهات الاتصال", "view"),
  (req, res, next) => contactsController.search(req, res, next)
);

// GET fuzzy search contacts (for autocomplete)
router.get(
  "/fuzzy-search",
  authorize("جهات الاتصال", "view"),
  (req, res, next) => contactsController.fuzzySearch(req, res, next)
);

// POST import contacts from file
router.post(
  "/import",
  authorize("جهات الاتصال", "edit"),
  (req, res, next) => contactsController.import(req, res, next)
);

// GET list all contacts
router.get(
  "/",
  authorize("جهات الاتصال", "view"),
  (req, res, next) => contactsController.list(req, res, next)
);

// GET single contact
router.get(
  "/:id",
  authorize("جهات الاتصال", "view"),
  (req, res, next) => contactsController.getById(req, res, next)
);

// POST create contact
router.post(
  "/",
  authorize("جهات الاتصال", "edit"),
  (req, res, next) => contactsController.create(req, res, next)
);

// PATCH update contact
router.patch(
  "/:id",
  authorize("جهات الاتصال", "edit"),
  (req, res, next) => contactsController.update(req, res, next)
);

// DELETE contact
router.delete(
  "/:id",
  authorize("جهات الاتصال", "delete"),
  (req, res, next) => contactsController.delete(req, res, next)
);

export default router;

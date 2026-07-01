"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const controller_1 = require("./controller");
const authenticate_1 = require("../../middleware/authenticate");
const authorize_1 = require("../../middleware/authorize");
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate);
// GET search contacts (for autocomplete — must be before /:id)
router.get("/search", (0, authorize_1.authorize)("جهات الاتصال", "view"), (req, res, next) => controller_1.contactsController.search(req, res, next));
// GET fuzzy search contacts (for autocomplete)
router.get("/fuzzy-search", (0, authorize_1.authorize)("جهات الاتصال", "view"), (req, res, next) => controller_1.contactsController.fuzzySearch(req, res, next));
// POST import contacts from file
router.post("/import", (0, authorize_1.authorize)("جهات الاتصال", "edit"), (req, res, next) => controller_1.contactsController.import(req, res, next));
// GET list all contacts
router.get("/", (0, authorize_1.authorize)("جهات الاتصال", "view"), (req, res, next) => controller_1.contactsController.list(req, res, next));
// GET single contact
router.get("/:id", (0, authorize_1.authorize)("جهات الاتصال", "view"), (req, res, next) => controller_1.contactsController.getById(req, res, next));
// POST create contact
router.post("/", (0, authorize_1.authorize)("جهات الاتصال", "edit"), (req, res, next) => controller_1.contactsController.create(req, res, next));
// PATCH update contact
router.patch("/:id", (0, authorize_1.authorize)("جهات الاتصال", "edit"), (req, res, next) => controller_1.contactsController.update(req, res, next));
// DELETE contact
router.delete("/:id", (0, authorize_1.authorize)("جهات الاتصال", "delete"), (req, res, next) => controller_1.contactsController.delete(req, res, next));
exports.default = router;

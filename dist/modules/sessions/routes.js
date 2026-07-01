"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const controller_1 = require("./controller");
const authenticate_1 = require("../../middleware/authenticate");
const authorize_1 = require("../../middleware/authorize");
const router = (0, express_1.Router)();
// Apply authenticate to all sessions routes
router.use(authenticate_1.authenticate);
// GET visitor lookup by name (MUST be before /:id routes)
router.get("/visitor-lookup", (0, authorize_1.authorize)("داخل المساحة", "view"), (req, res, next) => controller_1.sessionsController.visitorLookup(req, res, next));
// GET history (MUST be before /:id routes)
router.get("/history", (0, authorize_1.authorize)("السجل", "view"), (req, res, next) => controller_1.sessionsController.getHistory(req, res, next));
// GET history summary (MUST be before /:id routes)
router.get("/history/summary", (0, authorize_1.authorize)("السجل", "view"), (req, res, next) => controller_1.sessionsController.getHistorySummary(req, res, next));
// GET active sessions
router.get("/live", (0, authorize_1.authorize)("داخل المساحة", "view"), (req, res, next) => controller_1.sessionsController.getLiveSessions(req, res, next));
// POST check-in
router.post("/", (0, authorize_1.authorize)("داخل المساحة", "edit"), (req, res, next) => controller_1.sessionsController.checkIn(req, res, next));
// PATCH edit details
router.patch("/:id", (0, authorize_1.authorize)("داخل المساحة", "edit"), (req, res, next) => controller_1.sessionsController.editSession(req, res, next));
// POST normal paid checkout
router.post("/:id/checkout", (0, authorize_1.authorize)("داخل المساحة", "edit"), (req, res, next) => controller_1.sessionsController.checkout(req, res, next));
// POST unpaid checkout (creates Debt)
router.post("/:id/checkout-unpaid", (0, authorize_1.authorize)("داخل المساحة", "edit"), (req, res, next) => controller_1.sessionsController.checkoutUnpaid(req, res, next));
// POST add snack order
router.post("/:id/orders", (0, authorize_1.authorize)("داخل المساحة", "edit"), (req, res, next) => controller_1.sessionsController.addOrder(req, res, next));
exports.default = router;

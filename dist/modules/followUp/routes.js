"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const controller_1 = require("./controller");
const authenticate_1 = require("../../middleware/authenticate");
const authorize_1 = require("../../middleware/authorize");
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate);
// GET follow-up list (default or showAll)
router.get("/", (0, authorize_1.authorize)("المتابعة", "view"), (req, res, next) => controller_1.followUpController.getFollowUpList(req, res, next));
// POST mark visitor as contacted
router.post("/:visitorId/contacted", (0, authorize_1.authorize)("المتابعة", "edit"), (req, res, next) => controller_1.followUpController.markContacted(req, res, next));
// POST opt-out visitor from follow-up
router.post("/:visitorId/opt-out", (0, authorize_1.authorize)("المتابعة", "edit"), (req, res, next) => controller_1.followUpController.optOut(req, res, next));
exports.default = router;

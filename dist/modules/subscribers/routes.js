"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const controller_1 = require("./controller");
const authenticate_1 = require("../../middleware/authenticate");
const authorize_1 = require("../../middleware/authorize");
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate);
// GET subscribers list
router.get("/", (0, authorize_1.authorize)("المشتركون", "view"), (req, res, next) => controller_1.subscribersController.getSubscribers(req, res, next));
// POST create subscriber (Visitor + Subscription)
router.post("/", (0, authorize_1.authorize)("المشتركون", "edit"), (req, res, next) => controller_1.subscribersController.createSubscriber(req, res, next));
// PATCH pause active subscription
router.patch("/:id/pause", (0, authorize_1.authorize)("المشتركون", "edit"), (req, res, next) => controller_1.subscribersController.pauseSubscription(req, res, next));
// POST renew subscription
router.post("/:id/renew", (0, authorize_1.authorize)("المشتركون", "edit"), (req, res, next) => controller_1.subscribersController.renewSubscription(req, res, next));
// PATCH edit subscriber visitor details
router.patch("/:id", (0, authorize_1.authorize)("المشتركون", "edit"), (req, res, next) => controller_1.subscribersController.updateSubscriber(req, res, next));
exports.default = router;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const controller_1 = require("./controller");
const authenticate_1 = require("../../middleware/authenticate");
const authorize_1 = require("../../middleware/authorize");
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate);
// GET debts list
router.get("/", (0, authorize_1.authorize)("المديونيات", "view"), (req, res, next) => controller_1.debtsController.getDebts(req, res, next));
// POST create manual debt
router.post("/", (0, authorize_1.authorize)("المديونيات", "edit"), (req, res, next) => controller_1.debtsController.createDebt(req, res, next));
// POST collect unpaid debt
router.post("/:id/collect", (0, authorize_1.authorize)("المديونيات", "edit"), (req, res, next) => controller_1.debtsController.collectDebt(req, res, next));
// PATCH edit details
router.patch("/:id", (0, authorize_1.authorize)("المديونيات", "edit"), (req, res, next) => controller_1.debtsController.editDebt(req, res, next));
// DELETE remove debt
router.delete("/:id", (0, authorize_1.authorize)("المديونيات", "delete"), (req, res, next) => controller_1.debtsController.deleteDebt(req, res, next));
exports.default = router;

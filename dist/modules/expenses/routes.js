"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const controller_1 = require("./controller");
const authenticate_1 = require("../../middleware/authenticate");
const authorize_1 = require("../../middleware/authorize");
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate);
// GET aggregated analytics (put this BEFORE /:id so it's not matched as an id param)
router.get("/by-category", (0, authorize_1.authorize)("المصروفات", "view"), (req, res, next) => controller_1.expensesController.getExpensesByCategory(req, res, next));
// GET expenses list
router.get("/", (0, authorize_1.authorize)("المصروفات", "view"), (req, res, next) => controller_1.expensesController.getExpenses(req, res, next));
// POST create expense
router.post("/", (0, authorize_1.authorize)("المصروفات", "edit"), (req, res, next) => controller_1.expensesController.createExpense(req, res, next));
// PATCH edit details
router.patch("/:id", (0, authorize_1.authorize)("المصروفات", "edit"), (req, res, next) => controller_1.expensesController.editExpense(req, res, next));
// DELETE remove expense
router.delete("/:id", (0, authorize_1.authorize)("المصروفات", "delete"), (req, res, next) => controller_1.expensesController.deleteExpense(req, res, next));
exports.default = router;

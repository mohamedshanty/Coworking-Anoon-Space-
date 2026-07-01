"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const controller_1 = require("./controller");
const authenticate_1 = require("../../middleware/authenticate");
const authorize_1 = require("../../middleware/authorize");
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate);
// GET snack sales logs
router.get("/", (0, authorize_1.authorize)("السناكس", "view"), (req, res, next) => controller_1.salesController.getSnackSales(req, res, next));
// POST direct purchase snack sale
router.post("/", (0, authorize_1.authorize)("السناكس", "edit"), (req, res, next) => controller_1.salesController.createSnackSale(req, res, next));
exports.default = router;

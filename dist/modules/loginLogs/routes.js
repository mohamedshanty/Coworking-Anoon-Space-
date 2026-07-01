"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const controller_1 = require("./controller");
const authenticate_1 = require("../../middleware/authenticate");
const ApiError_1 = require("../../lib/ApiError");
const adminOnly = (req, res, next) => {
    if (req.user?.role !== "admin") {
        return next(new ApiError_1.ApiError(403, "Access denied. Admin only."));
    }
    next();
};
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate);
router.use(adminOnly);
router.get("/", (req, res, next) => controller_1.loginLogsController.getLogs(req, res, next));
exports.default = router;

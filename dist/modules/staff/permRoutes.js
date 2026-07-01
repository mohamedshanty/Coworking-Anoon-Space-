"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const permController_1 = require("./permController");
const permService_1 = require("./permService");
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
// Any authenticated staff member can fetch their own permissions
router.get("/me", async (req, res, next) => {
    try {
        const data = await permService_1.permissionsService.getMatrix(req.user.id);
        res.status(200).json({ success: true, data });
    }
    catch (error) {
        next(error);
    }
});
// Admin-only routes below
router.use(adminOnly);
router.get("/:staffId", (req, res, next) => permController_1.permissionsController.getMatrix(req, res, next));
router.patch("/:staffId", (req, res, next) => permController_1.permissionsController.updateMatrix(req, res, next));
exports.default = router;

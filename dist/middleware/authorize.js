"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authorize = void 0;
const prisma_1 = require("../lib/prisma");
const ApiError_1 = require("../lib/ApiError");
const authorize = (pageKey, action) => {
    return async (req, res, next) => {
        try {
            const user = req.user;
            if (!user) {
                throw new ApiError_1.ApiError(401, "User not authenticated");
            }
            // Admin has absolute permissions bypass
            if (user.role === "admin") {
                return next();
            }
            const permission = await prisma_1.prisma.permission.findUnique({
                where: {
                    staffId_pageKey: {
                        staffId: user.id,
                        pageKey,
                    },
                },
            });
            // No permission record = default allow (permissions are opt-out, not opt-in)
            if (!permission) {
                return next();
            }
            // If canView is true, all actions (edit/delete) are allowed
            const allowed = permission.canView;
            if (!allowed) {
                throw new ApiError_1.ApiError(403, "Access denied. Insufficient permissions.");
            }
            next();
        }
        catch (error) {
            next(error);
        }
    };
};
exports.authorize = authorize;

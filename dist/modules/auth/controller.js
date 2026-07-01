"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authController = exports.AuthController = void 0;
const service_1 = require("./service");
const schema_1 = require("./schema");
class AuthController {
    async login(req, res, next) {
        try {
            const { username, password } = schema_1.loginSchema.parse(req.body);
            const ip = req.ip || req.socket.remoteAddress || "unknown";
            const userAgent = req.headers["user-agent"];
            const result = await service_1.authService.validateLogin(username, password, ip, userAgent);
            res.status(200).json({
                success: true,
                ...result,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async refresh(req, res, next) {
        try {
            const { refreshToken } = schema_1.refreshSchema.parse(req.body);
            const result = await service_1.authService.refreshTokens(refreshToken);
            res.status(200).json({
                success: true,
                ...result,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async logout(req, res, next) {
        try {
            res.status(200).json({
                success: true,
                message: "Logged out successfully",
            });
        }
        catch (error) {
            next(error);
        }
    }
    async changePassword(req, res, next) {
        try {
            const data = schema_1.changePasswordSchema.parse(req.body);
            const result = await service_1.authService.changePassword(req.user.id, data);
            res.status(200).json({ success: true, ...result });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.AuthController = AuthController;
exports.authController = new AuthController();

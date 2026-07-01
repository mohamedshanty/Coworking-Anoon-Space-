"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authService = exports.AuthService = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const prisma_1 = require("../../lib/prisma");
const ApiError_1 = require("../../lib/ApiError");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "default_access_secret";
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "default_refresh_secret";
const ACCESS_EXPIRES_IN = "15m";
const REFRESH_EXPIRES_IN = "7d";
class AuthService {
    async validateLogin(username, password, ip, userAgent) {
        const user = await prisma_1.prisma.staff.findUnique({
            where: { username },
        });
        if (!user) {
            // Log failed attempt for non-existent user
            await this.logLoginAttempt(username, null, "fail", ip, userAgent);
            throw new ApiError_1.ApiError(401, "Invalid username or password");
        }
        const now = new Date();
        // Check account lockout
        if (user.lockedUntil && user.lockedUntil > now) {
            await this.logLoginAttempt(username, user.id, "fail", ip, userAgent);
            throw new ApiError_1.ApiError(403, `Account is locked. Try again after ${user.lockedUntil.toISOString()}`);
        }
        // Lock expired, reset failed attempts
        if (user.lockedUntil && user.lockedUntil <= now) {
            await prisma_1.prisma.staff.update({
                where: { id: user.id },
                data: { failedAttempts: 0, lockedUntil: null },
            });
            user.failedAttempts = 0;
            user.lockedUntil = null;
        }
        // Compare password
        const isPasswordValid = await bcrypt_1.default.compare(password, user.passwordHash);
        if (!isPasswordValid) {
            const failedAttempts = user.failedAttempts + 1;
            let lockedUntil = null;
            if (failedAttempts >= 5) {
                lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes lock
            }
            await prisma_1.prisma.staff.update({
                where: { id: user.id },
                data: { failedAttempts, lockedUntil },
            });
            await this.logLoginAttempt(username, user.id, "fail", ip, userAgent);
            throw new ApiError_1.ApiError(401, "Invalid username or password");
        }
        // Reset failed attempts on success
        if (user.failedAttempts > 0 || user.lockedUntil) {
            await prisma_1.prisma.staff.update({
                where: { id: user.id },
                data: { failedAttempts: 0, lockedUntil: null },
            });
        }
        await this.logLoginAttempt(username, user.id, "success", ip, userAgent);
        const payload = { id: user.id, username: user.username, role: user.role };
        const accessToken = this.generateAccessToken(payload);
        const refreshToken = this.generateRefreshToken(payload);
        return {
            accessToken,
            refreshToken,
            user: {
                id: user.id,
                name: user.name,
                username: user.username,
                role: user.role,
            },
        };
    }
    async refreshTokens(token) {
        try {
            const decoded = jsonwebtoken_1.default.verify(token, REFRESH_SECRET);
            const user = await prisma_1.prisma.staff.findUnique({
                where: { id: decoded.id },
            });
            if (!user) {
                throw new ApiError_1.ApiError(401, "User not found");
            }
            // Check if locked
            if (user.lockedUntil && user.lockedUntil > new Date()) {
                throw new ApiError_1.ApiError(403, "Account is locked");
            }
            const payload = { id: user.id, username: user.username, role: user.role };
            const accessToken = this.generateAccessToken(payload);
            const refreshToken = this.generateRefreshToken(payload);
            return { accessToken, refreshToken };
        }
        catch (err) {
            if (err instanceof ApiError_1.ApiError)
                throw err;
            throw new ApiError_1.ApiError(401, "Invalid refresh token");
        }
    }
    generateAccessToken(payload) {
        return jsonwebtoken_1.default.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES_IN });
    }
    generateRefreshToken(payload) {
        return jsonwebtoken_1.default.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES_IN });
    }
    async changePassword(userId, data) {
        const user = await prisma_1.prisma.staff.findUnique({ where: { id: userId } });
        if (!user)
            throw new ApiError_1.ApiError(404, "User not found");
        const isCurrentValid = await bcrypt_1.default.compare(data.currentPassword, user.passwordHash);
        if (!isCurrentValid) {
            throw new ApiError_1.ApiError(401, "Current password is incorrect");
        }
        const passwordHash = await bcrypt_1.default.hash(data.newPassword, 10);
        await prisma_1.prisma.staff.update({
            where: { id: userId },
            data: { passwordHash },
        });
        return { message: "Password changed successfully" };
    }
    async logLoginAttempt(username, userId, status, ip, userAgent) {
        try {
            await prisma_1.prisma.loginLog.create({
                data: {
                    userId,
                    username,
                    status,
                    ip,
                    userAgent: userAgent || null,
                    at: new Date(),
                },
            });
        }
        catch (err) {
            console.error("Failed to write to loginLog database:", err);
        }
    }
}
exports.AuthService = AuthService;
exports.authService = new AuthService();

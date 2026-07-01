import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../lib/ApiError";
import { ChangePasswordInput } from "./schema";
import dotenv from "dotenv";

dotenv.config();

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "default_access_secret";
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "default_refresh_secret";
const ACCESS_EXPIRES_IN = "15m";
const REFRESH_EXPIRES_IN = "7d";

interface TokenPayload {
  id: string;
  username: string;
  role: string;
}

export class AuthService {
  async validateLogin(username: string, password: string, ip: string, userAgent?: string) {
    const user = await prisma.staff.findUnique({
      where: { username },
    });

    if (!user) {
      // Log failed attempt for non-existent user
      await this.logLoginAttempt(username, null, "fail", ip, userAgent);
      throw new ApiError(401, "Invalid username or password");
    }

    const now = new Date();

    // Check account lockout
    if (user.lockedUntil && user.lockedUntil > now) {
      await this.logLoginAttempt(username, user.id, "fail", ip, userAgent);
      throw new ApiError(
        403,
        `Account is locked. Try again after ${user.lockedUntil.toISOString()}`
      );
    }

    // Lock expired, reset failed attempts
    if (user.lockedUntil && user.lockedUntil <= now) {
      await prisma.staff.update({
        where: { id: user.id },
        data: { failedAttempts: 0, lockedUntil: null },
      });
      user.failedAttempts = 0;
      user.lockedUntil = null;
    }

    // Compare password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      const failedAttempts = user.failedAttempts + 1;
      let lockedUntil: Date | null = null;

      if (failedAttempts >= 5) {
        lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes lock
      }

      await prisma.staff.update({
        where: { id: user.id },
        data: { failedAttempts, lockedUntil },
      });

      await this.logLoginAttempt(username, user.id, "fail", ip, userAgent);
      throw new ApiError(401, "Invalid username or password");
    }

    // Reset failed attempts on success
    if (user.failedAttempts > 0 || user.lockedUntil) {
      await prisma.staff.update({
        where: { id: user.id },
        data: { failedAttempts: 0, lockedUntil: null },
      });
    }

    await this.logLoginAttempt(username, user.id, "success", ip, userAgent);

    const payload: TokenPayload = { id: user.id, username: user.username, role: user.role };
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

  async refreshTokens(token: string) {
    try {
      const decoded = jwt.verify(token, REFRESH_SECRET) as TokenPayload;
      
      const user = await prisma.staff.findUnique({
        where: { id: decoded.id },
      });

      if (!user) {
        throw new ApiError(401, "User not found");
      }

      // Check if locked
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        throw new ApiError(403, "Account is locked");
      }

      const payload: TokenPayload = { id: user.id, username: user.username, role: user.role };
      const accessToken = this.generateAccessToken(payload);
      const refreshToken = this.generateRefreshToken(payload);

      return { accessToken, refreshToken };
    } catch (err: any) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(401, "Invalid refresh token");
    }
  }

  private generateAccessToken(payload: TokenPayload): string {
    return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES_IN });
  }

  private generateRefreshToken(payload: TokenPayload): string {
    return jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES_IN });
  }

  async changePassword(userId: string, data: ChangePasswordInput) {
    const user = await prisma.staff.findUnique({ where: { id: userId } });
    if (!user) throw new ApiError(404, "User not found");

    const isCurrentValid = await bcrypt.compare(data.currentPassword, user.passwordHash);
    if (!isCurrentValid) {
      throw new ApiError(401, "Current password is incorrect");
    }

    const passwordHash = await bcrypt.hash(data.newPassword, 10);
    await prisma.staff.update({
      where: { id: userId },
      data: { passwordHash },
    });

    return { message: "Password changed successfully" };
  }

  private async logLoginAttempt(
    username: string,
    userId: string | null,
    status: "success" | "fail",
    ip: string,
    userAgent?: string
  ) {
    try {
      await prisma.loginLog.create({
        data: {
          userId,
          username,
          status,
          ip,
          userAgent: userAgent || null,
          at: new Date(),
        },
      });
    } catch (err) {
      console.error("Failed to write to loginLog database:", err);
    }
  }
}

export const authService = new AuthService();

/**
 * Centralized environment variable validation.
 *
 * Call loadEnv() once at server startup (before any module imports the
 * exported constants) to ensure all required variables are present.
 * If any are missing the process exits immediately with a clear error.
 */

import dotenv from "dotenv";
dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const JWT_ACCESS_SECRET = requireEnv("JWT_ACCESS_SECRET");
export const JWT_REFRESH_SECRET = requireEnv("JWT_REFRESH_SECRET");

export const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS || "http://localhost:5173,http://localhost:8080"
)
  .split(",")
  .map((o) => o.trim());

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

// --- MikroTik (optional at build time, required at runtime for hotspot) ---
export const MIKROTIK_HOST = process.env.MIKROTIK_HOST || "";
export const MIKROTIK_USER = process.env.MIKROTIK_USER || "";
export const MIKROTIK_PASSWORD = process.env.MIKROTIK_PASSWORD || "";
export const MIKROTIK_PORT = Number(process.env.MIKROTIK_PORT || "8728");
export const MIKROTIK_TIMEOUT_SEC = Number(process.env.MIKROTIK_TIMEOUT_SEC || "8");

// --- noonWiFi hotspot (optional at build time) ---
/**
 * HMAC secret that derives the router hotspot password from a phone number.
 * It never leaves the server and is required for every portal login.
 * Optional at startup so the non-hotspot parts of the system can boot, but
 * MIKROTIK_HOST without HOTSPOT_USER_SECRET is a misconfiguration — the
 * startup warning below flags it explicitly.
 */
export const HOTSPOT_USER_SECRET = process.env.HOTSPOT_USER_SECRET || "";
export const BUSINESS_CLOSE_TIME = process.env.BUSINESS_CLOSE_TIME ?? "22:00";
export const TZ_NAME = process.env.TZ_NAME ?? "Asia/Hebron";
export const MAX_DEVICES_PER_PHONE = Number(process.env.MAX_DEVICES_PER_PHONE ?? 4);
export const INTERNET_BILLING_MODE = (process.env.INTERNET_BILLING_MODE ?? "surcharge") as
  | "surcharge"
  | "replaces";
export const BILLING_MIN_MINUTES = Number(process.env.BILLING_MIN_MINUTES ?? 60);
export const BILLING_INCREMENT_MINUTES = Number(process.env.BILLING_INCREMENT_MINUTES ?? 15);
/**
 * Safety ceiling on a single visit's billable minutes. Even if the visit
 * computation has a bug, no visit can be billed for more than this.
 * Surplus minutes are silently capped (the visitor does not pay for them)
 * and a VISIT_CAPPED audit row is written so ops can spot the bad input.
 *
 * Default: 4 hours. Worst possible invoice on t30 (5 ILS/h) is 20 ILS —
 * a number that can reach the customer without causing harm, while still
 * covering any legitimate single visit (EOD sweep closes sessions daily).
 */
export const INTERNET_MAX_VISIT_MINUTES = Number(process.env.INTERNET_MAX_VISIT_MINUTES ?? 4 * 60);

// --- Startup configuration sanity checks -----------------------------------
// Warn loudly instead of failing the first portal login with a cryptic 500.
if (MIKROTIK_HOST && !HOTSPOT_USER_SECRET) {
  console.warn(
    "[env] WARNING: MIKROTIK_HOST is set but HOTSPOT_USER_SECRET is missing. " +
      "Every WiFi portal login will fail until HOTSPOT_USER_SECRET is configured.",
  );
}

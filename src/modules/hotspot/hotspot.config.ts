/**
 * All configurable numbers in one place.
 * Changing a price or speed requires touching no business logic.
 *
 * IMPORTANT: Router profile names here must EXACTLY match those created
 * on the router in mikrotik/01-hotspot-setup.rsc
 */

import { NetTier, NetUserKind } from "@prisma/client";
import {
  BUSINESS_CLOSE_TIME,
  TZ_NAME,
  MAX_DEVICES_PER_PHONE,
  GUEST_QUICK_LOGIN_CODES,
  INTERNET_BILLING_MODE,
  BILLING_MIN_MINUTES,
  BILLING_INCREMENT_MINUTES,
  INTERNET_MAX_VISIT_MINUTES,
} from "../../lib/env";

export type PlanDef = {
  tier: NetTier;
  label: string;
  mbps: number;
  routerProfile: string;
  hourlyRate: number; // ILS — visitors only
  hint: string;
};

/** Visitor-facing plans */
export const VISITOR_PLANS: PlanDef[] = [
  {
    tier: "t10",
    label: "10 Mbps",
    mbps: 10,
    routerProfile: "visitor-10m",
    hourlyRate: 3,
    hint: "Browsing, email, voice calls",
  },
  {
    tier: "t20",
    label: "20 Mbps",
    mbps: 20,
    routerProfile: "visitor-20m",
    hourlyRate: 4,
    hint: "Video calls, file uploads",
  },
  {
    tier: "t30",
    label: "30 Mbps",
    mbps: 30,
    routerProfile: "visitor-30m",
    hourlyRate: 5,
    hint: "Streaming, large transfers",
  },
];

/** Fixed plan for subscribers, trainees, and employees — free */
export const MEMBER_PLAN: PlanDef = {
  tier: "t10",
  label: "10 Mbps",
  mbps: 10,
  routerProfile: "noon-10m",
  hourlyRate: 0,
  hint: "Included with membership",
};

export const PAID_KINDS: NetUserKind[] = ["visitor"];

// -- Guest quick-login --------------------------------------------------------
// Fixed shared hotspot accounts for walk-in guests (username == password).
// The accounts live on the router under this profile; the backend only
// holds the whitelist so codes can be added/removed without touching
// any login logic. Guest logins NEVER create person/tracking rows.

/** Router hotspot profile the shared guest accounts belong to. */
export const GUEST_SHARED_PROFILE = "guest-shared";

/** Whitelisted guest codes (each doubles as router username+password). */
export const GUEST_SHARED_CODES: readonly string[] = GUEST_QUICK_LOGIN_CODES;

export function isPaid(kind: NetUserKind): boolean {
  return PAID_KINDS.includes(kind);
}

/** Final plan: visitors choose, everyone else gets 10 Mbps free */
export function resolvePlan(kind: NetUserKind, requestedTier?: NetTier | null): PlanDef {
  if (!isPaid(kind)) return MEMBER_PLAN;
  const found = VISITOR_PLANS.find((p) => p.tier === requestedTier);
  return found ?? VISITOR_PLANS[0];
}

// -- Billing ----------------------------------------------------------------

export const BILLING = {
  minMinutes: BILLING_MIN_MINUTES,
  incrementMinutes: BILLING_INCREMENT_MINUTES,
  /**
   * surcharge : internet fee added on top of existing seat price
   * replaces  : internet fee replaces the visitor's hourly seat price
   * WARNING: confirm this before going live to avoid double-billing.
   */
  mode: INTERNET_BILLING_MODE,
};

export function computeAmount(minutes: number, hourlyRate: number): number {
  if (hourlyRate <= 0) return 0;
  const billable = Math.max(minutes, BILLING.minMinutes);
  const rounded = Math.ceil(billable / BILLING.incrementMinutes) * BILLING.incrementMinutes;
  return Math.round((rounded / 60) * hourlyRate * 100) / 100;
}

// -- Business hours ---------------------------------------------------------

export const BUSINESS_CLOSE = BUSINESS_CLOSE_TIME;
export const TIMEZONE = TZ_NAME;

// -- Safety limits ----------------------------------------------------------

export const LIMITS = {
  maxDevicesPerPhone: MAX_DEVICES_PER_PHONE,
  portalRatePerMinute: 20,
  /**
   * Mutable via tests (LIMITS.maxVisitMinutes = N). The top-level
   * beforeEach in hotspot.service.test.ts restores the env default
   * before every test.
   */
  maxVisitMinutes: INTERNET_MAX_VISIT_MINUTES,
};

// -- Phone normalization -----------------------------------------------------

/**
 * Normalize Palestinian phone numbers to local format (05XXXXXXXX).
 * Handles: 0599..., 970599..., 972599..., 599...
 */
export function normalizePhone(raw: string): string | null {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return null;
  let d = digits;
  if (d.startsWith("970")) d = "0" + d.slice(3);
  else if (d.startsWith("972")) d = "0" + d.slice(3);
  if (d.length === 9 && d.startsWith("5")) d = "0" + d;
  if (!/^05\d{8}$/.test(d)) return null;
  return d;
}

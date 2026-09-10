import crypto from "node:crypto";
import { NetTier, NetUserKind } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../lib/ApiError";
import { sessionsService } from "../sessions/service";
import {
  resolvePlan,
  normalizePhone,
  type PlanDef,
} from "../hotspot/hotspot.config";
import { getMikrotik } from "../../lib/mikrotik";
import type { AnoonCheckInInput } from "./schema";

export type AnoonPersonType = "visitor" | "subscriber" | "trainee" | "employee";

export type AnoonCheckInResult = {
  session: any;
  alreadyActive: boolean;
  type: AnoonPersonType;
  person: { id?: string; name: string; phone: string };
  plan: {
    tier: NetTier;
    internetSpeed: string;
    routerProfile: string;
    mbps: number;
    hourlyRate: number;
  };
  source?: string;
  clientCheckinId?: string;
};

/** Incoming "10M"/"20M"/"30M" labels → hotspot tiers. */
const SPEED_TO_TIER: Record<string, NetTier> = {
  "10M": "t10",
  "20M": "t20",
  "30M": "t30",
};

/** Known router profiles → tiers. "noon-10m" maps to t10 so a visitor that
 *  sends it still resolves to the paid visitor-10m plan (never the free one). */
const PROFILE_TO_TIER: Record<string, NetTier> = {
  "visitor-10m": "t10",
  "visitor-20m": "t20",
  "visitor-30m": "t30",
  "noon-10m": "t10",
};

/**
 * Single source of truth for the integration's internet rules:
 *   visitor    → requested 10M/20M/30M (visitor-10m/20m/30m)
 *   subscriber → noon-10m (incoming speed/profile ignored)
 *   trainee    → noon-10m (incoming speed/profile ignored)
 *   employee   → noon-10m (incoming speed/profile ignored)
 *
 * Delegates to the existing hotspot resolvePlan() — no parallel pricing system.
 */
export function resolveEffectivePlan(
  type: AnoonPersonType,
  internetSpeed?: string,
  routerProfile?: string,
): PlanDef {
  if (type !== "visitor") {
    return resolvePlan(type as NetUserKind, null);
  }

  let tier: NetTier = "t10";
  if (internetSpeed) {
    const mapped = SPEED_TO_TIER[internetSpeed];
    if (!mapped) {
      throw new ApiError(400, `Invalid internet speed: ${internetSpeed}`);
    }
    tier = mapped;
  } else if (routerProfile) {
    const mapped = PROFILE_TO_TIER[routerProfile];
    if (!mapped) {
      throw new ApiError(400, `Invalid router profile: ${routerProfile}`);
    }
    tier = mapped;
  }

  if (routerProfile) {
    const profileTier = PROFILE_TO_TIER[routerProfile];
    if (!profileTier) {
      throw new ApiError(400, `Invalid router profile: ${routerProfile}`);
    }
    if (profileTier !== tier) {
      // Speed wins — never silently grant the profile's (higher) tier.
      console.warn(
        `[AnoonCheckIn] visitor speed/profile mismatch (speed=${internetSpeed ?? "-"} profile=${routerProfile}) — speed wins`,
      );
    }
  }

  return resolvePlan("visitor", tier);
}

export class IntegrationsService {
  /**
   * Unified Anoon QR check-in for all four person types.
   *
   * Order: validate (controller) → normalize phone → resolve plan →
   * resolve person → reuse open session or check in → ensure router user
   * (best-effort) → return local result.
   */
  async anoonCheckIn(input: AnoonCheckInInput): Promise<AnoonCheckInResult> {
    const type = (input.type ?? "subscriber") as AnoonPersonType;

    const normalized = normalizePhone(input.phone);
    if (!normalized) {
      throw new ApiError(400, "Invalid phone number — expected format 05XXXXXXXX");
    }
    const phone = normalized;
    const name = input.name.trim();
    const source = input.source;
    const clientCheckinId = input.clientCheckinId;

    const plan = resolveEffectivePlan(type, input.internetSpeed, input.routerProfile);

    if (clientCheckinId || source) {
      console.log(
        `[AnoonCheckIn] type=${type} phone=${phone} source=${source ?? "-"} clientCheckinId=${clientCheckinId ?? "-"}`,
      );
    }

    const visitor = await this.resolvePersonByType(type, phone, name, source);

    const buildResult = (session: any, alreadyActive: boolean): AnoonCheckInResult => ({
      session,
      alreadyActive,
      type,
      person: { id: visitor.id, name: visitor.name ?? name, phone },
      plan: {
        tier: plan.tier,
        internetSpeed: `${plan.mbps}M`,
        routerProfile: plan.routerProfile,
        mbps: plan.mbps,
        hourlyRate: plan.hourlyRate,
      },
      ...(source ? { source } : {}),
      ...(clientCheckinId ? { clientCheckinId } : {}),
    });

    // Idempotency: reuse the person's open session instead of creating another.
    // (sessionsService.checkIn would throw 400 "already checked in" otherwise.)
    const openSession = await prisma.session.findFirst({
      where: { visitorId: visitor.id, checkOut: null },
      include: { visitor: true, snackOrders: true },
    });
    if (openSession) {
      return buildResult(openSession, true);
    }

    let session: any;
    try {
      session = await sessionsService.checkIn({ visitorId: visitor.id });
    } catch (err: any) {
      // Lost race with a concurrent check-in → return the now-open session.
      if (err?.statusCode === 400) {
        const raced = await prisma.session.findFirst({
          where: { visitorId: visitor.id, checkOut: null },
          include: { visitor: true, snackOrders: true },
        });
        if (raced) {
          return buildResult(raced, true);
        }
      }
      throw err;
    }

    // Router provisioning is best-effort: it must never fail the local session.
    await this.ensureRouterUserSafely(phone, visitor.name ?? name, type, plan);

    return buildResult(session, false);
  }

  /**
   * Find-only for subscribers (legacy behavior: 404 "Visitor not found",
   * never auto-create) and Staff (404, never auto-create).
   * Find-or-create for visitors/trainees via the existing Visitor model.
   * Employees anchor their attendance session on a Visitor row because
   * Session.visitorId is required and PersonType has no "employee" value
   * (mirrors how reception checks an employee in as a walk-in today).
   */
  private async resolvePersonByType(
    type: AnoonPersonType,
    phone: string,
    name: string,
    source?: string,
  ): Promise<any> {
    if (type === "subscriber") {
      const visitor = await prisma.visitor.findFirst({
        where: { phone },
        orderBy: { createdAt: "asc" },
      });
      if (!visitor) {
        console.warn(
          `[AnoonCheckIn] No visitor found for phone=${phone} (name=${name}) at ${new Date().toISOString()} — not auto-creating; review Anoon QR subscriber sync/backfill`,
        );
        throw new ApiError(404, "Visitor not found");
      }
      return visitor;
    }

    if (type === "employee") {
      const staff = await prisma.staff.findUnique({
        where: { phone },
        select: { id: true, name: true, phone: true },
      });
      if (!staff) {
        throw new ApiError(404, "Staff member not found");
      }
      return this.findOrCreateVisitor(phone, staff.name ?? name, "visitor", source);
    }

    if (type === "trainee") {
      return this.findOrCreateVisitor(phone, name, "trainee", source);
    }

    return this.findOrCreateVisitor(phone, name, "visitor", source);
  }

  private async findOrCreateVisitor(
    phone: string,
    name: string,
    personType: "visitor" | "trainee",
    source?: string,
  ): Promise<any> {
    const existing = await prisma.visitor.findFirst({
      where: { phone },
      orderBy: { createdAt: "asc" },
    });
    if (existing) return existing;
    return prisma.visitor.create({
      data: { name, phone, type: personType, source: source ?? "QR" },
    });
  }

  /**
   * Provision/update the MikroTik hotspot user for the resolved plan.
   * Failures are logged only — the local session stays successful.
   * Skipped entirely on idempotent replays (alreadyActive).
   */
  private async ensureRouterUserSafely(
    phone: string,
    name: string,
    type: AnoonPersonType,
    plan: PlanDef,
  ): Promise<void> {
    try {
      const secret = process.env.HOTSPOT_USER_SECRET ?? "";
      if (!secret) {
        console.warn("[AnoonCheckIn] HOTSPOT_USER_SECRET is not set — skipping router provisioning");
        return;
      }
      const password = crypto.createHmac("sha256", secret).update(phone).digest("hex").slice(0, 16);
      await getMikrotik().ensureUser({
        name: phone,
        password,
        profile: plan.routerProfile,
        comment: `anoon-checkin | ${type} | ${name}`,
      });
    } catch (err) {
      console.error("[AnoonCheckIn] ensureUser failed — local session kept:", err);
    }
  }

  async anoonVisitorCheckIn(phone: string, name: string): Promise<{ session: any; alreadyActive: boolean }> {
    const { palestineStartOfDay } = await import("../../lib/timezone");
    let visitor = await prisma.visitor.findFirst({ where: { phone } });
    if (!visitor) {
      visitor = await prisma.visitor.create({
        data: { name, phone, type: "visitor" },
      });
    }

    const todayStart = palestineStartOfDay(new Date());

    const existingSession = await prisma.session.findFirst({
      where: {
        visitorId: visitor.id,
        checkOut: null,
        checkIn: { gte: todayStart },
      },
      include: { visitor: true, snackOrders: true },
    });
    if (existingSession) {
      return { session: existingSession, alreadyActive: true };
    }

    const session = await sessionsService.checkIn({ visitorId: visitor.id });
    return { session, alreadyActive: false };
  }
}

export const integrationsService = new IntegrationsService();

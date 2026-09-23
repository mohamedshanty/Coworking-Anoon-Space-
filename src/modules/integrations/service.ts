import { NetTier, NetUserKind } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../lib/ApiError";
import { sessionsService } from "../sessions/service";
import {
  resolvePlan,
  normalizePhone,
  GUEST_SHARED_CODES,
  type PlanDef,
} from "../hotspot/hotspot.config";
import {
  authorizeDeviceAndKnownPeers,
  ensureProfileAllowsMultiDevice,
  routerPasswordFor,
} from "../hotspot/device-auth";
import { getMikrotik, normalizeMac, isValidIpv4 } from "../../lib/mikrotik";
import type { AnoonCheckInInput, GuestQuickLoginInput } from "./schema";

export type AnoonPersonType = "visitor" | "subscriber" | "trainee" | "employee";

/** What the kiosk asked for: unified member tab or walk-in visitor tab. */
export type AnoonRequestedType = "member" | "visitor";

export type AnoonCheckInResult = {
  session: any;
  alreadyActive: boolean;
  /** Resolved person type (legacy `type` field — kept for old clients). */
  type: AnoonPersonType;
  /** What the kiosk sent ("member" covers legacy subscriber/trainee/employee). */
  requestedType: AnoonRequestedType;
  /** Which underlying type `member` resolved to (== type; for QR logging). */
  resolvedType: AnoonPersonType;
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

export type ResolvedMember =
  | { type: "employee"; person: { id: string; name: string; phone: string } }
  | { type: "trainee"; person: any }
  | { type: "subscriber"; person: any };

export type GuestQuickLoginResult = {
  authorized: boolean;
  code: string;
  mac: string;
  ip: string;
};

/**
 * Unified member lookup for the Anoon QR "member" tab: given only a phone
 * number, figure out whether it belongs to an employee, a trainee, or a
 * subscriber. Members are NEVER auto-created — unknown phones get a 404
 * (only the "visitor" tab auto-creates).
 *
 * NOTE on "trainee": Visitor rows with type "trainee", NOT the
 * course-enrollment Trainee model. NOTE on "employee": the EmployeeRoster
 * only — Staff login accounts are deliberately not consulted here.
 *
 * Task 2's creation-time uniqueness guarantee means at most one branch can
 * ever match, so the order below is only a cheap-tables-first perf choice.
 */
export async function resolveMember(phone: string): Promise<ResolvedMember> {
  const roster = await prisma.employeeRoster.findUnique({ where: { phone } });
  if (roster?.active) {
    return { type: "employee", person: roster };
  }

  const trainee = await prisma.visitor.findFirst({
    where: { phone, type: "trainee" },
    orderBy: { createdAt: "asc" },
  });
  if (trainee) {
    return { type: "trainee", person: trainee };
  }

  const subscriber = await prisma.visitor.findFirst({
    where: {
      phone,
      type: "subscriber",
      subscriptions: { some: {} },
    },
    orderBy: { createdAt: "asc" },
  });
  if (subscriber) {
    return { type: "subscriber", person: subscriber };
  }

  console.warn(
    `[AnoonCheckIn] Unregistered member phone=${phone} at ${new Date().toISOString()} — not auto-creating`,
  );
  throw new ApiError(404, "This phone number is not registered. Please contact the front desk.");
}

export class IntegrationsService {
  /**
   * Unified Anoon QR check-in.
   *
   * Two incoming tabs: "member" (backend resolves subscriber / trainee /
   * employee from the phone number) and "visitor" (auto-created).
   * Legacy "subscriber" / "trainee" / "employee" values take the member path.
   *
   * Order: validate (controller) → normalize phone → resolve member →
   * resolve plan (before any write, so a bad visitor speed never creates a
   * row) → anchor attendance person → reuse open session or check in →
   * ensure router user (best-effort) → return local result.
   */
  async anoonCheckIn(input: AnoonCheckInInput): Promise<AnoonCheckInResult> {
    const requested = (input.type ?? "subscriber") as string;
    const requestedType: AnoonRequestedType =
      requested === "visitor" ? "visitor" : "member";

    const normalized = normalizePhone(input.phone);
    if (!normalized) {
      throw new ApiError(
        400,
        "Invalid phone number — expected format 05XXXXXXXX",
      );
    }
    const phone = normalized;
    const name = input.name?.trim() || "";
    const source = input.source;
    const clientCheckinId = input.clientCheckinId;

    // Resolve the real person type first (find-only — members never auto-create).
    let type: AnoonPersonType;
    let memberPerson: any = null;
    if (requestedType === "member") {
      const resolved = await resolveMember(phone);
      type = resolved.type;
      memberPerson = resolved.person;
    } else {
      type = "visitor";
    }

    // Plan resolves before any write, so a bad visitor speed (400) never
    // leaves an orphan auto-created row behind.
    const plan = resolveEffectivePlan(
      type,
      input.internetSpeed,
      input.routerProfile,
    );

    if (clientCheckinId || source) {
      console.log(
        `[AnoonCheckIn] requested=${requestedType} resolved=${type} phone=${phone} source=${source ?? "-"} clientCheckinId=${clientCheckinId ?? "-"}`,
      );
    }

    let visitor: any;
    if (type === "employee") {
      // Session.visitorId is required and PersonType has no "employee"
      // value, so employees anchor their attendance session on a Visitor
      // row (mirrors how reception checks an employee in as a walk-in today).
      visitor = await this.findOrCreateVisitor(
        phone,
        memberPerson?.name ?? name,
        "employee",
        source,
      );
    } else if (type === "visitor") {
      visitor = await this.findOrCreateVisitor(phone, name, "visitor", source);
    } else {
      // Trainee / subscriber: the Visitor row resolveMember already found.
      visitor = memberPerson;
    }

    const buildResult = (
      session: any,
      alreadyActive: boolean,
    ): AnoonCheckInResult => ({
      session,
      alreadyActive,
      type,
      requestedType,
      resolvedType: type,
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
      // Multi-device: this phone is already checked in (e.g. on their phone),
      // but THIS request can carry a NEW device MAC (e.g. the laptop, which
      // reached the kiosk via its own hotspot redirect). The router still
      // needs an /ip/hotspot/active/login for that MAC — without it the
      // second device receives a success-looking alreadyActive:true response
      // yet never gets internet, and no LOGIN audit row is ever written
      // (the previous shared-users fix could not help: the second login was
      // never attempted). Provision best-effort — never throws, never fails
      // the local session.
      if (input.mac) {
        console.log(
          `[AnoonCheckIn] alreadyActive phone=${phone} — authorizing additional device mac=${input.mac} ip=${input.ip ?? "-"}`,
        );
        await this.ensureRouterUserSafely(phone, visitor.name ?? name, type, plan, {
          mac: input.mac,
          ip: input.ip,
        });
      }
      return buildResult(openSession, true);
    }

    let session: any;
    try {
      // Visitor internet-tier rate ALONE represents the visitor's hourly
      // rate (3/4/5 for 10M/20M/30M). Do NOT add the global seat/base price
      // (Settings.hourlyRate) on top — that was the +3 ₪ double-count bug:
      // Session.hourlyRate = base + surcharge showed 6/7/8 on the Live page
      // and checkout then added the internet visit charge AGAIN on top.
      // Members (subscriber/trainee/employee) use the free noon-10m profile
      // and keep the base seat rate (their time is zeroed in pricing anyway).
      // sessionsService.checkIn already accepts an hourlyRate override.
      let finalHourlyRate: number;
      if (type === "visitor") {
        finalHourlyRate = plan.hourlyRate;
      } else {
        const settings = await prisma.settings.findFirst();
        if (!settings) {
          throw new ApiError(500, "Settings not initialized in database");
        }
        finalHourlyRate = Number(settings.hourlyRate);
      }
      session = await sessionsService.checkIn({
        visitorId: visitor.id,
        hourlyRate: finalHourlyRate,
        // Employees are anchored to a visitor row because sessions do not
        // support an employee type.
        type,
      });
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
    await this.ensureRouterUserSafely(phone, visitor.name ?? name, type, plan, {
      mac: input.mac,
      ip: input.ip,
    });

    return buildResult(session, false);
  }

  /**
   * Small resolvers used by resolveMember() below. Members are NEVER
   * auto-created here — only the visitor tab creates rows.
   */
  private async findOrCreateVisitor(
    phone: string,
    name: string,
    personType: "visitor" | "trainee" | "employee",
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
   *
   * When the kiosk forwards the checking-in device's `mac` (hotspot
   * redirect), additionally authorize that device via the SAME shared
   * path the portal login uses (activeLogin + KnownDevice upsert +
   * authorizeKnownDevices for the phone's other devices). Absent `mac`
   * ⇒ exactly the old behavior (ensureUser only). Off-network or
   * malformed `mac` ⇒ skipped silently (warn, never throw).
   */
  private async ensureRouterUserSafely(
    phone: string,
    name: string,
    type: AnoonPersonType,
    plan: PlanDef,
    device?: { mac?: string | null; ip?: string | null },
  ): Promise<void> {
    try {
      const secret = process.env.HOTSPOT_USER_SECRET ?? "";
      if (!secret) {
        console.warn(
          "[AnoonCheckIn] HOTSPOT_USER_SECRET is not set — skipping router provisioning",
        );
        return;
      }
      const password = routerPasswordFor(phone);
      await getMikrotik().ensureUser({
        name: phone,
        password,
        profile: plan.routerProfile,
        comment: `anoon-checkin | ${type} | ${name}`,
      });
      // Same multi-device precondition as the portal flow: one phone user
      // across phone + laptop needs shared-users on the profile.
      // Fail-open (never throws) — see device-auth.ts.
      await ensureProfileAllowsMultiDevice(plan.routerProfile);

      // No device context (every pre-change kiosk payload) ⇒ stop here:
      // behavior is identical to before this change.
      if (!device?.mac) return;

      try {
        await authorizeDeviceAndKnownPeers({
          phone,
          password,
          mac: device.mac,
          ip: device.ip ?? undefined,
          auditDetail: `anoon-kiosk | ${type} | ${plan.routerProfile}`,
        });
      } catch (err) {
        // Best-effort: off-network / malformed MAC / router hiccup must
        // never fail the local session.
        console.warn(
          "[AnoonCheckIn] device authorization skipped — local session kept:",
          err instanceof Error ? err.message : err,
        );
      }
    } catch (err) {
      console.error(
        "[AnoonCheckIn] ensureUser failed — local session kept:",
        err,
      );
    }
  }

  /**
   * Guest quick-login for walk-in guests.
   *
   * HARD CONSTRAINT: this must never create or modify any person/tracking
   * data — no resolveMember(), no Visitor/session/Attendance/KnownDevice
   * rows, no Anoon QR sync, no socket.io events. The ONLY side effect is
   * the RouterOS `/ip/hotspot/active/login` call below (the same low-level
   * mechanism the member/portal flows use via `activeLogin`).
   *
   * Unlike the member flow (best-effort router provisioning with a local
   * session as fallback), router failure here MUST fail the request —
   * there is no fallback record anywhere to check later.
   */
  async guestQuickLogin(input: GuestQuickLoginInput): Promise<GuestQuickLoginResult> {
    const code = input.code.trim();
    if (!GUEST_SHARED_CODES.includes(code)) {
      throw new ApiError(404, "الكود غير صحيح");
    }

    // normalizeMac throws MikrotikError on malformed input — convert to a
    // 400 since the global errorHandler would otherwise surface it as 500.
    let mac: string;
    try {
      mac = normalizeMac(input.mac);
    } catch {
      throw new ApiError(400, "Invalid MAC address");
    }

    const mt = getMikrotik();

    // On-network guard (read-only router query, no local writes): without
    // this, anyone on the internet could authorize an arbitrary MAC.
    // Mirrors the check inside authorizeDeviceAndKnownPeers, minus every
    // tracking write that helper performs.
    let host: any = null;
    try {
      host = await mt.findHost(mac);
    } catch (err) {
      throw new ApiError(502, "Guest internet authorization failed — please try again");
    }
    if (!host) {
      throw new ApiError(403, "This device is not connected to the space network");
    }

    // Prefer the router-observed address (authoritative); fall back to the
    // Kiosk-forwarded IP from the hotspot redirect.
    const rawIp =
      host.address && host.address !== "" ? host.address : input.ip;
    if (!rawIp) {
      throw new ApiError(400, "Could not determine device IP");
    }
    if (!isValidIpv4(rawIp)) {
      throw new ApiError(400, "Invalid IP address");
    }
    const ip = rawIp;

    // Shared guest account: username == password == code. The account
    // already exists on the router under the guest-shared profile, so no
    // ensureUser() provisioning is needed (or wanted).
    try {
      await mt.activeLogin({ user: code, password: code, ip, mac });
    } catch (err) {
      console.error("[GuestQuickLogin] activeLogin failed:", err);
      throw new ApiError(502, "Guest internet authorization failed — please try again");
    }

    return { authorized: true, code, mac, ip };
  }

  async anoonVisitorCheckIn(
    phone: string,
    name: string,
  ): Promise<{ session: any; alreadyActive: boolean }> {
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

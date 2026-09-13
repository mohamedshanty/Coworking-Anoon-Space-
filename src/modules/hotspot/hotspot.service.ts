/**
 * Core noonWiFi logic.
 *
 * Design principle: the network follows attendance, not the other way around.
 * Every internet authorization is linked to an attendance session in noonCowork,
 * and every session end cuts the internet.
 */

import crypto from "node:crypto";
import { NetTier, NetUserKind, NetEndReason, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { HOTSPOT_USER_SECRET } from "../../lib/env";
import { getMikrotik, normalizeMac } from "../../lib/mikrotik";
import { sessionsService } from "../sessions/service";
import { resolveIdentity, ensureVisitor, Identity } from "./identity.service";
import {
  VISITOR_PLANS,
  MEMBER_PLAN,
  resolvePlan,
  isPaid,
  computeAmount,
  normalizePhone,
  LIMITS,
  BILLING,
} from "./hotspot.config";

const log = (...args: unknown[]) => console.log("[hotspot]", ...args);

// ---------------------------------------------------------------------------
// Visit-window constants
// ---------------------------------------------------------------------------

/**
 * How far before the attendance checkIn we are willing to look for the
 * start of the visit. A device often connects to the WiFi a minute or
 * two before reception checks the person in — picking the connect time
 * as the visit start is the natural choice. The 30-minute cap exists so
 * that a stale, never-billed NetSession from a *previous* visit (e.g.
 * one that was force-closed by EOD and never charged) can never reach
 * back and inflate the current visit's bill. Without this cap, an old
 * open row from a week ago would anchor the new visit a week into the
 * past and print a "hundreds of shekels" invoice.
 */
const ANCHOR_TOLERANCE_MIN = 30;

/**
 * Safety ceiling on a single visit's billable minutes — see
 * INTERNET_MAX_VISIT_MINUTES in src/lib/env.ts (exposed as
 * LIMITS.maxVisitMinutes so tests can override it per-test).
 */

// ---------------------------------------------------------------------------
// Router password
// ---------------------------------------------------------------------------

/**
 * Deterministic password derived from phone + server secret.
 * Deterministic => no storage needed, and we can regenerate it to authorize
 * any device later. The secret never leaves the server.
 */
function routerPasswordFor(phone: string): string {
  if (!HOTSPOT_USER_SECRET) throw new Error("HOTSPOT_USER_SECRET is not set");
  return crypto.createHmac("sha256", HOTSPOT_USER_SECRET).update(phone).digest("hex").slice(0, 16);
}

async function audit(
  action: string,
  ok: boolean,
  data: Partial<{ phone: string; mac: string; detail: string }>,
) {
  try {
    await prisma.hotspotAudit.create({
      data: { action, ok, phone: data.phone, mac: data.mac, detail: data.detail },
    });
  } catch {
    /* audit must never fail the operation */
  }
}

// ---------------------------------------------------------------------------
// 1) Portal context — what do we know about this device?
// ---------------------------------------------------------------------------

export type PortalContext = {
  known: boolean;
  phone?: string;
  name?: string;
  kind?: NetUserKind;
  note?: string;
  needsRenewal?: boolean;
  plans: Array<{ tier: NetTier; label: string; mbps: number; hourlyRate: number; hint: string }>;
  choosable: boolean;
  lastTier?: NetTier;
};

export async function getPortalContext(macRaw: string): Promise<PortalContext> {
  const mac = normalizeMac(macRaw);
  const device = await prisma.knownDevice.findUnique({ where: { mac } });

  if (!device || device.isBlocked) {
    return { known: false, plans: publicPlans(VISITOR_PLANS), choosable: true };
  }

  const identity = await resolveIdentity(device.phone);
  const paid = isPaid(identity.kind);

  const last = await prisma.netSession.findFirst({
    where: { phone: device.phone },
    orderBy: { startedAt: "desc" },
    select: { tier: true },
  });

  return {
    known: true,
    phone: device.phone,
    name: identity.name,
    kind: identity.kind,
    note: identity.note,
    needsRenewal: identity.needsRenewal,
    plans: paid ? publicPlans(VISITOR_PLANS) : publicPlans([MEMBER_PLAN]),
    choosable: paid,
    lastTier: last?.tier,
  };
}

function publicPlans(defs: typeof VISITOR_PLANS) {
  return defs.map((p) => ({
    tier: p.tier,
    label: p.label,
    mbps: p.mbps,
    hourlyRate: p.hourlyRate,
    hint: p.hint,
  }));
}

// ---------------------------------------------------------------------------
// 2) Login
// ---------------------------------------------------------------------------

export type LoginInput = {
  mac: string;
  ip: string;
  phone: string;
  name?: string;
  tier?: NetTier;
};

export type LoginResult = {
  ok: true;
  name: string;
  kind: NetUserKind;
  mbps: number;
  hourlyRate: number;
  note?: string;
  needsRenewal?: boolean;
  extraDevicesAuthorized: number;
  netSessionId: string;
};

export async function portalLogin(input: LoginInput): Promise<LoginResult> {
  const mac = normalizeMac(input.mac);
  const phone = normalizePhone(input.phone);
  if (!phone) throw new HotspotHttpError(400, "Invalid phone number");

  const mt = getMikrotik();

  // -- (a) Verify the device is actually on our network --------------------
  // Without this, anyone from the internet could call this endpoint and
  // authorize an arbitrary MAC address.
  const host = await mt.findHost(mac);
  if (!host) {
    await audit("LOGIN", false, { phone, mac, detail: "MAC not in hotspot host" });
    throw new HotspotHttpError(403, "This device is not connected to the space network");
  }
  const ip = host.address && host.address !== "" ? host.address : input.ip;

  // -- (b) Who is this? ---------------------------------------------------
  const identity: Identity = await resolveIdentity(phone, input.name);
  const plan = resolvePlan(identity.kind, input.tier);

  // Employees are identified by their Staff record (Staff.phone @unique).
  // They get the member profile, free internet (hourlyRate=0), and NO
  // attendance session — staff do not consume seats and must never appear
  // in the visitor dashboard or be billed for anything.
  //
  // Why skip Visitor creation instead of passing type:"visitor"+source?
  //   - Avoids debt risk: a Visitor row with paymentStatus:"full_debt"
  //     would be created and could trigger a Debt on the next unattended
  //     close.
  //   - Avoids pollution: staff sessions would show up in getLiveSessions,
  //     getHistory and reports as visitor traffic.
  //   - Respects the schema: PersonType has no "employee" value, so
  //     checkIn would crash or force a lying type.
  const isStaff = identity.kind === "employee";

  // Brand new visitor => create a visitor record (self-registration, no approval)
  let visitorId: string | undefined = isStaff ? undefined : identity.visitorId;
  if (!isStaff && identity.kind === "visitor" && !visitorId) {
    if (!input.name || input.name.trim().length < 2) {
      throw new HotspotHttpError(400, "Name is required on first visit");
    }
    visitorId = await ensureVisitor(phone, input.name.trim());
  }

  // -- (c) Prepare the user on the router ----------------------------------
  const password = routerPasswordFor(phone);
  await mt.ensureUser({
    name: phone,
    password,
    profile: plan.routerProfile,
    comment: `noonWiFi | ${identity.kind} | ${identity.name}`,
  });

  // -- (d) Log in the current device ---------------------------------------
  await mt.activeLogin({ user: phone, password, ip, mac });
  await audit("LOGIN", true, { phone, mac, detail: `${identity.kind} ${plan.routerProfile}` });

  // -- (e) Attendance session in noonCowork --------------------------------
  // Reuse the same service the front desk uses — no duplicate attendance logic.
  // SKIP for staff: PersonType has no "employee", and staff shouldn't appear
  // in the live attendance list. The NetSession below is created with
  // sessionId=null and visitorId=null, which is sufficient to authorise their
  // internet connection.
  let sessionId: string | undefined;
  if (!isStaff) {
    try {
      const session = await sessionsService.checkIn({
        name: identity.name,
        phone,
        type: identity.kind as "visitor" | "subscriber" | "trainee" | "employee",
        source: "WIFI_PORTAL",
      });
      sessionId = session.id;
    } catch (err) {
      // Failed attendance must NOT block internet — the person is standing
      // in front of us. Common case: visitor already has an open session
      // (checked in earlier at reception). Find it so we can link the
      // internet charge to the correct invoice.
      log("checkIn failed", phone, err);
      await audit("LOGIN", false, { phone, mac, detail: "checkIn failed: " + String(err) });

      if (visitorId) {
        const openSession = await prisma.session.findFirst({
          where: { visitorId, checkOut: null },
          select: { id: true },
        });
        sessionId = openSession?.id;
      }
    }
  }

  // -- (f) Save device and network session ---------------------------------
  await upsertDevice(mac, phone, await safeHostname(mac));

  // Close any previous open net session for this phone
  await prisma.netSession.updateMany({
    where: { phone, endedAt: null },
    data: { endedAt: new Date(), endedReason: "superseded" },
  });

  const netSession = await prisma.netSession.create({
    data: {
      phone,
      name: identity.name,
      kind: identity.kind,
      tier: plan.tier,
      hourlyRate: plan.hourlyRate,
      mac,
      ip,
      routerUser: phone,
      sessionId,
      visitorId,
    },
    select: { id: true },
  });

  // -- (g) Re-authorize other known devices for this phone -----------------
  const extra = await authorizeKnownDevices(phone, password, mac);

  // -- (h) Notify Anoon QR (fire-and-forget) -------------------------------
  notifyAnoon(phone).catch(() => {});

  return {
    ok: true,
    name: identity.name,
    kind: identity.kind,
    mbps: plan.mbps,
    hourlyRate: plan.hourlyRate,
    note: identity.note,
    needsRenewal: identity.needsRenewal,
    extraDevicesAuthorized: extra,
    netSessionId: netSession.id,
  };
}

/**
 * Core requirement: "scan QR from phone authorizes laptop automatically."
 * For every known MAC for the same phone: find its current IP from DHCP/ARP,
 * then log it in. Devices not currently connected are silently skipped.
 */
async function authorizeKnownDevices(
  phone: string,
  password: string,
  skipMac: string,
): Promise<number> {
  const mt = getMikrotik();
  const devices = await prisma.knownDevice.findMany({
    where: { phone, isBlocked: false, mac: { not: skipMac } },
    orderBy: { lastSeenAt: "desc" },
    take: LIMITS.maxDevicesPerPhone - 1,
  });

  let count = 0;
  for (const d of devices) {
    try {
      const ip = await mt.findIpByMac(d.mac);
      if (!ip) continue; // device not connected now
      await mt.activeLogin({ user: phone, password, ip, mac: d.mac });
      count++;
      await prisma.knownDevice.update({ where: { id: d.id }, data: { lastSeenAt: new Date() } });
      await audit("REAUTH_DEVICE", true, { phone, mac: d.mac });
    } catch (err) {
      await audit("REAUTH_DEVICE", false, { phone, mac: d.mac, detail: String(err) });
    }
  }
  return count;
}

async function upsertDevice(mac: string, phone: string, hostname: string | null) {
  const count = await prisma.knownDevice.count({ where: { phone } });
  const existing = await prisma.knownDevice.findUnique({ where: { mac } });

  if (!existing && count >= LIMITS.maxDevicesPerPhone) {
    // Delete oldest device instead of rejecting the new one — the person
    // is standing here and needs internet now.
    const oldest = await prisma.knownDevice.findFirst({
      where: { phone },
      orderBy: { lastSeenAt: "asc" },
    });
    if (oldest) await prisma.knownDevice.delete({ where: { id: oldest.id } });
  }

  await prisma.knownDevice.upsert({
    where: { mac },
    create: { mac, phone, hostname },
    update: { phone, hostname: hostname ?? undefined, lastSeenAt: new Date() },
  });
}

async function safeHostname(mac: string): Promise<string | null> {
  try {
    return await getMikrotik().getHostname(mac);
  } catch {
    return null;
  }
}

async function notifyAnoon(phone: string): Promise<void> {
  const base = process.env.ANOON_QR_BASE_URL;
  if (!base) return;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    await fetch(`${base}/checkin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(t);
  }
}

// ---------------------------------------------------------------------------
// 3) Checkout and billing
// ---------------------------------------------------------------------------

export type EndResult = {
  ended: boolean;
  minutes: number;
  amount: number;
  kind?: NetUserKind;
  tier?: NetTier;
};

/**
 * Compute the charge for an entire visit, not for a single NetSession.
 *
 * Why visit-level and not session-level?
 *   - Reconnects (e.g. laptop wakes from sleep, "superseded" rows in the
 *     DB) used to reset the clock. A visitor who connected at 9:00,
 *     disconnected at 11:00, came back at 11:40 and left at 13:00 was
 *     being charged for ~80 min instead of ~240 min — a flat minimum per
 *     disconnect adds up to double-billing on every reconnect.
 *   - Conversely, the idle-reconciliation cron used to END the open
 *     NetSession on disconnect, and a fresh floor-minimum was charged on
 *     reconnect — three minimums for one 4-hour visit.
 *
 * Rules (per the noon WiFi billing redesign):
 *   - The visit starts at the attendance Session's checkIn (or, for
 *     staff / wifi-only users, at the oldest NetSession's startedAt).
 *   - The billed duration is `now − oldest startedAt` within the visit.
 *   - The billed rate is the HIGHEST hourly rate the user touched
 *     during the visit, so they can't game the price by downgrading
 *     their tier right before checkout.
 *   - Subscribers / employees / trainees are excluded (rate = 0).
 *
 * `asOf` lets `endByPhone` pin the moment we close the visit; pending
 * lookups use `new Date()`.
 */
type VisitCharge = {
  /**
   * The NetSession row that carries the billed amount (and label, when
   * posting to the attendance session). In a multi-reconnect visit,
   * this is the LAST (most recently started) row in the set — the rest
   * are stamped billed=true with amount=0.
   */
  carrierNetSession: {
    id: string;
    kind: NetUserKind;
    tier: NetTier;
    hourlyRate: number;
    sessionId: string | null;
    visitorId: string | null;
    startedAt: Date;
  };
  visitStart: Date;
  highestHourlyRate: number;
  highestTier: NetTier;
  minutes: number;
  amount: number;
  /** True when the highest rate in the visit is a paid rate (>0). */
  billable: boolean;
  /** Every NetSession id in this visit (open + closed, unbilled). */
  allNetSessionIds: string[];
};

/**
 * Compute the charge for an entire visit, using explicit membership
 * via NetSession.sessionId instead of a time-based anchor.
 *
 * Membership rules:
 *   - If there is an open attendance session, rows belong to this visit
 *     when `sessionId = attendance.id` (the primary rule — portalLogin
 *     links every new NetSession to the attendance Session it created).
 *     Fallback: rows with `sessionId IS NULL` that started within
 *     ANCHOR_TOLERANCE_MIN before checkIn are also included — this
 *     catches rows created before checkIn linked them (e.g. checkIn
 *     failed at portalLogin time).
 *   - If there is no open attendance session (staff / wifi-only user),
 *     only the open NetSession (endedAt=null) counts.
 *   - If there is neither, the visit has nothing to bill — return null.
 *
 * Stale unbilled rows from previous visits are excluded by the
 * sessionId filter — they carry a different sessionId (or belong to
 * a different attendance session entirely).
 *
 * The carrier is the row with the LATEST startedAt. That's where the
 * bill lands. Every other row in the visit closes with amount=0 so
 * a future visit can't re-bill the same window.
 */
async function computeVisitCharge(phone: string, asOf: Date): Promise<VisitCharge | null> {
  // 1) Anchor: the open attendance Session for this phone, if any.
  const attendance = await prisma.session.findFirst({
    where: { visitor: { phone }, checkOut: null },
    orderBy: { checkIn: "desc" },
    select: { id: true, checkIn: true },
  });

  // 2) Collect unbilled NetSessions belonging to THIS visit.
  //    Membership is explicit: NetSession.sessionId points to the
  //    attendance Session that portalLogin linked it to.
  //    Fallback: rows created before checkIn that were never linked
  //    (sessionId IS NULL) are captured if they fall within the
  //    tolerance window — this handles the edge case where checkIn
  //    failed at portalLogin time.
  //    No attendance (staff / wifi-only): only the open row counts.
  let rows: {
    id: string;
    kind: NetUserKind;
    tier: NetTier;
    hourlyRate: Prisma.Decimal;
    sessionId: string | null;
    visitorId: string | null;
    startedAt: Date;
    endedAt: Date | null;
  }[];

  if (attendance) {
    const tolerance = new Date(
      attendance.checkIn.getTime() - ANCHOR_TOLERANCE_MIN * 60_000,
    );
    rows = await prisma.netSession.findMany({
      where: {
        phone,
        billed: false,
        startedAt: { lte: asOf },
        OR: [
          { sessionId: attendance.id },
          {
            sessionId: null,
            startedAt: { gte: tolerance },
          },
        ],
      },
      orderBy: { startedAt: "asc" },
      select: {
        id: true,
        kind: true,
        tier: true,
        hourlyRate: true,
        sessionId: true,
        visitorId: true,
        startedAt: true,
        endedAt: true,
      },
    });
  } else {
    // No attendance session: staff or wifi-only — only the open row.
    const open = await prisma.netSession.findFirst({
      where: { phone, billed: false, endedAt: null },
      orderBy: { startedAt: "asc" },
      select: {
        id: true,
        kind: true,
        tier: true,
        hourlyRate: true,
        sessionId: true,
        visitorId: true,
        startedAt: true,
        endedAt: true,
      },
    });
    rows = open ? [open] : [];
  }

  if (rows.length === 0) return null;

  // 3) Oldest start, highest rate, and the carrier (latest start).
  //    oldestStart is the literal earliest startedAt in the group —
  //    no clamping needed because stale rows from previous visits
  //    are excluded by the sessionId filter above.
  let oldestStart = rows[0].startedAt;
  let highestRate = -Infinity;
  let highestTier: NetTier = rows[0].tier;
  let carrier = rows[0];
  for (const r of rows) {
    if (r.startedAt < oldestStart) oldestStart = r.startedAt;
    const rate = Number(r.hourlyRate);
    if (rate > highestRate) {
      highestRate = rate;
      highestTier = r.tier;
    }
    if (r.startedAt > carrier.startedAt) carrier = r;
  }

  // 6) Subscribers / employees / trainees pay 0 — no charge to surface.
  if (highestRate <= 0) {
    return {
      carrierNetSession: {
        id: carrier.id,
        kind: carrier.kind,
        tier: carrier.tier,
        hourlyRate: Number(carrier.hourlyRate),
        sessionId: carrier.sessionId,
        visitorId: carrier.visitorId,
        startedAt: carrier.startedAt,
      },
      visitStart: oldestStart,
      highestHourlyRate: highestRate,
      highestTier,
      minutes: 0,
      amount: 0,
      billable: false,
      allNetSessionIds: rows.map((r) => r.id),
    };
  }

  let minutes = Math.max(1, Math.round((asOf.getTime() - oldestStart.getTime()) / 60000));
  // 7) Safety ceiling. If something dragged the visit out past
  //    LIMITS.maxVisitMinutes (e.g. a bad session link), cap the bill
  //    and write an audit row so ops can spot the bad input. The
  //    customer does NOT pay for the surplus minutes.
  if (minutes > LIMITS.maxVisitMinutes) {
    await audit("VISIT_CAPPED", true, {
      phone,
      detail: `capped ${minutes}min → ${LIMITS.maxVisitMinutes}min (oldestStart=${oldestStart.toISOString()})`,
    });
    minutes = LIMITS.maxVisitMinutes;
  }
  const amount = computeAmount(minutes, highestRate);

  return {
    carrierNetSession: {
      id: carrier.id,
      kind: carrier.kind,
      tier: carrier.tier,
      hourlyRate: Number(carrier.hourlyRate),
      sessionId: carrier.sessionId,
      visitorId: carrier.visitorId,
      startedAt: carrier.startedAt,
    },
    visitStart: oldestStart,
    highestHourlyRate: highestRate,
    highestTier,
    minutes,
    amount,
    billable: true,
    allNetSessionIds: rows.map((r) => r.id),
  };
}

/**
 * Read-only: compute the pending internet charge for a phone number
 * WITHOUT closing the NetSession or cutting internet.
 *
 * Called by SessionsService.checkout / checkoutUnpaid BEFORE they calculate
 * the session total, so the internet fee is included in the amount the
 * employee collects. Visit-level: covers the full visit even after
 * reconnects (see computeVisitCharge). Returns null for non-billable
 * kinds (subscribers / employees / trainees).
 */
export async function computePendingInternetCharge(
  phone: string,
): Promise<{ amount: number; minutes: number; tier: NetTier } | null> {
  const visit = await computeVisitCharge(phone, new Date());
  if (!visit || !visit.billable) return null;
  return { amount: visit.amount, minutes: visit.minutes, tier: visit.highestTier };
}

export type EndByPhoneOptions = {
  /**
   * If false, cut the router and close the NetSession with amount=0 and
   * billed=false. No charge is posted to the attendance session.
   * Used by the idle-reconciliation cron so a transient disconnect
   * never resets the visit-level minimum.
   */
  bill?: boolean;
  /**
   * When billing is on, the caller (SessionsService.checkout) has already
   * computed the visit charge via computePendingInternetCharge and
   * written it into session.amount. Pass that exact value here so the
   * NetSession row shows the SAME number — otherwise the NetSession
   * record and the session invoice can disagree if a rounding tick
   * falls between the two reads.
   */
  charge?: { amount: number; minutes: number; tier: NetTier };
};

/**
 * End internet for a phone number. Called from SessionsService.checkout,
 * checkoutUnpaid, the EOD sweep, and the idle-reconciliation cron.
 *
 * Order is intentional:
 *   1. Cut internet FIRST (logoutUser + setUserDisabled) — even if the
 *      DB or visit lookup is corrupted, the person must not stay online.
 *   2. computeVisitCharge(phone, now). If null, there is no WiFi
 *      history to close — return ended:false.
 *   3. If bill === false (idle reconciliation): close ONLY the open
 *      NetSession row (endedAt: null) with minutes:null, amount:0, and
 *      leave `billed` untouched. We do NOT touch superseded rows (they
 *      were closed as "superseded" at reconnect time and must stay
 *      unbilled so a later checkout can still see the visit). We do NOT
 *      touch `billed` either — billed means "charged", and idle
 *      reconciliation does NOT charge. The next checkout will find the
 *      same rows again and bill the visit end-to-end.
 *   4. If bill === true: stamp every row in the visit. The "carrier"
 *      (latest-started) row carries the full amount + minutes; the rest
 *      close with amount=0 so a future visit can't re-bill the same
 *      window. Subscriber/employee visits (highestRate <= 0) also close
 *      with billed=true to mark the visit as resolved.
 *   5. Post the charge label to the attendance session (surcharge mode)
 *      only when billing is on and the carrier row has a sessionId.
 */
export async function endByPhone(
  phone: string,
  reason: NetEndReason = "checkout",
  opts: EndByPhoneOptions = {},
): Promise<EndResult> {
  const bill = opts.bill !== false; // default: bill

  // -- 1) Cut internet --------------------------------------------------
  const mt = getMikrotik();
  try {
    await mt.logoutUser(phone);
    await mt.setUserDisabled(phone, true);
    await audit("LOGOUT", true, { phone, detail: reason });
  } catch (err) {
    await audit("LOGOUT", false, { phone, detail: String(err) });
    log("logout failed", phone, err);
    // Router failed but we MUST still close the session — never leave it open.
  }

  const visit = await computeVisitCharge(phone, new Date());
  if (!visit) return { ended: false, minutes: 0, amount: 0 };

  const endedAt = new Date();

  // -- 2) Idle reconciliation: close the OPEN row only, leave billed ---
  // The open row is the one currently active on the router. The
  // superseded rows (closed at reconnect time with endedReason:
  // "superseded" and billed:false) must stay untouched so a later
  // checkout can still see them and bill the whole visit. The
  // `billed` column is left alone — billed means "charged", and
  // idle reconciliation does not charge.
  if (!bill) {
    const openRow = await prisma.netSession.findFirst({
      where: { phone, endedAt: null },
      select: { id: true, kind: true, tier: true, startedAt: true },
    });
    if (openRow) {
      await prisma.netSession.update({
        where: { id: openRow.id },
        data: {
          endedAt,
          endedReason: reason,
          // minutes:null, amount:0, billed: untouched
        },
      });
    }
    return {
      ended: true,
      minutes: 0,
      amount: 0,
      kind: visit.carrierNetSession.kind,
      tier: visit.highestTier,
    };
  }

  // -- 3) Billing: stamp every row in the visit -----------------------
  // The carrier carries the bill (or amount=0 for non-billable visits).
  // All other rows in the set get amount=0 + billed=true so a future
  // visit never re-bills the same window.
  const willBill = visit.billable;
  const useCallerCharge = willBill && !!opts.charge;
  const minutes = useCallerCharge ? opts.charge!.minutes : visit.minutes;
  const amount = useCallerCharge ? opts.charge!.amount : visit.amount;
  const tier = useCallerCharge ? opts.charge!.tier : visit.highestTier;

  const nonCarrierIds = visit.allNetSessionIds.filter(
    (id) => id !== visit.carrierNetSession.id,
  );

  if (nonCarrierIds.length > 0) {
    await prisma.netSession.updateMany({
      where: { id: { in: nonCarrierIds } },
      data: {
        endedAt,
        minutes: 0,
        amount: 0,
        endedReason: reason,
        billed: true,
      },
    });
  }

  // -- 4) Update the carrier row with the real values ------------------
  await prisma.netSession.update({
    where: { id: visit.carrierNetSession.id },
    data: {
      endedAt,
      minutes: willBill ? minutes : null,
      amount: willBill ? amount : 0,
      endedReason: reason,
      billed: willBill && amount > 0,
    },
  });

  // -- 5) Post the charge label to the attendance session ---------------
  if (willBill && amount > 0 && visit.carrierNetSession.sessionId) {
    try {
      await postCharge({
        sessionId: visit.carrierNetSession.sessionId,
        amount,
        minutes,
        tier,
      });
    } catch (err) {
      log("postCharge failed", phone, err);
      await audit("CHARGE", false, { phone, detail: String(err) });
    }
  }

  return {
    ended: true,
    minutes: willBill ? minutes : 0,
    amount: willBill ? amount : 0,
    kind: visit.carrierNetSession.kind,
    tier,
  };
}

/**
 * Write the internet charge label into the session's adjustmentNote.
 *
 * The actual amount was already included in the session total by
 * SessionsService.checkout / checkoutUnpaid BEFORE endByPhone was called.
 * This function only adds a human-readable description — it does NOT
 * modify session.amount or session.finalPrice.
 */
async function postCharge(args: {
  sessionId: string;
  amount: number;
  minutes: number;
  tier: NetTier;
}): Promise<void> {
  const session = await prisma.session.findUnique({
    where: { id: args.sessionId },
    select: { id: true, adjustmentNote: true },
  });
  if (!session) return;

  const label = `إنترنت ${args.tier.replace("t", "")} ميجا — ${args.minutes} دقيقة`;
  const note = session.adjustmentNote
    ? `${session.adjustmentNote}؛ ${label}`
    : label;

  await prisma.session.update({
    where: { id: args.sessionId },
    data: { adjustmentNote: note },
  });

  await audit("CHARGE", true, {
    detail: `${label} → session ${args.sessionId}`,
  });
}

export async function endByMac(mac: string): Promise<void> {
  const m = normalizeMac(mac);
  await getMikrotik().logoutMac(m);
  await audit("LOGOUT", true, { mac, detail: "ADMIN by mac" });
}

/**
 * Open NetSessions for staff (kind=employee). Used by the live-page
 * header to surface staff that are on the WiFi even though they have
 * no attendance session (A9.3 made that the right behaviour financially,
 * but it left them invisible to the admin).
 */
export async function listConnectedStaff() {
  const open = await prisma.netSession.findMany({
    where: { endedAt: null, kind: "employee" },
    orderBy: { startedAt: "asc" },
    select: {
      id: true,
      phone: true,
      name: true,
      tier: true,
      mac: true,
      ip: true,
      startedAt: true,
    },
  });
  return open;
}

// ---------------------------------------------------------------------------
// 4) End-of-day sweep (stub — will be implemented in A7)
// ---------------------------------------------------------------------------

export async function endOfDaySweep(): Promise<{ visitors: number; errors: number }> {
  const open = await prisma.netSession.findMany({
    where: { endedAt: null, kind: "visitor" },
    select: { phone: true },
  });

  let errors = 0;
  for (const s of open) {
    try {
      await endByPhone(s.phone, "end_of_day");
    } catch (err) {
      errors++;
      log("EOD failed", s.phone, err);
    }
  }
  await audit("EOD_SWEEP", errors === 0, { detail: `${open.length} visitors, ${errors} errors` });
  return { visitors: open.length, errors };
}

// ---------------------------------------------------------------------------

export class HotspotHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HotspotHttpError";
  }
}

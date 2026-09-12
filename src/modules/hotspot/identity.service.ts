/**
 * Identify a person by phone number.
 *
 * Priority order (intentional — employee first so they're never billed
 * as a visitor even if they once checked in as one):
 *   1. EMPLOYEE  — Staff record exists (matched by normalized phone)
 *   2. SUBSCRIBER — has an active (or expired) Subscription
 *   3. TRAINEE   — enrolled in a Course whose date range includes today
 *   4. VISITOR   — everything else
 *
 * NOTE on Visitor.phone: not @unique in the schema, so a phone can map
 * to multiple Visitor rows. A production audit (2026-09-02) found 3
 * duplicated numbers — including a subscriber whose duplicate plain-visitor
 * row could have made findFirst return the wrong row and bill them as a
 * visitor. Mitigations below:
 *   - The subscriber query filters on type:"subscriber" + has-subscription,
 *     so a duplicate plain-visitor row can never shadow a subscriber.
 *   - Both visitor queries order by createdAt for a deterministic pick.
 * The duplicate rows themselves still need manual dedupe in the DB.
 */

import { NetUserKind } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { normalizePhone } from "./hotspot.config";
import { getEffectiveStatus } from "../../lib/subscription";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Identity = {
  kind: NetUserKind;
  phone: string;
  name: string;
  visitorId?: string;
  /** Only set for subscribers */
  subscriberId?: string;
  /** Only set for employees */
  staffId?: string;
  /** Displayed in the portal, e.g. "Monthly subscription active" */
  note?: string;
  /** Expired subscription — let them in but show a renewal prompt */
  needsRenewal?: boolean;
};

// ---------------------------------------------------------------------------
// resolveIdentity
// ---------------------------------------------------------------------------

export async function resolveIdentity(
  rawPhone: string,
  fallbackName?: string,
): Promise<Identity> {
  const phone = normalizePhone(rawPhone);
  if (!phone) {
    return { kind: "visitor", phone: rawPhone, name: fallbackName ?? "Unknown" };
  }

  // ── 1) Employee ────────────────────────────────────────────────────────
  // Staff.phone is @unique. Match first — staff must never be billed as a
  // visitor even if a stale Visitor row exists with the same phone.
  const staff = await prisma.staff.findUnique({
    where: { phone },
    select: { id: true, name: true },
  });
  if (staff) {
    return {
      kind: "employee",
      phone,
      name: staff.name ?? fallbackName ?? phone,
      staffId: staff.id,
      note: "Staff",
    };
  }

  // ── 2) Subscriber ──────────────────────────────────────────────────────
  // Find Visitor with type=subscriber by phone, then get their latest Subscription.
  // The filter on type + subscriptions is deliberate: Visitor.phone is NOT
  // unique, and a duplicate plain-visitor row with the same phone must never
  // shadow a subscriber (otherwise they'd be billed as a visitor).
  const subscriberVisitor = await prisma.visitor.findFirst({
    where: { phone, type: "subscriber", subscriptions: { some: {} } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      subscriptions: {
        orderBy: { startDate: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          endDate: true,
          packageType: true,
        },
      },
    },
  });

  if (subscriberVisitor && subscriberVisitor.subscriptions.length > 0) {
    const sub = subscriberVisitor.subscriptions[0];
    const effective = getEffectiveStatus(sub);
    const active = effective === "active";

    return {
      kind: "subscriber",
      phone,
      name: subscriberVisitor.name ?? fallbackName ?? phone,
      visitorId: subscriberVisitor.id,
      subscriberId: sub.id,
      needsRenewal: !active,
      note: active
        ? `${labelPackage(sub.packageType)} subscription active`
        : "Subscription expired — please renew at reception",
    };
  }

  // ── 3) Trainee ─────────────────────────────────────────────────────────
  // Trainee model stores phone directly. Course date range must include today.
  const today = new Date();
  const enrollment = await prisma.trainee.findFirst({
    where: {
      phone,
      course: {
        startDate: { lte: today },
        endDate: { gte: today },
      },
    },
    select: {
      id: true,
      name: true,
      course: { select: { name: true } },
    },
  });

  if (enrollment) {
    return {
      kind: "trainee",
      phone,
      name: enrollment.name ?? fallbackName ?? phone,
      note: `Trainee in ${enrollment.course?.name ?? "course"}`,
    };
  }

  // ── 4) Visitor ─────────────────────────────────────────────────────────
  // May already exist from a previous visit or QR check-in. Phone is not
  // unique — pick deterministically (oldest registration) so duplicates at
  // least resolve consistently.
  const visitor = await prisma.visitor.findFirst({
    where: { phone },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  return {
    kind: "visitor",
    phone,
    name: visitor?.name ?? fallbackName ?? "Visitor",
    visitorId: visitor?.id,
  };
}

// ---------------------------------------------------------------------------
// ensureVisitor
// ---------------------------------------------------------------------------

/**
 * Find or create a Visitor record. Does NOT open an attendance session —
 * that is portalLogin's responsibility via sessionsService.checkIn.
 *
 * Returns the visitor ID.
 */
export async function ensureVisitor(phone: string, name: string): Promise<string> {
  const normalized = normalizePhone(phone) ?? phone;

  const existing = await prisma.visitor.findFirst({
    where: { phone: normalized },
    select: { id: true },
  });
  if (existing) return existing.id;

  // Brand new self-registration from the WiFi portal — tag it so the
  // report can distinguish "registered themselves via the portal" from
  // "checked in by reception". Without this source, the same phone on
  // its second visit is already in the DB and checkIn won't overwrite
  // the source it set the first time.
  const created = await prisma.visitor.create({
    data: { name, phone: normalized, type: "visitor", source: "WIFI_PORTAL" },
    select: { id: true },
  });
  return created.id;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function labelPackage(pkg?: string | null): string {
  switch (pkg) {
    case "weekly":
      return "Weekly";
    case "monthly":
      return "Monthly";
    case "half_month":
      return "Half-month";
    default:
      return "";
  }
}

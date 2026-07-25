/**
 * Returns the effective current status of a subscription.
 *
 * The stored `status` field is never auto-updated when endDate passes,
 * so we compute the real status on the fly:
 *   - If status is "active" but endDate < now → "expired"
 *   - Otherwise → return the stored status as-is
 */

import { prisma } from "./prisma";

type Status = "active" | "expired" | "paused" | "renewing";

interface HasStatusAndEndDate {
  status: Status;
  endDate: Date | string;
}

export function getEffectiveStatus(sub: HasStatusAndEndDate): Status {
  if (sub.status === "active" && new Date(sub.endDate) < new Date()) {
    return "expired";
  }
  return sub.status;
}

/**
 * Returns true if the subscription is considered "currently active" for
 * pricing / quota purposes: status is "active" AND endDate has not passed.
 */
export function isActiveSubscription(sub: HasStatusAndEndDate): boolean {
  return getEffectiveStatus(sub) === "active";
}

/**
 * Opportunistic background job: update all subscriptions where
 * status = "active" but endDate has passed → set to "expired".
 *
 * Runs on startup and then every 24 hours.
 */
export async function expireStaleSubscriptions(): Promise<number> {
  const result = await prisma.subscription.updateMany({
    where: {
      status: "active",
      endDate: { lt: new Date() },
    },
    data: { status: "expired" },
  });
  if (result.count > 0) {
    console.log(`[subscription-expiry] Auto-expired ${result.count} subscription(s)`);
  }
  return result.count;
}

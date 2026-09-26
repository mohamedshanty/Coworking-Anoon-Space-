/**
 * Shared hotspot device-authorization logic.
 *
 * Single source of truth for: verify-mac-on-network → activeLogin →
 * persist/update KnownDevice → authorizeKnownDevices.
 *
 * Both the noonCowork portal flow (`portalLogin` in hotspot.service.ts)
 * and the Anoon kiosk flow (`anoonCheckIn` in integrations/service.ts)
 * call `authorizeDeviceAndKnownPeers` below — the sequence is NOT
 * duplicated between the two callers.
 */

import crypto from "node:crypto";
import { prisma } from "../../lib/prisma";
import { HOTSPOT_USER_SECRET } from "../../lib/env";
import { getMikrotik, normalizeMac, isValidIpv4 } from "../../lib/mikrotik";
import { LIMITS } from "./hotspot.config";

// ---------------------------------------------------------------------------
// Errors
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

// ---------------------------------------------------------------------------
// Router password
// ---------------------------------------------------------------------------

/**
 * Deterministic password derived from phone + server secret.
 * Deterministic => no storage needed, and we can regenerate it to authorize
 * any device later. The secret never leaves the server.
 */
export function routerPasswordFor(phone: string): string {
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
// Known devices
// ---------------------------------------------------------------------------

/**
 * Self-heal the router precondition for multi-device logins: the hotspot
 * user profile must allow at least LIMITS.maxDevicesPerPhone simultaneous
 * sessions (same phone user logs in from phone + laptop + ...).
 *
 * Fail-open by design: if the router refuses (e.g. API user without write
 * permission) we audit + warn and continue — a single-device login must
 * never regress because of this hardening. Never throws.
 */
export async function ensureProfileAllowsMultiDevice(profile: string): Promise<void> {
  try {
    const res = await getMikrotik().ensureProfileSharedUsers(
      profile,
      LIMITS.maxDevicesPerPhone,
    );
    if (res.changed) {
      console.warn(
        `[hotspot] raised ${profile} shared-users ${res.previous} → ${LIMITS.maxDevicesPerPhone} for multi-device logins`,
      );
      await audit("PROFILE_FIX", true, {
        detail: `${profile} shared-users ${res.previous} → ${LIMITS.maxDevicesPerPhone}`,
      });
    }
  } catch (err) {
    console.warn(
      `[hotspot] could not enforce shared-users on profile ${profile} (single-device logins unaffected):`,
      err instanceof Error ? err.message : err,
    );
    await audit("PROFILE_FIX", false, {
      detail: `${profile}: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

/**
 * Core requirement: "scan QR from phone authorizes laptop automatically."
 * For every known MAC for the same phone: find its current IP from DHCP/ARP,
 * then log it in. Devices not currently connected are silently skipped.
 */
export async function authorizeKnownDevices(
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
  // No cap on devices per phone: every new device that logs in with a known
  // phone number gets its own KnownDevice row (one row per phone+mac pair,
  // growing unbounded). Never delete or overwrite another device's row.
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

// ---------------------------------------------------------------------------
// Shared entry point
// ---------------------------------------------------------------------------

export type AuthorizeDeviceInput = {
  /** Already-normalized phone (05XXXXXXXX). */
  phone: string;
  /** Router password for this phone (see routerPasswordFor). */
  password: string;
  /** Raw MAC from the caller — normalized here (throws on malformed). */
  mac: string;
  /** Fallback IP when the router host row has no address. */
  ip?: string | null;
  /** Audit detail for the LOGIN row (e.g. "<kind> <routerProfile>"). */
  auditDetail?: string;
};

export type AuthorizeDeviceResult = {
  /** Resolved IP the device was authorized with. */
  ip: string;
  extraDevicesAuthorized: number;
};

/**
 * Verify the MAC is on-network, log it in, persist the KnownDevice row,
 * and re-authorize the phone's other known devices.
 *
 * Throws HotspotHttpError(403) when the MAC is not in the hotspot host
 * table (mirrors portalLogin's on-network check), and throws on malformed
 * MAC / invalid IP via normalizeMac / activeLogin. Callers that must stay
 * best-effort (Anoon kiosk) catch and skip silently.
 */
export async function authorizeDeviceAndKnownPeers(
  input: AuthorizeDeviceInput,
): Promise<AuthorizeDeviceResult> {
  const mac = normalizeMac(input.mac);
  const mt = getMikrotik();

  // Trace the raw device identity every attempt (both portal and kiosk flows
  // share this path): when a "second device gets no internet" report comes
  // in, the PM2 log shows exactly which mac/ip the backend tried to log in
  // and the HotspotAudit LOGIN row shows the router's verdict.
  console.log(
    `[hotspot] authorize attempt phone=${input.phone} mac=${mac} ip=${input.ip ?? "-"}`,
  );

  // -- (a) Verify the device is actually on our network --------------------
  // Without this, anyone from the internet could call the endpoint and
  // authorize an arbitrary MAC address.
  const host = await mt.findHost(mac);
  if (!host) {
    await audit("LOGIN", false, { phone: input.phone, mac, detail: "MAC not in hotspot host" });
    throw new HotspotHttpError(403, "This device is not connected to the space network");
  }

  // Prefer the router-observed address (authoritative); fall back to the
  // caller-supplied IP, then to a DHCP/ARP lookup.
  let ip = host.address && host.address !== "" ? host.address : (input.ip ?? "");
  if (!ip || !isValidIpv4(ip)) {
    try {
      const fallback = await mt.findIpByMac(mac);
      if (fallback) ip = fallback;
    } catch {
      /* fall through — activeLogin below validates and throws */
    }
  }

  // -- (b) Log in the current device ---------------------------------------
  // NOTE: a second device for the same phone fails here when the router
  // profile's shared-users is 1 (RouterOS default) while the first device
  // is still active. Audit the failure explicitly (MAC + router error) so a
  // "laptop gets no internet" report is diagnosable from HotspotAudit
  // instead of a bare 500. The upsert below only runs on success.
  try {
    await mt.activeLogin({ user: input.phone, password: input.password, ip, mac });
  } catch (err) {
    const detail = `activeLogin failed: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[hotspot] ${detail} (phone=${input.phone} mac=${mac} ip=${ip})`);
    await audit("LOGIN", false, { phone: input.phone, mac, detail });
    throw err;
  }
  await audit("LOGIN", true, {
    phone: input.phone,
    mac,
    detail: input.auditDetail ?? "device-auth",
  });

  // -- (c) Save device ------------------------------------------------------
  await upsertDevice(mac, input.phone, await safeHostname(mac));

  // -- (d) Re-authorize the phone's other known devices ---------------------
  const extra = await authorizeKnownDevices(input.phone, input.password, mac);

  return { ip, extraDevicesAuthorized: extra };
}

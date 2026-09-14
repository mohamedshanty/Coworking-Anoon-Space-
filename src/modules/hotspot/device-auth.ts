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
  await mt.activeLogin({ user: input.phone, password: input.password, ip, mac });
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

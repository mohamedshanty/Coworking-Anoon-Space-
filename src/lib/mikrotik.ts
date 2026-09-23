/**
 * MikroTik RouterOS Binary API client (port 8728).
 * Compatible with v6.49.19. Does NOT use REST (unavailable before v7.1).
 *
 *   npm i node-routeros
 *
 * node-routeros conventions:
 *   - First element is the command path: '/ip/hotspot/user/print'
 *   - '=key=value' for add/set/command values
 *   - '?key=value' for query filters (print)
 *   - Responses are arrays of objects with RouterOS key names ('.id', 'mac-address'...)
 */

import { RouterOSAPI } from "node-routeros";
import {
  MIKROTIK_HOST,
  MIKROTIK_USER,
  MIKROTIK_PASSWORD,
  MIKROTIK_PORT,
  MIKROTIK_TIMEOUT_SEC,
} from "./env";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MikrotikConfig = {
  host: string;
  user: string;
  password: string;
  port?: number;
  timeoutSec?: number;
};

export type HotspotHost = {
  id: string;
  mac: string;
  address?: string;
  toAddress?: string;
  authorized: boolean;
  bypassed: boolean;
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class MikrotikError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "MikrotikError";
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalize MAC to uppercase AA:BB:CC:DD:EE:FF */
export function normalizeMac(raw: string): string {
  const hex = (raw || "").replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  if (hex.length !== 12) throw new MikrotikError(`Invalid MAC: ${raw}`);
  return hex.match(/.{2}/g)!.join(":");
}

export function isValidIpv4(ip: string): boolean {
  return (
    /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) &&
    ip.split(".").every((o) => Number(o) >= 0 && Number(o) <= 255)
  );
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

class MikrotikClient {
  private conn: RouterOSAPI | null = null;
  private connecting: Promise<RouterOSAPI> | null = null;

  constructor(private cfg: MikrotikConfig) {}

  // -- Connection management ------------------------------------------------

  /**
   * Single persistent connection. On network error the reference is dropped
   * and the next call reconnects. `keepalive` prevents idle disconnects.
   */
  private async connect(): Promise<RouterOSAPI> {
    if (this.conn?.connected) return this.conn;
    if (this.connecting) return this.connecting;

    this.connecting = (async () => {
      const api = new RouterOSAPI({
        host: this.cfg.host,
        user: this.cfg.user,
        password: this.cfg.password,
        port: this.cfg.port ?? 8728,
        timeout: this.cfg.timeoutSec ?? 8,
        keepalive: true,
      });
      try {
        await api.connect();
      } catch (err) {
        this.connecting = null;
        throw new MikrotikError("Failed to connect to router", err);
      }
      api.on("error", () => {
        this.conn = null;
      });
      api.on("close", () => {
        this.conn = null;
      });
      this.conn = api;
      this.connecting = null;
      return api;
    })();

    return this.connecting;
  }

  /** Execute a command with one retry on connection loss */
  private async write(cmd: string[]): Promise<any[]> {
    try {
      const api = await this.connect();
      return await api.write(cmd);
    } catch (err) {
      this.conn = null;
      try {
        const api = await this.connect();
        return await api.write(cmd);
      } catch (err2) {
        throw new MikrotikError(`Command failed: ${cmd[0]}`, err2);
      }
    }
  }

  async ping(): Promise<boolean> {
    const res = await this.write(["/system/identity/print"]);
    return Array.isArray(res);
  }

  // -- Diagnostics (used by scripts/mikrotik-check.ts) ------------------------

  /** Router resource info: version, board-name, uptime, cpu-load... */
  async getResource(): Promise<any> {
    const res = await this.write(["/system/resource/print"]);
    return res[0] ?? {};
  }

  /** All hotspot user profiles (noon-10m, visitor-*, default...) */
  async listUserProfiles(): Promise<any[]> {
    return this.write(["/ip/hotspot/user/profile/print"]);
  }

  /**
   * Multi-device precondition: every device logs in as hotspot user = the
   * phone number, so the profile's `shared-users` MUST allow at least
   * `minShared` simultaneous sessions — otherwise the second device's
   * /ip/hotspot/active/login is rejected ("simultaneous session limit
   * reached") and the laptop never gets internet, with no KnownDevice row
   * written (the upsert runs after the login).
   *
   * Self-heals a router that was configured without shared-users (RouterOS
   * default is 1): prints the profile, raises shared-users when below `min`,
   * and reports whether anything changed. Throws when the profile does not
   * exist — profiles are required infrastructure (see mikrotik:check).
   */
  async ensureProfileSharedUsers(
    profileName: string,
    minShared: number,
  ): Promise<{ changed: boolean; previous: number }> {
    const res = await this.write([
      "/ip/hotspot/user/profile/print",
      `?name=${profileName}`,
    ]);
    const profile = res[0];
    if (!profile) {
      throw new MikrotikError(`Hotspot user profile not found: ${profileName}`);
    }
    const current = Number.parseInt(String(profile["shared-users"] ?? ""), 10);
    const previous = Number.isFinite(current) ? current : 0;
    if (previous >= minShared) return { changed: false, previous };
    await this.write([
      "/ip/hotspot/user/profile/set",
      `=.id=${profile[".id"]}`,
      `=shared-users=${minShared}`,
    ]);
    return { changed: true, previous };
  }

  /** Hotspot servers (idle-timeout, keepalive-timeout, addresses-per-mac...) */
  async listServers(): Promise<any[]> {
    return this.write(["/ip/hotspot/print"]);
  }

  /** Count of devices currently in the hotspot host table */
  async countHosts(): Promise<number> {
    const res = await this.write(["/ip/hotspot/host/print"]);
    return res.length;
  }

  /** Count of active (authorized) hotspot sessions */
  async countActive(): Promise<number> {
    const res = await this.write(["/ip/hotspot/active/print"]);
    return res.length;
  }

  async close(): Promise<void> {
    if (this.conn?.connected) await this.conn.close();
    this.conn = null;
  }

  // -- Hotspot users --------------------------------------------------------

  async findUser(name: string): Promise<any | null> {
    const res = await this.write(["/ip/hotspot/user/print", `?name=${name}`]);
    return res[0] ?? null;
  }

  /**
   * Create or update a hotspot user (name = phone number, stable across visits).
   */
  async ensureUser(opts: {
    name: string;
    password: string;
    profile: string;
    comment?: string;
  }): Promise<void> {
    const existing = await this.findUser(opts.name);
    const params = [
      `=password=${opts.password}`,
      `=profile=${opts.profile}`,
      `=comment=${opts.comment ?? "noonWiFi"}`,
      "=disabled=no",
    ];
    if (existing) {
      await this.write(["/ip/hotspot/user/set", `=.id=${existing[".id"]}`, ...params]);
    } else {
      await this.write(["/ip/hotspot/user/add", `=name=${opts.name}`, ...params]);
    }
  }

  async setUserDisabled(name: string, disabled: boolean): Promise<void> {
    const u = await this.findUser(name);
    if (!u) return;
    await this.write([
      "/ip/hotspot/user/set",
      `=.id=${u[".id"]}`,
      `=disabled=${disabled ? "yes" : "no"}`,
    ]);
  }

  async removeUser(name: string): Promise<void> {
    const u = await this.findUser(name);
    if (!u) return;
    await this.write(["/ip/hotspot/user/remove", `=.id=${u[".id"]}`]);
  }

  // -- Server-side login ----------------------------------------------------

  /**
   * The core command for this system.
   * Available since RouterOS v6.34 — logs in a device without any browser
   * interaction, eliminating CHAP and mixed-content issues.
   */
  async activeLogin(opts: {
    user: string;
    password: string;
    ip: string;
    mac: string;
  }): Promise<void> {
    if (!isValidIpv4(opts.ip)) throw new MikrotikError(`Invalid IP: ${opts.ip}`);
    await this.write([
      "/ip/hotspot/active/login",
      `=user=${opts.user}`,
      `=password=${opts.password}`,
      `=ip=${opts.ip}`,
      `=mac-address=${normalizeMac(opts.mac)}`,
    ]);
  }

  async listActiveByUser(user: string): Promise<any[]> {
    return this.write(["/ip/hotspot/active/print", `?user=${user}`]);
  }

  /**
   * All active hotspot sessions in ONE round-trip. The idle-reconciliation
   * cron builds a local Set from this instead of querying per phone —
   * with N open sessions that turns N+1 router calls into 1.
   */
  async listActive(): Promise<any[]> {
    return this.write(["/ip/hotspot/active/print"]);
  }

  /** Logout all active sessions for a phone number (all its devices) */
  async logoutUser(user: string): Promise<number> {
    const active = await this.listActiveByUser(user);
    for (const a of active) {
      await this.write(["/ip/hotspot/active/remove", `=.id=${a[".id"]}`]);
    }
    return active.length;
  }

  async logoutMac(mac: string): Promise<number> {
    const m = normalizeMac(mac);
    const active = await this.write(["/ip/hotspot/active/print", `?mac-address=${m}`]);
    for (const a of active) {
      await this.write(["/ip/hotspot/active/remove", `=.id=${a[".id"]}`]);
    }
    return active.length;
  }

  /** Logout all sessions — used in end-of-day cron as a final sweep */
  async logoutAll(): Promise<number> {
    const active = await this.write(["/ip/hotspot/active/print"]);
    for (const a of active) {
      await this.write(["/ip/hotspot/active/remove", `=.id=${a[".id"]}`]);
    }
    return active.length;
  }

  // -- Device discovery -----------------------------------------------------

  /**
   * Hotspot host table: every device connected to the network, authorized or not.
   * Used to verify that a MAC from the portal is actually on our network.
   */
  async findHost(mac: string): Promise<HotspotHost | null> {
    const m = normalizeMac(mac);
    const res = await this.write(["/ip/hotspot/host/print", `?mac-address=${m}`]);
    const h = res[0];
    if (!h) return null;
    return {
      id: h[".id"],
      mac: h["mac-address"],
      address: h["address"],
      toAddress: h["to-address"],
      authorized: h["authorized"] === "true",
      bypassed: h["bypassed"] === "true",
    };
  }

  /**
   * Find the current IP for a MAC address.
   * Lookup order: hotspot host → DHCP lease → ARP table.
   */
  async findIpByMac(mac: string): Promise<string | null> {
    const m = normalizeMac(mac);

    const host = await this.findHost(m);
    if (host?.address && isValidIpv4(host.address)) return host.address;

    const leases = await this.write([
      "/ip/dhcp-server/lease/print",
      `?mac-address=${m}`,
      "?status=bound",
    ]);
    const lease = leases[0]?.["active-address"] ?? leases[0]?.["address"];
    if (lease && isValidIpv4(lease)) return lease;

    const arp = await this.write(["/ip/arp/print", `?mac-address=${m}`]);
    const arpIp = arp[0]?.["address"];
    if (arpIp && isValidIpv4(arpIp)) return arpIp;

    return null;
  }

  async getHostname(mac: string): Promise<string | null> {
    const m = normalizeMac(mac);
    const leases = await this.write(["/ip/dhcp-server/lease/print", `?mac-address=${m}`]);
    return leases[0]?.["host-name"] ?? null;
  }
}

// -- Singleton ------------------------------------------------------------

let instance: MikrotikClient | null = null;

export function getMikrotik(): MikrotikClient {
  if (!instance) {
    if (!MIKROTIK_HOST || !MIKROTIK_USER || !MIKROTIK_PASSWORD) {
      throw new MikrotikError("MIKROTIK_* environment variables are not configured");
    }
    instance = new MikrotikClient({
      host: MIKROTIK_HOST,
      user: MIKROTIK_USER,
      password: MIKROTIK_PASSWORD,
      port: MIKROTIK_PORT,
      timeoutSec: MIKROTIK_TIMEOUT_SEC,
    });
  }
  return instance;
}

export type { MikrotikClient };

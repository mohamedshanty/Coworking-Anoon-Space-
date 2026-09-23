/**
 * MikroTik connection health check.
 *
 * Usage:  npx tsx scripts/mikrotik-check.ts
 *         npm run mikrotik:check
 *
 * Checks:
 *   1. Connection + system identity (version, board name)
 *   2. Hotspot user profiles exist (noon-10m, visitor-10m, visitor-20m, visitor-30m)
 *      AND each allows enough simultaneous sessions (shared-users) for
 *      multi-device logins (same phone on phone + laptop)
 *   3. Hotspot server settings (idle-timeout, keepalive-timeout,
 *      addresses-per-mac) — printed for review
 *   4. Host count (/ip hotspot host) and active session count (/ip hotspot active)
 *
 * Exits with code 1 on any failure with a specific error message.
 */

import { getMikrotik, MikrotikError } from "../src/lib/mikrotik";
import { MAX_DEVICES_PER_PHONE } from "../src/lib/env";

const REQUIRED_PROFILES = ["noon-10m", "visitor-10m", "visitor-20m", "visitor-30m"];

function fail(msg: string, cause?: unknown): never {
  console.error(`[mikrotik:check] FAIL: ${msg}`);
  if (cause instanceof Error) {
    console.error(`  cause: ${cause.message}`);
  }
  process.exit(1);
}

async function main() {
  const client = getMikrotik();

  // ── 1. Connection + identity ──────────────────────────────────────────
  let res: any;
  try {
    res = await client.getResource();
  } catch (err) {
    if (err instanceof MikrotikError && err.cause instanceof Error) {
      const msg = err.cause.message.toLowerCase();
      if (msg.includes("econnrefused") || msg.includes("enotfound") || msg.includes("timeout")) {
        fail("Network unreachable — cannot reach the router at the configured host/port", err.cause);
      }
      if (msg.includes("authentication") || msg.includes("invalid user") || msg.includes("login failed")) {
        fail("Authentication rejected — check MIKROTIK_USER and MIKROTIK_PASSWORD", err.cause);
      }
    }
    fail(`Connection failed: ${err instanceof Error ? err.message : String(err)}`, err);
  }

  console.log("[mikrotik:check] ✓ Connected to router");
  console.log(`  version   : ${res?.["version"] ?? "unknown"}`);
  console.log(`  board-name: ${res?.["board-name"] ?? "unknown"}`);
  console.log(`  identity  : ${res?.["identity"] ?? "unknown"}`);

  // ── 2. Hotspot user profiles ──────────────────────────────────────────
  let profiles: any[];
  try {
    profiles = await client.listUserProfiles();
  } catch (err) {
    if (err instanceof MikrotikError && err.cause instanceof Error) {
      const msg = err.cause.message.toLowerCase();
      if (msg.includes("invalid command") || msg.includes("no such command")) {
        fail("Unsupported command — /ip hotspot user/profile/print is not available on this RouterOS version", err.cause);
      }
    }
    fail(`Failed to list user profiles: ${err instanceof Error ? err.message : String(err)}`, err);
  }

  const profileNames = profiles.map((p: any) => p?.name).filter(Boolean);
  const missing = REQUIRED_PROFILES.filter((p) => !profileNames.includes(p));

  console.log(`\n[mikrotik:check] Hotspot user profiles (${profiles.length} total):`);
  for (const p of profiles) {
    const marker = REQUIRED_PROFILES.includes(p.name) ? " ✓" : "";
    console.log(`  - ${p.name} (shared-users=${p?.["shared-users"] ?? "?"})${marker}`);
  }

  if (missing.length > 0) {
    fail(`Missing required profiles: ${missing.join(", ")}`);
  }
  console.log("[mikrotik:check] ✓ All 4 required profiles present");

  // ── 2b. shared-users must allow multi-device logins ───────────────────
  // Same phone logs in from phone + laptop as ONE hotspot user. With
  // shared-users=1 (RouterOS default) the second device's active/login is
  // rejected and it never gets internet. The backend self-heals this on
  // every login, but flag it here so ops can see the steady state.
  const thin = REQUIRED_PROFILES.map((name) => {
    const p = profiles.find((x: any) => x?.name === name);
    const n = Number.parseInt(String(p?.["shared-users"] ?? ""), 10);
    return { name, shared: Number.isFinite(n) ? n : 0 };
  }).filter((p) => p.shared < MAX_DEVICES_PER_PHONE);
  if (thin.length > 0) {
    fail(
      `Profiles with shared-users < ${MAX_DEVICES_PER_PHONE} (second device login will be rejected): ` +
      thin.map((p) => `${p.name}=${p.shared}`).join(", "),
    );
  }
  console.log(`[mikrotik:check] ✓ All required profiles allow ≥${MAX_DEVICES_PER_PHONE} simultaneous sessions`);

  // ── 2c. Hotspot server settings (review only) ──────────────────────────
  try {
    const servers = await client.listServers();
    console.log(`\n[mikrotik:check] Hotspot servers (${servers.length}):`);
    for (const s of servers) {
      console.log(
        `  - ${s?.name ?? "?"}: idle-timeout=${s?.["idle-timeout"] ?? "?"} ` +
        `keepalive-timeout=${s?.["keepalive-timeout"] ?? "?"} addresses-per-mac=${s?.["addresses-per-mac"] ?? "?"}`,
      );
    }
  } catch (err) {
    fail(`Failed to list hotspot servers: ${err instanceof Error ? err.message : String(err)}`, err);
  }

  // ── 3. Hosts + active sessions ────────────────────────────────────────
  let hostCount: number;
  let activeCount: number;
  try {
    hostCount = await client.countHosts();
  } catch (err) {
    fail(`Failed to list hotspot hosts: ${err instanceof Error ? err.message : String(err)}`, err);
  }

  try {
    activeCount = await client.countActive();
  } catch (err) {
    fail(`Failed to list hotspot active sessions: ${err instanceof Error ? err.message : String(err)}`, err);
  }

  console.log(`\n[mikrotik:check] Hotspot hosts   : ${hostCount}`);
  console.log(`[mikrotik:check] Active sessions : ${activeCount}`);

  // ── Done ──────────────────────────────────────────────────────────────
  console.log("\n[mikrotik:check] ✓ All checks passed");
  await client.close();
  process.exit(0);
}

main().catch((err) => {
  fail(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`, err);
});

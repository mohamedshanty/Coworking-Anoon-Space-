/**
 * Scheduled hotspot jobs.
 *
 *   npm i node-cron  (already installed)
 *
 * Register in the server boot file:
 *   import { registerHotspotCrons } from './modules/hotspot/hotspot.cron';
 *   registerHotspotCrons();
 *
 * PM2 cluster mode:
 *   No PM2 config was found in this project (no ecosystem.config.js).
 *   The server runs as a single process. If PM2 is ever added, the
 *   pm_id guard below ensures only instance 0 runs the crons.
 */

import cron from "node-cron";
import { prisma } from "../../lib/prisma";
import { getMikrotik } from "../../lib/mikrotik";
import { endOfDaySweep, endByPhone } from "./hotspot.service";
import { BUSINESS_CLOSE, TIMEZONE } from "./hotspot.config";

const log = (...args: unknown[]) => console.log("[hotspot-cron]", ...args);

/**
 * Only run crons on PM2 instance 0 (or when not in PM2 at all).
 * In PM2 cluster mode every fork would fire the same cron otherwise.
 * process.env.pm_id is set by PM2 — "0" for the first instance.
 */
function isPrimaryInstance(): boolean {
  const pmId = process.env.pm_id;
  if (pmId === undefined) return true; // not in PM2
  return pmId === "0";
}

export function registerHotspotCrons() {
  if (!isPrimaryInstance()) {
    log("skipping crons — not the primary PM2 instance (pm_id=%s)", process.env.pm_id);
    return;
  }

  const [hh, mm] = BUSINESS_CLOSE.split(":");

  // -- 1) End-of-day sweep ------------------------------------------------
  // Cut all visitors with open NetSessions at BUSINESS_CLOSE_TIME.
  // Subscribers and employees are NOT cut by time — they leave voluntarily.
  cron.schedule(
    `${mm} ${hh} * * *`,
    async () => {
      try {
        const r = await endOfDaySweep();
        log("EOD sweep done", r);
      } catch (err) {
        console.error("[hotspot-cron] EOD sweep failed", err);
      }
    },
    { timezone: TIMEZONE },
  );

  // -- 2) Idle reconciliation (every 10 minutes) --------------------------
  // A NetSession is "stale" if it's open in our DB but the device is no
  // longer in /ip hotspot active (idle timeout, router reboot, etc.).
  //
  // Critical: this must NOT bill. Internet is a visit-level charge
  // (one floor minimum per attendance session), so closing the open
  // NetSession on a transient disconnect would reset the clock and
  // double-charge the visitor on reconnect. Pass { bill: false } so
  // the row closes with amount=0 and no label is posted to the session.
  // Billing happens only at checkout and EOD.
  //
  // Cost control:
  //   - ONE ping up front: if the router is down we bail immediately instead
  //     of spending 8s timeout + retry × N open sessions (20 sessions ≈ 5+ min).
  //   - ONE /ip hotspot active print: compared locally as a Set instead of
  //     one query per phone.
  //   - An overlap guard: a slow run can never stack on top of the next tick.
  let reconcileRunning = false;
  cron.schedule(
    "*/10 * * * *",
    async () => {
      if (reconcileRunning) {
        log("reconcile skipped — previous run still in progress");
        return;
      }
      reconcileRunning = true;
      try {
        // 1) Fail fast if the router is unreachable.
        const mt = getMikrotik();
        try {
          await mt.ping();
        } catch (err) {
          log("reconcile skipped — router unreachable:", err instanceof Error ? err.message : err);
          return;
        }

        // 2) Open sessions in our DB.
        const open = await prisma.netSession.findMany({
          where: { endedAt: null },
          select: { phone: true },
        });
        if (open.length === 0) return;

        // 3) Fetch the active list ONCE and compare locally.
        const active = await mt.listActive();
        const activeUsers = new Set(
          active.map((a: any) => String(a?.user ?? "")).filter(Boolean),
        );

        // 4) Close (without billing) any session whose phone has no active device.
        for (const s of open) {
          if (activeUsers.has(s.phone)) continue;
          try {
            await endByPhone(s.phone, "idle", { bill: false });
            log("reconciled stale session", s.phone);
          } catch (err) {
            // One device's failure must not block the others.
            log("failed to reconcile", s.phone, err instanceof Error ? err.message : err);
          }
        }
      } catch (err) {
        console.error("[hotspot-cron] reconcile failed", err);
      } finally {
        reconcileRunning = false;
      }
    },
    { timezone: TIMEZONE },
  );

  log("crons registered — close %s %s", BUSINESS_CLOSE, TIMEZONE);
}

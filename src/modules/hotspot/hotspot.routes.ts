/**
 * noonWiFi routes.
 *
 * /api/v1/hotspot/context   public  — read-only
 * /api/v1/hotspot/login     public  — protected by MAC-on-network check inside service
 * /api/v1/hotspot/end       internal — X-Internal-Secret (called by session checkout button)
 * /api/v1/hotspot/sweep     internal — cron
 * /api/v1/hotspot/status    internal — router health for admin panel
 *
 * "public" here does not mean open: a device can only be authorized if it is
 * actually connected to the space network (verified via /ip hotspot host inside
 * the service layer).
 */

import { Router, Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import {
  getPortalContext,
  portalLogin,
  endByPhone,
  endByMac,
  endOfDaySweep,
  listConnectedStaff,
  HotspotHttpError,
} from "./hotspot.service";
import { VISITOR_PLANS, MEMBER_PLAN, BILLING } from "./hotspot.config";
import { getMikrotik, normalizeMac } from "../../lib/mikrotik";
import { verifyInternalSecret } from "../integrations/secret";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";

export const hotspotRouter = Router();

// ---------------------------------------------------------------------------
// Rate limit — per MAC, 20 req/min
// ---------------------------------------------------------------------------

const portalLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    String(req.query.mac ?? req.body?.mac ?? req.ip).toUpperCase(),
  message: { error: "Too many attempts, wait a minute" },
});

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const macSchema = z
  .string()
  .regex(/^[0-9a-fA-F:.\-]{12,17}$/, "Invalid MAC address");

const contextSchema = z.object({
  mac: macSchema,
  ip: z.string().optional(),
});

const loginSchema = z.object({
  mac: macSchema,
  ip: z.string().regex(/^(\d{1,3}\.){3}\d{1,3}$/, "Invalid IP address"),
  phone: z.string().min(9).max(15),
  name: z.string().trim().min(2).max(60).optional(),
  tier: z.enum(["t10", "t20", "t30"]).optional(),
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

hotspotRouter.get("/context", portalLimiter, async (req, res, next) => {
  try {
    const { mac } = contextSchema.parse(req.query);
    res.json(await getPortalContext(mac));
  } catch (err) {
    next(err);
  }
});

hotspotRouter.post("/login", portalLimiter, async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const result = await portalLogin(body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

hotspotRouter.post("/end", verifyInternalSecret, async (req, res, next) => {
  try {
    const { phone, mac, reason } = req.body ?? {};
    if (mac) {
      await endByMac(normalizeMac(mac));
      return res.json({ ok: true });
    }
    if (!phone) return res.status(400).json({ error: "phone or mac is required" });
    res.json(await endByPhone(phone, reason ?? "checkout"));
  } catch (err) {
    next(err);
  }
});

hotspotRouter.post("/sweep", verifyInternalSecret, async (_req, res, next) => {
  try {
    res.json(await endOfDaySweep());
  } catch (err) {
    next(err);
  }
});

hotspotRouter.get("/status", verifyInternalSecret, async (_req, res) => {
  try {
    const ok = await getMikrotik().ping();
    res.json({ router: ok ? "up" : "down" });
  } catch (err) {
    res.status(503).json({ router: "down", error: String(err) });
  }
});

// JWT-authenticated variant — used by the admin panel (live page header)
hotspotRouter.get(
  "/router-status",
  authenticate,
  authorize("داخل المساحة", "view"),
  async (_req, res) => {
    try {
      const ok = await getMikrotik().ping();
      res.json({ success: true, data: { router: ok ? "up" : "down" } });
    } catch {
      res.json({ success: true, data: { router: "down" } });
    }
  },
);

/**
 * Visitor internet plans + billing rounding rules — the SINGLE source of
 * truth for prices. The live-page checkout preview fetches this instead of
 * hardcoding NET_RATES/NET_BILLING, so a price change on the server is
 * reflected in what the employee sees before collecting.
 */
hotspotRouter.get(
  "/plans",
  authenticate,
  authorize("داخل المساحة", "view"),
  (_req, res) => {
    res.json({
      success: true,
      data: {
        plans: [...VISITOR_PLANS, MEMBER_PLAN].map((p) => ({
          tier: p.tier,
          label: p.label,
          mbps: p.mbps,
          hourlyRate: p.hourlyRate,
          hint: p.hint,
        })),
        billing: {
          minMinutes: BILLING.minMinutes,
          incrementMinutes: BILLING.incrementMinutes,
          mode: BILLING.mode,
        },
      },
    });
  },
);

/**
 * Open NetSessions for staff — rendered at the top of the live page so
 * admins can see (and disconnect) employees on the WiFi even though
 * they have no attendance session by design (A9.3).
 */
hotspotRouter.get(
  "/connected-staff",
  authenticate,
  authorize("داخل المساحة", "view"),
  async (_req, res, next) => {
    try {
      res.json({ success: true, data: await listConnectedStaff() });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Admin-initiated disconnect.
 *
 * Security: this endpoint is JWT-authed and the UI only exposes it to
 * staff. The point is, however, a public HTTP endpoint — the request
 * body accepts any phone number. If a non-staff phone (visitor /
 * subscriber / trainee) is passed, the call would currently hit
 * endByPhone with bill:false and silently drop the visit charge for
 * that customer. To prevent that, we look up the kind of the OPEN
 * NetSession for that phone and reject anything that isn't
 * "employee" with an Arabic message that points the operator to the
 * regular session-end button (which goes through checkout / checkoutUnpaid
 * and bills the visit correctly).
 */
const disconnectSchema = z.object({
  phone: z.string().min(9).max(15),
  reason: z.enum(["checkout", "end_of_day", "idle", "admin"]).optional(),
});

hotspotRouter.post(
  "/disconnect",
  authenticate,
  authorize("داخل المساحة", "edit"),
  async (req, res, next) => {
    try {
      const { phone, reason } = disconnectSchema.parse(req.body);

      // The UI lists only currently-connected staff (listConnectedStaff).
      // Re-verify the phone belongs to a staff session at the moment of
      // the click — a session may have ended between the list render
      // and the click.
      const openRow = await prisma.netSession.findFirst({
        where: { phone, endedAt: null },
        select: { kind: true },
      });
      if (!openRow || openRow.kind !== "employee") {
        throw new HotspotHttpError(
          400,
          "هذا الزر خاص بالموظفين فقط — لإنهاء جلسة زائر استخدم زر «إنهاء الجلسة»",
        );
      }

      const result = await endByPhone(phone, reason ?? "admin", { bill: false });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// Error handler
//
// The portal expects { error: string } for error responses. The project-wide
// errorHandler returns { success, message } which is a different contract.
// This lightweight adapter converts hotspot-specific errors to the portal
// format; everything else falls through to the global handler.
// ---------------------------------------------------------------------------

hotspotRouter.use((err: any, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof HotspotHttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err?.name === "ZodError") {
    return res.status(400).json({ error: "Invalid input" });
  }
  next(err);
});

/**
 * مسارات noonWiFi.
 *
 * /api/v1/hotspot/context   عام  — يقرأ فقط
 * /api/v1/hotspot/login     عام  — محمي بالتحقق من وجود الـ MAC على الشبكة
 * /api/v1/hotspot/end       داخلي — X-Internal-Secret (يستدعيه زر إنهاء الجلسة)
 * /api/v1/hotspot/sweep     داخلي — الكرون
 * /api/v1/hotspot/status    داخلي — صحة الاتصال بالراوتر للوحة الأدمن
 *
 * «عام» هنا لا يعني مفتوحاً: لا يمكن تفويض جهاز إلا إذا كان متصلاً فعلاً بشبكة
 * المساحة (تحقق /ip hotspot host داخل الخدمة).
 */

import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import crypto from 'node:crypto';
import {
  getPortalContext, portalLogin, endByPhone, endByMac,
  endOfDaySweep, HotspotHttpError,
} from './hotspot.service';
import { getMikrotik, normalizeMac } from '../../lib/mikrotik';

export const hotspotRouter = Router();

// -- تحقق داخلي (نفس نمط integrations الموجود لديك) --------------------------
function requireInternalSecret(req: Request, res: Response, next: NextFunction) {
  const provided = req.header('X-Internal-Secret') ?? '';
  const expected = process.env.INTERNAL_SYNC_SECRET ?? '';
  const a = crypto.createHash('sha256').update(provided).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  if (!expected || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

// -- حد المعدل حسب الـ MAC ---------------------------------------------------
const portalLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    String(req.query.mac ?? req.body?.mac ?? req.ip).toUpperCase(),
  message: { error: 'محاولات كثيرة، انتظر دقيقة' },
});

// -- المخططات ----------------------------------------------------------------
const macSchema = z.string().regex(/^[0-9a-fA-F:.\-]{12,17}$/, 'MAC غير صالح');

const contextSchema = z.object({
  mac: macSchema,
  ip: z.string().optional(),
});

const loginSchema = z.object({
  mac: macSchema,
  ip: z.string().regex(/^(\d{1,3}\.){3}\d{1,3}$/, 'IP غير صالح'),
  phone: z.string().min(9).max(15),
  name: z.string().trim().min(2).max(60).optional(),
  tier: z.enum(['T10', 'T20', 'T30']).optional(),
});

// -- المسارات ----------------------------------------------------------------

hotspotRouter.get('/context', portalLimiter, async (req, res, next) => {
  try {
    const { mac } = contextSchema.parse(req.query);
    res.json(await getPortalContext(mac));
  } catch (err) { next(err); }
});

hotspotRouter.post('/login', portalLimiter, async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const result = await portalLogin(body);
    res.json(result);
  } catch (err) { next(err); }
});

hotspotRouter.post('/end', requireInternalSecret, async (req, res, next) => {
  try {
    const { phone, mac, reason } = req.body ?? {};
    if (mac) {
      await endByMac(normalizeMac(mac));
      return res.json({ ok: true });
    }
    if (!phone) return res.status(400).json({ error: 'phone أو mac مطلوب' });
    res.json(await endByPhone(phone, reason ?? 'CHECKOUT'));
  } catch (err) { next(err); }
});

hotspotRouter.post('/sweep', requireInternalSecret, async (_req, res, next) => {
  try { res.json(await endOfDaySweep()); } catch (err) { next(err); }
});

hotspotRouter.get('/status', requireInternalSecret, async (_req, res) => {
  try {
    const ok = await getMikrotik().ping();
    res.json({ router: ok ? 'up' : 'down' });
  } catch (err) {
    res.status(503).json({ router: 'down', error: String(err) });
  }
});

// -- معالج الأخطاء -----------------------------------------------------------
// رسائل عربية واضحة للمستخدم، وتفاصيل تقنية في السجل فقط.
hotspotRouter.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HotspotHttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err?.name === 'ZodError') {
    return res.status(400).json({ error: 'بيانات غير صالحة' });
  }
  console.error('[hotspot] unhandled', err);
  return res.status(500).json({ error: 'تعذّر إتمام الاتصال. راجع الاستقبال.' });
});

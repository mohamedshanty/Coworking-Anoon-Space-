/**
 * منطق noonWiFi الأساسي.
 *
 * مبدأ التصميم: الشبكة تتبع الحضور، لا العكس.
 * كل تفويض إنترنت مرتبط بجلسة حضور في noonCowork، وكل إنهاء جلسة يقطع الإنترنت.
 */

import crypto from 'node:crypto';
import { NetTier, NetUserKind, NetEndReason } from '@prisma/client';
import { prisma } from '../../lib/prisma';                    // ADAPT
import { getMikrotik, normalizeMac } from '../../lib/mikrotik';
import { SessionsService } from '../sessions/service';        // ADAPT: خدمتك الحالية
import { resolveIdentity, ensureVisitor, Identity } from './identity.service';
import {
  VISITOR_PLANS, MEMBER_PLAN, resolvePlan, isPaid,
  computeAmount, normalizePhone, LIMITS, BILLING,
} from './hotspot.config';

const log = (...args: unknown[]) => console.log('[hotspot]', ...args);

// ---------------------------------------------------------------------------
// كلمة سر الراوتر
// ---------------------------------------------------------------------------
/**
 * كلمة سر ثابتة مشتقة من الرقم + سر الخادم.
 * ثابتة ⇒ لا نحتاج تخزينها، ونستطيع إعادة توليدها لتفويض أي جهاز لاحقاً.
 * السر لا يغادر الخادم، والمستخدم لا يراها إطلاقاً (الدخول يتم من جهة الخادم).
 */
function routerPasswordFor(phone: string): string {
  const secret = process.env.HOTSPOT_USER_SECRET;
  if (!secret) throw new Error('HOTSPOT_USER_SECRET غير مضبوط');
  return crypto.createHmac('sha256', secret).update(phone).digest('hex').slice(0, 16);
}

async function audit(action: string, ok: boolean, data: Partial<{ phone: string; mac: string; detail: string }>) {
  try {
    await prisma.hotspotAudit.create({
      data: { action, ok, phone: data.phone, mac: data.mac, detail: data.detail },
    });
  } catch { /* التدقيق لا يُفشل العملية أبداً */ }
}

// ---------------------------------------------------------------------------
// 1) سياق البوابة — ماذا نعرف عن هذا الجهاز؟
// ---------------------------------------------------------------------------

export type PortalContext = {
  known: boolean;
  phone?: string;
  name?: string;
  kind?: NetUserKind;
  note?: string;
  needsRenewal?: boolean;
  /** الزائر يختار، وغيره يرى باقته مثبتة */
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
    orderBy: { startedAt: 'desc' },
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
    tier: p.tier, label: p.label, mbps: p.mbps, hourlyRate: p.hourlyRate, hint: p.hint,
  }));
}

// ---------------------------------------------------------------------------
// 2) الدخول
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
  if (!phone) throw new HotspotHttpError(400, 'رقم الجوال غير صحيح');

  const mt = getMikrotik();

  // -- (أ) التحقق أن الجهاز فعلاً على شبكتنا -------------------------------
  // بدون هذا يستطيع أي شخص من الإنترنت استدعاء النقطة وتفويض MAC عشوائي.
  const host = await mt.findHost(mac);
  if (!host) {
    await audit('LOGIN', false, { phone, mac, detail: 'MAC غير موجود في hotspot host' });
    throw new HotspotHttpError(403, 'هذا الجهاز غير متصل بشبكة المساحة');
  }
  const ip = host.address && host.address !== '' ? host.address : input.ip;

  // -- (ب) من هو؟ -----------------------------------------------------------
  const identity: Identity = await resolveIdentity(phone, input.name);
  const plan = resolvePlan(identity.kind, input.tier);

  // زائر جديد تماماً ⇒ ننشئ سجل زائر (تسجيل ذاتي، بلا موافقة)
  let visitorId = identity.visitorId;
  if (identity.kind === 'VISITOR' && !visitorId) {
    if (!input.name || input.name.trim().length < 2) {
      throw new HotspotHttpError(400, 'الاسم مطلوب في أول زيارة');
    }
    visitorId = await ensureVisitor(phone, input.name.trim());
  }

  // -- (ج) تجهيز المستخدم على الراوتر ---------------------------------------
  const password = routerPasswordFor(phone);
  await mt.ensureUser({
    name: phone,
    password,
    profile: plan.routerProfile,
    comment: `noonWiFi | ${identity.kind} | ${identity.name}`,
  });

  // -- (د) تسجيل دخول الجهاز الحالي -----------------------------------------
  await mt.activeLogin({ user: phone, password, ip, mac });
  await audit('LOGIN', true, { phone, mac, detail: `${identity.kind} ${plan.routerProfile}` });

  // -- (هـ) جلسة الحضور في noonCowork ---------------------------------------
  // نعيد استخدام نفس الخدمة التي يستخدمها الاستقبال — لا منطق حضور مكرر.
  let sessionId: string | undefined;
  try {
    const session = await SessionsService.checkIn({ phone });   // ADAPT للتوقيع لديك
    sessionId = (session as any)?.id;
  } catch (err) {
    // فشل الحضور لا يمنع الإنترنت — الشخص أمامنا فعلاً. نسجّل ونكمل.
    log('checkIn failed', phone, err);
    await audit('LOGIN', false, { phone, mac, detail: 'checkIn failed: ' + String(err) });
  }

  // -- (و) حفظ الجهاز وجلسة الشبكة ------------------------------------------
  await upsertDevice(mac, phone, await safeHostname(mac));

  // أي جلسة شبكة قديمة مفتوحة لنفس الرقم تُغلق منطقياً
  await prisma.netSession.updateMany({
    where: { phone, endedAt: null },
    data: { endedAt: new Date(), endedReason: 'SUPERSEDED' as NetEndReason },
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

  // -- (ز) إعادة تفويض بقية أجهزة نفس الرقم ---------------------------------
  const extra = await authorizeKnownDevices(phone, password, mac);

  // -- (ح) إبلاغ Anoon QR بالحضور (لا ينتظر، لا يُفشل) ----------------------
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
 * جوهر متطلب «مسح الـ QR من الجوال يوصّل اللابتوب تلقائياً».
 * لكل MAC معروف لنفس الرقم: نبحث عن IP الحالي من DHCP/ARP ثم نسجّل دخوله.
 * الأجهزة غير المتصلة الآن تُتجاهل بصمت.
 */
async function authorizeKnownDevices(
  phone: string,
  password: string,
  skipMac: string,
): Promise<number> {
  const mt = getMikrotik();
  const devices = await prisma.knownDevice.findMany({
    where: { phone, isBlocked: false, mac: { not: skipMac } },
    orderBy: { lastSeenAt: 'desc' },
    take: LIMITS.maxDevicesPerPhone - 1,
  });

  let count = 0;
  for (const d of devices) {
    try {
      const ip = await mt.findIpByMac(d.mac);
      if (!ip) continue;                       // الجهاز غير متصل الآن
      await mt.activeLogin({ user: phone, password, ip, mac: d.mac });
      count++;
      await prisma.knownDevice.update({ where: { id: d.id }, data: { lastSeenAt: new Date() } });
      await audit('REAUTH_DEVICE', true, { phone, mac: d.mac });
    } catch (err) {
      await audit('REAUTH_DEVICE', false, { phone, mac: d.mac, detail: String(err) });
    }
  }
  return count;
}

async function upsertDevice(mac: string, phone: string, hostname: string | null) {
  const count = await prisma.knownDevice.count({ where: { phone } });
  const existing = await prisma.knownDevice.findUnique({ where: { mac } });

  if (!existing && count >= LIMITS.maxDevicesPerPhone) {
    // نحذف أقدم جهاز بدل رفض الجديد — الشخص أمامنا ويحتاج الإنترنت الآن
    const oldest = await prisma.knownDevice.findFirst({
      where: { phone }, orderBy: { lastSeenAt: 'asc' },
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
  try { return await getMikrotik().getHostname(mac); } catch { return null; }
}

async function notifyAnoon(phone: string): Promise<void> {
  const base = process.env.ANOON_QR_BASE_URL;
  if (!base) return;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    await fetch(`${base}/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(t);
  }
}

// ---------------------------------------------------------------------------
// 3) الخروج والفوترة
// ---------------------------------------------------------------------------

export type EndResult = {
  ended: boolean;
  minutes: number;
  amount: number;
  kind?: NetUserKind;
  tier?: NetTier;
};

/**
 * تُستدعى من زر «إنهاء الجلسة» في صفحة «داخل المساحة»،
 * ومن كرون نهاية الدوام، ومن لوحة الأدمن.
 */
export async function endByPhone(
  phone: string,
  reason: NetEndReason = 'CHECKOUT',
): Promise<EndResult> {
  const open = await prisma.netSession.findFirst({
    where: { phone, endedAt: null },
    orderBy: { startedAt: 'desc' },
  });

  // اقطع الإنترنت أولاً — حتى لو لم توجد جلسة مسجّلة عندنا
  const mt = getMikrotik();
  try {
    await mt.logoutUser(phone);
    await mt.setUserDisabled(phone, true);   // يمنع إعادة الدخول التلقائي
    await audit('LOGOUT', true, { phone, detail: reason });
  } catch (err) {
    await audit('LOGOUT', false, { phone, detail: String(err) });
    log('logout failed', phone, err);
  }

  if (!open) return { ended: false, minutes: 0, amount: 0 };

  const endedAt = new Date();
  const minutes = Math.max(
    1,
    Math.round((endedAt.getTime() - open.startedAt.getTime()) / 60000),
  );
  const amount = computeAmount(minutes, Number(open.hourlyRate));

  await prisma.netSession.update({
    where: { id: open.id },
    data: { endedAt, minutes, amount, endedReason: reason, billed: amount > 0 },
  });

  if (amount > 0) {
    await postCharge({
      phone,
      visitorId: open.visitorId ?? undefined,
      sessionId: open.sessionId ?? undefined,
      amount,
      minutes,
      tier: open.tier,
    });
  }

  return { ended: true, minutes, amount, kind: open.kind, tier: open.tier };
}

/**
 * ترحيل رسم الإنترنت إلى النظام المالي الحالي.
 *
 * ⚠️ نقطة القرار: راجع BILLING.mode في hotspot.config.ts
 *   surcharge ⇒ سطر إضافي فوق سعر المقعد
 *   replaces  ⇒ يحل محل سعر ساعة المقعد للزائر
 *
 * ADAPT: اربطها بـ محفظة السناكس / الديون / حساب الجلسة حسب ما تفضّل.
 */
async function postCharge(args: {
  phone: string;
  visitorId?: string;
  sessionId?: string;
  amount: number;
  minutes: number;
  tier: NetTier;
}): Promise<void> {
  const label = `إنترنت ${args.tier.replace('T', '')} ميجا — ${args.minutes} دقيقة`;

  if (BILLING.mode === 'replaces') {
    // ADAPT: صفّر رسم الساعة على الجلسة ثم أضف رسم الإنترنت
    // await SessionsService.setHourlyOverride(args.sessionId!, 0);
  }

  // ADAPT — أحد الخيارين:
  // (1) خصم من المحفظة إن كان فيها رصيد، وإلا دين:
  //     await WalletService.charge({ visitorId, amount, label });
  // (2) إضافة مباشرة على فاتورة الجلسة:
  //     await SessionsService.addCharge(sessionId, { amount, label, type: 'INTERNET' });

  log('CHARGE', args.phone, args.amount, label);
}

/** إنهاء بالـ MAC — لأزرار «افصل هذا الجهاز» في لوحة الأدمن */
export async function endByMac(mac: string): Promise<void> {
  const m = normalizeMac(mac);
  await getMikrotik().logoutMac(m);
  await audit('LOGOUT', true, { mac, detail: 'ADMIN by mac' });
}

// ---------------------------------------------------------------------------
// 4) نهاية الدوام
// ---------------------------------------------------------------------------

/**
 * الزوار فقط: إنترنتهم صالح لنفس اليوم حتى نهاية الدوام.
 * المشتركون والموظفون يُقطعون عند تسجيل خروجهم لا بالوقت،
 * لكن scheduler الراوتر يمسح كل شيء بعد الإغلاق كشبكة أمان.
 */
export async function endOfDaySweep(): Promise<{ visitors: number; errors: number }> {
  const open = await prisma.netSession.findMany({
    where: { endedAt: null, kind: 'VISITOR' },
    select: { phone: true },
  });

  let errors = 0;
  for (const s of open) {
    try {
      await endByPhone(s.phone, 'END_OF_DAY');
    } catch (err) {
      errors++;
      log('EOD failed', s.phone, err);
    }
  }
  await audit('EOD_SWEEP', errors === 0, { detail: `${open.length} زائر، ${errors} خطأ` });
  return { visitors: open.length, errors };
}

// ---------------------------------------------------------------------------

export class HotspotHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'HotspotHttpError';
  }
}

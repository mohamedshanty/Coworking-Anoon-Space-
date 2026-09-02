/**
 * كل الأرقام القابلة للتغيير في مكان واحد.
 * تعديل السعر أو السرعة لا يتطلب لمس أي منطق.
 *
 * تنبيه: أسماء الـ profile هنا يجب أن تطابق حرفياً ما أُنشئ على الراوتر
 * في mikrotik/01-hotspot-setup.rsc
 */

import { NetTier, NetUserKind } from '@prisma/client';

export type PlanDef = {
  tier: NetTier;
  label: string;          // ما يراه المستخدم في البوابة
  mbps: number;
  routerProfile: string;  // /ip hotspot user profile
  hourlyRate: number;     // شيكل — للزوار فقط
  hint: string;           // وصف قصير يساعد على الاختيار
};

/** الباقات المعروضة للزائر */
export const VISITOR_PLANS: PlanDef[] = [
  {
    tier: 'T10',
    label: '10 ميجا',
    mbps: 10,
    routerProfile: 'visitor-10m',
    hourlyRate: 3,
    hint: 'تصفّح وبريد ومكالمات صوتية',
  },
  {
    tier: 'T20',
    label: '20 ميجا',
    mbps: 20,
    routerProfile: 'visitor-20m',
    hourlyRate: 4,
    hint: 'اجتماعات فيديو ورفع ملفات',
  },
  {
    tier: 'T30',
    label: '30 ميجا',
    mbps: 30,
    routerProfile: 'visitor-30m',
    hourlyRate: 5,
    hint: 'بث ونقل ملفات كبيرة',
  },
];

/** الباقة الثابتة للمشترك والمتدرّب والموظف — مجانية */
export const MEMBER_PLAN: PlanDef = {
  tier: 'T10',
  label: '10 ميجا',
  mbps: 10,
  routerProfile: 'noon-10m',
  hourlyRate: 0,
  hint: 'ضمن اشتراكك',
};

export const PAID_KINDS: NetUserKind[] = ['VISITOR'];

export function isPaid(kind: NetUserKind): boolean {
  return PAID_KINDS.includes(kind);
}

/** الباقة النهائية: الزائر يختار، والبقية مثبّتون على 10 ميجا مجاناً */
export function resolvePlan(kind: NetUserKind, requestedTier?: NetTier | null): PlanDef {
  if (!isPaid(kind)) return MEMBER_PLAN;
  const found = VISITOR_PLANS.find((p) => p.tier === requestedTier);
  return found ?? VISITOR_PLANS[0];
}

// -- الفوترة -----------------------------------------------------------------

export const BILLING = {
  /** حد أدنى محسوب حتى لو جلس 10 دقائق */
  minMinutes: Number(process.env.BILLING_MIN_MINUTES ?? 60),
  /** بعد الحد الأدنى، التقريب لأعلى إلى مضاعفات هذه القيمة */
  incrementMinutes: Number(process.env.BILLING_INCREMENT_MINUTES ?? 15),
  /**
   * surcharge : رسم الإنترنت يُضاف فوق سعر المقعد الحالي في noonCowork
   * replaces  : رسم الإنترنت يحل محل سعر ساعة المقعد للزائر
   * ⚠️ أكّد هذا قبل التشغيل الحقيقي وإلا حصلت محاسبة مزدوجة.
   */
  mode: (process.env.INTERNET_BILLING_MODE ?? 'surcharge') as 'surcharge' | 'replaces',
};

export function computeAmount(minutes: number, hourlyRate: number): number {
  if (hourlyRate <= 0) return 0;
  const billable = Math.max(minutes, BILLING.minMinutes);
  const rounded =
    Math.ceil(billable / BILLING.incrementMinutes) * BILLING.incrementMinutes;
  return Math.round((rounded / 60) * hourlyRate * 100) / 100;
}

// -- ساعات الدوام -------------------------------------------------------------

/** "22:00" — بعده يُقطع كل الزوار تلقائياً */
export const BUSINESS_CLOSE = process.env.BUSINESS_CLOSE_TIME ?? '22:00';
export const TIMEZONE = process.env.TZ_NAME ?? 'Asia/Hebron';

// -- حدود الحماية -------------------------------------------------------------

export const LIMITS = {
  /** أقصى عدد أجهزة مرتبطة برقم واحد — يطابق shared-users على الراوتر */
  maxDevicesPerPhone: Number(process.env.MAX_DEVICES_PER_PHONE ?? 4),
  /** طلبات البوابة لكل MAC في الدقيقة */
  portalRatePerMinute: 20,
};

/** فلسطين: 059/056 وأحياناً بصيغة دولية */
export function normalizePhone(raw: string): string | null {
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return null;
  let d = digits;
  if (d.startsWith('970')) d = '0' + d.slice(3);
  else if (d.startsWith('972')) d = '0' + d.slice(3);
  if (d.length === 9 && d.startsWith('5')) d = '0' + d;
  if (!/^05\d{8}$/.test(d)) return null;
  return d;
}

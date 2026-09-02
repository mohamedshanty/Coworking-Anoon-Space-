/**
 * تحديد نوع الشخص من رقم الجوال.
 *
 * ⚠️ هذا الملف الوحيد الذي يحتاج ملاءمة مع مخطط قاعدة بياناتك الفعلي.
 * كل استعلام معلَّم بـ ADAPT — عدّل اسم الجدول/العمود ليطابق schema.prisma عندك.
 * البقية تعمل كما هي.
 *
 * ترتيب الأولوية مقصود: موظف ← مشترك فعّال ← متدرّب في دورة جارية ← زائر.
 * الموظف أولاً حتى لا يُحاسب لو صادف أنه مسجّل كزائر سابقاً.
 */

import { NetUserKind } from '@prisma/client';
import { prisma } from '../../lib/prisma';       // ADAPT: مسار عميل Prisma عندك

export type Identity = {
  kind: NetUserKind;
  phone: string;
  name: string;
  /** معرّف السجل المرتبط، للربط بجلسة الحضور */
  visitorId?: string;
  subscriberId?: string;
  /** معلومة تُعرض في البوابة، مثل: "اشتراك شهري ينتهي 12/9" */
  note?: string;
  /** اشتراك منتهٍ: ندخله بسرعة العضو لكن ننبّه في الواجهة */
  needsRenewal?: boolean;
};

export async function resolveIdentity(
  phone: string,
  fallbackName?: string,
): Promise<Identity> {
  // ---------- 1) موظف ----------
  // ADAPT: جدول المستخدمين/الموظفين لديك (RBAC موجود أصلاً)
  const staff = await prisma.user.findFirst({
    where: { phone, isActive: true },
    select: { id: true, name: true },
  });
  if (staff) {
    return { kind: 'EMPLOYEE', phone, name: staff.name ?? fallbackName ?? phone };
  }

  // ---------- 2) مشترك ----------
  // ADAPT: اسم الجدول وحقول تاريخ الانتهاء
  const subscriber = await prisma.subscriber.findFirst({
    where: { phone },
    select: {
      id: true,
      name: true,
      visitorId: true,
      endDate: true,
      package: true,
      isActive: true,
    },
    orderBy: { endDate: 'desc' },
  });

  if (subscriber) {
    const active =
      subscriber.isActive !== false &&
      (!subscriber.endDate || subscriber.endDate >= new Date());
    return {
      kind: 'SUBSCRIBER',
      phone,
      name: subscriber.name ?? fallbackName ?? phone,
      subscriberId: subscriber.id,
      visitorId: subscriber.visitorId ?? undefined,
      needsRenewal: !active,
      note: active
        ? `اشتراك ${labelPackage(subscriber.package)} فعّال`
        : 'اشتراكك منتهٍ — راجع الاستقبال للتجديد',
    };
  }

  // ---------- 3) متدرّب في دورة جارية ----------
  // ADAPT: جدول التسجيل في الدورات
  const now = new Date();
  const enrollment = await prisma.courseEnrollment.findFirst({
    where: {
      phone,
      course: { startDate: { lte: now }, endDate: { gte: now } },
    },
    select: { id: true, name: true, course: { select: { name: true } } },
  });
  if (enrollment) {
    return {
      kind: 'TRAINEE',
      phone,
      name: enrollment.name ?? fallbackName ?? phone,
      note: `متدرّب في ${enrollment.course?.name ?? 'دورة'}`,
    };
  }

  // ---------- 4) زائر ----------
  // ADAPT: جدول الزوار
  const visitor = await prisma.visitor.findFirst({
    where: { phone },
    select: { id: true, name: true },
  });

  return {
    kind: 'VISITOR',
    phone,
    name: visitor?.name ?? fallbackName ?? 'زائر',
    visitorId: visitor?.id,
  };
}

function labelPackage(pkg?: string | null): string {
  switch (pkg) {
    case 'weekly': return 'أسبوعي';
    case 'monthly': return 'شهري';
    case 'half_month': return 'نصف شهري';
    default: return '';
  }
}

/**
 * إنشاء زائر جديد عند أول اتصال بالشبكة.
 * تسجيل ذاتي كامل بلا موافقة أدمن — كما هو مطلوب.
 */
export async function ensureVisitor(phone: string, name: string): Promise<string> {
  // ADAPT: استخدم VisitorsService.create الموجود لديك بدل الاستدعاء المباشر
  // إن كان يحوي منطقاً إضافياً (سجل التدقيق، إشعار الجرس...).
  const existing = await prisma.visitor.findFirst({ where: { phone }, select: { id: true } });
  if (existing) return existing.id;

  const created = await prisma.visitor.create({
    data: {
      phone,
      name,
      source: 'WIFI_PORTAL',   // ADAPT: احذفه لو العمود غير موجود
    },
    select: { id: true },
  });
  return created.id;
}

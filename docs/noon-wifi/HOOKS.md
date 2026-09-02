# الترقيعات على الكود الحالي

كل ما تحتاج تعديله في مستودعاتك القائمة. لا شيء آخر يتغيّر.

---

## 1. noonCowork — نقطة الإقلاع

`src/app.ts` (أو `server.ts`)

```ts
import path from 'node:path';
import express from 'express';
import { hotspotRouter } from './modules/hotspot/hotspot.routes';
import { registerHotspotCrons } from './modules/hotspot/hotspot.cron';

// مسارات البوابة
app.use('/api/v1/hotspot', hotspotRouter);

// صفحة البوابة نفسها — ملف static واحد
app.use('/portal', express.static(path.join(__dirname, '../public/portal')));

// المهام المجدولة
registerHotspotCrons();
```

ضع `portal/index.html` في `public/portal/index.html`.

> **مهم:** لو كان لديك CSP أو helmet مشدّد، استثنِ `/portal` أو اسمح بـ
> `script-src 'unsafe-inline'` عليه فقط — البوابة سكربت inline بالكامل عمداً.

---

## 2. noonCowork — زر «إنهاء الجلسة» في صفحة داخل المساحة

هذا هو الربط الأهم: إنهاء الحضور يقطع الإنترنت ويحسب فاتورته.

`src/modules/sessions/service.ts`

```ts
import { endByPhone } from '../hotspot/hotspot.service';

async checkOut(sessionId: string /*, ... */) {
  const session = await /* ... منطقك الحالي كما هو ... */;

  // --- noonWiFi ---
  // مُنتظَر عمداً (لا fire-and-forget): نحتاج مبلغ الإنترنت قبل إغلاق الفاتورة.
  // ملفوف بـ try حتى لا يعطّل عطلٌ في الراوتر تسجيلَ الخروج.
  try {
    const phone = session.visitor?.phone ?? session.subscriber?.phone;
    if (phone) {
      const net = await endByPhone(phone, 'CHECKOUT');
      if (net.amount > 0) {
        // اعرضه في رد الـ API ليظهر للموظف في نافذة تأكيد الخروج
        (session as any).internetCharge = { amount: net.amount, minutes: net.minutes };
      }
    }
  } catch (err) {
    console.error('[hotspot] cutoff on checkout failed', err);
  }

  return session;
}
```

**في الواجهة (`داخل المساحة`)** أضف إلى بطاقة كل شخص:

- شارة صغيرة «متصل بالشبكة · 20 ميجا» عند وجود `NetSession` مفتوحة.
- في نافذة تأكيد الخروج: «رسوم الإنترنت: 8.00 ₪ (95 دقيقة)» قبل الضغط النهائي.

هذا يجعل الموظف يرى الرقم قبل أن يقبضه، ويمنع مفاجآت العميل.

---

## 3. noonCowork — إضافة مشترك أو تجديده

`src/modules/subscribers/service.ts` — عند التجديد، أعِد تفعيل مستخدم الراوتر
الذي عُطِّل عند آخر خروج:

```ts
import { getMikrotik } from '../../lib/mikrotik';

// داخل renewSubscription، بعد نجاح التجديد وبجانب syncMemberToAnoonQr الحالي:
getMikrotik().setUserDisabled(subscriber.phone, false).catch(() => {});
```

---

## 4. Anoon QR — لا تغييرات إلزامية

سلسلة العمل تبقى كما هي:
`POST /checkin` ← `notifyNooncowork()` ← `POST /api/v1/integrations/anoon-checkin`

البوابة تنادي `POST /checkin` بأسلوب fire-and-forget بعد نجاح الدخول، فيُسجَّل
الحضور عند Anoon أيضاً وتبقى تنبيهات Telegram تعمل. إنشاء الجلسة في noonCowork
عندك **idempotent** (يرجع الجلسة المفتوحة بـ 200)، لذا لا ازدواج ولا حلقة لا نهائية —
لأن مسار الدخول عند noonCowork لا يعاود النداء على Anoon.

**تحسين اختياري:** في `POST /checkin` أضف حقل `source: 'WIFI_PORTAL' | 'QR'`
لتفريق من دخل عبر الشبكة عمّن مسح الـ QR فقط.

---

## 5. متغيرات البيئة الجديدة

`.env` في noonCowork (وحدّث `.env.example`):

```bash
# --- MikroTik ---
MIKROTIK_HOST=10.20.0.2          # عنوان الراوتر عبر نفق L2TP
MIKROTIK_PORT=8728
MIKROTIK_USER=noonapi
MIKROTIK_PASSWORD=<API_PASSWORD>
MIKROTIK_TIMEOUT_SEC=8

# --- noonWiFi ---
HOTSPOT_USER_SECRET=<سر عشوائي 32 بايت — يشتق كلمات سر مستخدمي الراوتر>
BUSINESS_CLOSE_TIME=22:00
TZ_NAME=Asia/Hebron
MAX_DEVICES_PER_PHONE=4

# --- الفوترة ---
INTERNET_BILLING_MODE=surcharge   # أو replaces — أكّد القرار أولاً
BILLING_MIN_MINUTES=60
BILLING_INCREMENT_MINUTES=15

# موجود لديك مسبقاً
ANOON_QR_BASE_URL=https://qr-attendance-system-duur.onrender.com
INTERNAL_SYNC_SECRET=<السر المشترك الحالي>
```

توليد السر:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> **تحذير:** تغيير `HOTSPOT_USER_SECRET` لاحقاً يبطل كلمات سر كل مستخدمي الراوتر
> الموجودين. عندها نفّذ: `/ip hotspot user remove [find comment~"noonWiFi"]`
> وسيُعاد إنشاؤهم تلقائياً عند أول دخول لكل شخص.

---

## 6. الحزم الجديدة

```bash
npm i node-routeros node-cron express-rate-limit
npm i -D @types/node-cron
```

`node-routeros` بلا تعريفات TypeScript كاملة. أنشئ `src/types/node-routeros.d.ts`:

```ts
declare module 'node-routeros' {
  export class RouterOSAPI {
    constructor(opts: {
      host: string; user: string; password: string;
      port?: number; timeout?: number; keepalive?: boolean;
    });
    connected: boolean;
    connect(): Promise<RouterOSAPI>;
    write(cmd: string[]): Promise<any[]>;
    close(): Promise<void>;
    on(event: string, cb: (...args: any[]) => void): void;
  }
}
```

---

## 7. رمز الـ QR على الباب

**الأفضل:** رمز انضمام واي فاي، لا رابط:

```
WIFI:S:NOON-WIFI;T:WPA;P:<كلمة سر الشبكة>;;
```

يمسحه الشخص ← ينضم للشبكة ← يفتح نظام الهاتف البوابة تلقائياً.
خطوة واحدة، ولا يحتاج أن يكون على الشبكة مسبقاً ليفتح الرابط.

**لو أبقيت رابطاً**، اجعله `http://` وليس `https://` — الـ hotspot يستطيع اعتراض
HTTP وإعادة التوجيه، أما HTTPS فيُنتج تحذير شهادة أو فشلاً صامتاً.

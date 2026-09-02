# خطة التنفيذ والاختبار

نفّذ بالترتيب. كل مرحلة تُختبر قبل التالية، فأي عطل يظهر معزولاً.

---

## المرحلة 0 — تصفية المعلّق (15 دقيقة)

- [ ] حذف "Test User" / 0599999998 من قاعدة Anoon QR الإنتاجية
- [ ] `node scripts/backfill-anoon-sync.ts --live` ← يجب 20/20
- [ ] التأكد من ظهور الـ 20 مشتركاً في لوحة Anoon QR

## المرحلة 1 — الوصول للراوتر (ساعة)

- [ ] نسخة احتياطية: `/system backup save name=before-noonwifi` + `/export`
- [ ] إعداد L2TP/IPsec على الـ VPS (`mikrotik/03-l2tp-client.rsc` القسم أ)
- [ ] عميل L2TP على الراوتر (القسم ب)
- [ ] من الـ VPS: `ping 10.20.0.2` ثم `nc -vz 10.20.0.2 8728`
- [ ] إنشاء مستخدم API (`01-hotspot-setup.rsc` القسم 1)

اختبار الاتصال من الـ VPS:

```bash
node -e "
const {RouterOSAPI}=require('node-routeros');
const c=new RouterOSAPI({host:'10.20.0.2',user:'noonapi',password:process.env.MIKROTIK_PASSWORD,port:8728});
c.connect().then(()=>c.write(['/system/resource/print']))
 .then(r=>{console.log('OK', r[0]['version'], r[0]['board-name']); process.exit(0)})
 .catch(e=>{console.error('FAIL',e); process.exit(1)});
"
```

يجب أن يطبع `6.49.19`.

## المرحلة 2 — الـ Hotspot (ساعتان)

- [ ] تنفيذ `01-hotspot-setup.rsc` (الأقسام 2–6)
- [ ] رفع `02-login.html` إلى مجلد `hotspot/` على الراوتر (احفظ الأصلي أولاً)
- [ ] **الاختبار الحاسم يدوياً من الطرفية:**

```
/ip hotspot user add name=test password=test123 profile=visitor-20m
/ip hotspot host print                       ← خذ mac و address لجهاز متصل
/ip hotspot active login user=test password=test123 mac-address=XX:XX:... ip=10.10.0.25
/ip hotspot active print                     ← يجب أن يظهر test
```

لو فشل هذا الأمر، توقّف ولا تكمل — كل النظام مبني عليه.

```
/ip hotspot active remove [find user=test]
/ip hotspot user remove [find name=test]
```

- [ ] اتصل بهاتف: يجب أن تُفتح البوابة تلقائياً (ستعطي 404 حتى المرحلة 4)
- [ ] تحقق أن نطاق الـ VPS يفتح قبل الدخول، وأن أي موقع آخر لا يفتح

## المرحلة 3 — قاعدة البيانات والعميل (ساعتان)

- [ ] دمج `prisma-additions.prisma` + `npx prisma migrate dev --name add_hotspot`
- [ ] `npm i node-routeros node-cron express-rate-limit`
- [ ] نسخ `src/lib/mikrotik.ts` + ملف التعريفات `.d.ts`
- [ ] ضبط متغيرات البيئة (راجع HOOKS.md القسم 5)
- [ ] `GET /api/v1/hotspot/status` بالسر الداخلي ← `{"router":"up"}`

## المرحلة 4 — الوحدة والبوابة (يوم)

- [ ] نسخ ملفات `modules/hotspot/*`
- [ ] **ملاءمة `identity.service.ts` مع مخططك** — كل استعلام معلَّم بـ ADAPT
- [ ] نسخ `portal/index.html` إلى `public/portal/`
- [ ] ربط الراوتر والـ static في `app.ts`
- [ ] اختبار السيناريوهات أدناه

## المرحلة 5 — الخروج والفوترة (نصف يوم)

- [ ] ترقيع `checkOut` (HOOKS.md القسم 2)
- [ ] تنفيذ `postCharge` فعلياً حسب قرار الفوترة
- [ ] إظهار رسم الإنترنت في نافذة تأكيد الخروج
- [ ] `registerHotspotCrons()`
- [ ] اختبار الكرون بتقديم `BUSINESS_CLOSE_TIME` مؤقتاً لدقيقتين من الآن

## المرحلة 6 — تشغيل تجريبي (نصف يوم)

يوم كامل مع موظفي المساحة وأجهزتهم قبل الإطلاق للعملاء.

---

## سيناريوهات الاختبار

| # | السيناريو | المتوقع |
|---|---|---|
| 1 | زائر جديد، جهاز جديد، 20 ميجا | يُنشأ زائر + جلسة حضور + NetSession، سرعة 20، السعر 4 ₪ ظاهر |
| 2 | نفس الزائر بعد إعادة الاتصال | البوابة تعرف اسمه ولا تطلب الرقم |
| 3 | مشترك فعّال | 10 ميجا، «مجاناً»، لا خيار سرعة |
| 4 | مشترك منتهٍ | يتصل + تحذير التجديد ظاهر |
| 5 | متدرّب في دورة جارية | نوع TRAINEE، 10 ميجا مجاناً |
| 6 | موظف | نوع EMPLOYEE، 10 ميجا مجاناً |
| 7 | **جوال + لابتوب**: سجّل اللابتوب أولاً، اخرج، ثم امسح من الجوال | اللابتوب يعود للإنترنت بلا تدخّل، والبوابة تقول «وصّلنا أيضاً 1 من أجهزتك» |
| 8 | إنهاء الجلسة من صفحة داخل المساحة | الإنترنت ينقطع خلال ثوانٍ + مبلغ صحيح |
| 9 | زائر يبقى بعد الإغلاق | الكرون يقطعه ويحاسبه END_OF_DAY |
| 10 | إطفاء الراوتر أثناء التشغيل | البوابة تعرض خطأً واضحاً، والخادم لا ينهار |
| 11 | نداء `/login` من خارج الشبكة بـ MAC مزيّف | 403 «هذا الجهاز غير متصل بشبكة المساحة» |
| 12 | 25 نداءً في دقيقة من نفس الـ MAC | 429 |
| 13 | زائر يخرج ثم يعود بعد ساعة | جلسة جديدة، الأولى فُوترت مستقلة |

---

## نقاط فشل معروفة وعلاجها

**البوابة لا تُفتح تلقائياً على iPhone**
كاشف Apple ينادي `captive.apple.com` عبر HTTP. تأكد أن `login-by=http-pap` فقط
وأن `dns-name` مضبوط. لا تضع `captive.apple.com` في الـ walled garden — سيظن
النظام أن الإنترنت متاح ولن يفتح البوابة إطلاقاً.

**البوابة تُفتح لكنها فارغة**
نطاق الـ VPS غير مفتوح في walled garden، أو HTTPS مفتوح بالاسم فقط دون
`walled-garden ip` بالمنفذ 443.

**الدخول ينجح والإنترنت لا يعمل**
`/ip hotspot active print` — إن ظهر المستخدم فالمشكلة في التوجيه/NAT لا عندنا.
تحقق من `/ip firewall nat` masquerade.

**السرعة لا تُطبَّق**
`/ip hotspot active print detail` وانظر `limit-bytes`/الـ queue الديناميكي في
`/queue simple print`. اسم الـ profile في `hotspot.config.ts` يجب أن يطابق
الراوتر حرفياً.

**«MAC غير موجود في hotspot host»**
الجهاز يستخدم **MAC عشوائي خاص** (خيار افتراضي في iOS 14+ وأندرويد 10+).
هذا ليس عطلاً، لكنه يعني أن الجهاز نفسه قد يبدو جديداً بين الزيارات فيُطلب
الرقم مجدداً. عالجه بأحد أمرين: لافتة تطلب إيقاف «العنوان الخاص» لشبكة noon،
أو اقبل أن يُدخل بعض الناس الرقم أحياناً — لن يكسر شيئاً لأن الرقم هو المفتاح
وليس الـ MAC.

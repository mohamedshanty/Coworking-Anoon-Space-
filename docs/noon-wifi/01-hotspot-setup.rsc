# ============================================================================
#  noonWiFi — إعداد الـ Hotspot على RouterOS v6.49.19
#  نفّذه سطراً سطراً في الطرفية (New Terminal في WinBox) وليس دفعة واحدة أول مرة.
#  استبدل القيم بين <> قبل التنفيذ.
#
#  <VPS_IP>        : IP خادم Hostinger
#  <TUNNEL_VPS_IP> : 10.20.0.1  (لو استخدمت نفق L2TP — راجع 03-l2tp-client.rsc)
#  <WIFI_IFACE>    : اسم الجسر/الواجهة اللاسلكية، مثل bridge-wifi
#  <API_PASSWORD>  : كلمة سر قوية لمستخدم الـ API
# ============================================================================

# --- 0) نسخة احتياطية قبل أي شيء -------------------------------------------
/system backup save name=before-noonwifi
/export file=before-noonwifi

# --- 1) مستخدم الـ API -------------------------------------------------------
# صلاحيات الحد الأدنى: لا winbox ولا ssh ولا policy
/user group add name=noon-api policy=api,read,write,test comment="noonCowork backend"
/user add name=noonapi group=noon-api password="<API_PASSWORD>" \
    address=<TUNNEL_VPS_IP>/32 comment="noonWiFi backend"

# تفعيل الـ Binary API مقيّداً بالخادم فقط
/ip service set api disabled=no port=8728 address=<TUNNEL_VPS_IP>/32
/ip service set api-ssl disabled=yes
# لو لم تستخدم النفق، بدّل العنوان إلى <VPS_IP>/32 وفعّل api-ssl على 8729 بدل api.

# --- 2) شبكة الـ Hotspot -----------------------------------------------------
/ip pool add name=hs-pool ranges=10.10.0.10-10.10.0.250
/ip address add address=10.10.0.1/24 interface=<WIFI_IFACE> comment="noon hotspot gw"
/ip dhcp-server add name=hs-dhcp interface=<WIFI_IFACE> address-pool=hs-pool \
    lease-time=4h disabled=no
/ip dhcp-server network add address=10.10.0.0/24 gateway=10.10.0.1 dns-server=10.10.0.1
/ip dns set allow-remote-requests=yes servers=1.1.1.1,8.8.8.8

# --- 3) ملف تعريف الخادم -----------------------------------------------------
# مهم جداً: login-by=http-pap فقط.
#   - بدون mac-cookie  ⇒ لا يوجد دخول تلقائي متذكَّر، الجميع يمر بالبوابة في كل زيارة.
#   - بدون http-chap   ⇒ لا حاجة لـ md5.js ولا chap-challenge.
#   - بدون trial       ⇒ لا إنترنت مجاني تجريبي.
/ip hotspot profile add name=noon-hsprof \
    hotspot-address=10.10.0.1 \
    dns-name=wifi.noon \
    html-directory=hotspot \
    login-by=http-pap \
    use-radius=no

/ip hotspot add name=noon-hs interface=<WIFI_IFACE> address-pool=hs-pool \
    profile=noon-hsprof addresses-per-mac=2 idle-timeout=10m keepalive-timeout=2m \
    disabled=no

# --- 4) باقات السرعة ---------------------------------------------------------
# صيغة rate-limit في RouterOS هي: rx-rate/tx-rate  من منظور الراوتر تجاه العميل
#   rx = رفع العميل (upload)  |  tx = تنزيل العميل (download)
# نستخدم قيماً متماثلة لتجنّب أي التباس.
# shared-users=4 يسمح للشخص الواحد بربط جواله + لابتوب + تابلت برقم واحد.
#
# idle-timeout=60m (وليس 15m) — مع إلغاء الفوترة عند الخمول لم تعد المهلة قراراً
# مالياً، لكنها تقلّل مرات إعادة المسح المُحبطة للزائر. keepalive-timeout=2m
# يكفي لإبقاء الجلسة حيّة أثناء الاجتماع/النوم القصير.
# الفوترة على مستوى الزيارة كاملة (وليس الجلسة)، والمصالحة على الخمول لا تفوتر.
/ip hotspot user profile
add name=noon-10m      rate-limit=10M/10M shared-users=4 idle-timeout=60m keepalive-timeout=2m \
    comment="مشترك/متدرب/موظف — مجاني"
add name=visitor-10m   rate-limit=10M/10M shared-users=4 idle-timeout=60m keepalive-timeout=2m \
    comment="زائر — 3 شيكل/ساعة"
add name=visitor-20m   rate-limit=20M/20M shared-users=4 idle-timeout=60m keepalive-timeout=2m \
    comment="زائر — 4 شيكل/ساعة"
add name=visitor-30m   rate-limit=30M/30M shared-users=4 idle-timeout=60m keepalive-timeout=2m \
    comment="زائر — 5 شيكل/ساعة"

# تأكيد إغلاق أي دخول تلقائي متبقٍ على البروفايل الافتراضي
/ip hotspot user profile set [find name=default] mac-cookie-timeout=0s

# --- 5) الـ Walled Garden ----------------------------------------------------
# HTTP يمر عبر hotspot proxy → dst-host يكفي.
# HTTPS لا يمر عبر البروكسي → يجب فتحه في walled-garden ip بالعنوان الرقمي.
/ip hotspot walled-garden
add dst-host=nooncowork.191-101-81-99.sslip.io action=allow comment="noonWiFi portal"

/ip hotspot walled-garden ip
add dst-address=<VPS_IP> protocol=tcp dst-port=443 action=accept comment="portal https"
add dst-address=<VPS_IP> protocol=tcp dst-port=80  action=accept comment="portal http"

# لو استخدمت خطوط الويب (Google Fonts) في البوابة أضفها هنا أيضاً،
# أو الأفضل: استضف الخطوط محلياً على الـ VPS (البوابة الجاهزة لا تستدعي أي مورد خارجي).

# --- 6) شبكة أمان: قطع الجميع عند نهاية الدوام ------------------------------
# هذا احتياط فقط — القطع الأساسي يتم من الخادم عبر الكرون.
/system scheduler add name=noon-eod-clear start-time=22:05:00 interval=1d \
    policy=read,write \
    on-event="/ip hotspot active remove [find]" \
    comment="قطع كل الجلسات النشطة بعد نهاية الدوام"

# --- 7) تحققات سريعة ---------------------------------------------------------
# /ip hotspot user profile print
# /ip hotspot print
# /ip hotspot walled-garden print
# /ip service print
#
# اختبار الأمر الذي يعتمد عليه النظام كله (استبدل القيم بجهاز متصل فعلاً):
#   /ip hotspot user add name=test password=test123 profile=visitor-20m
#   /ip hotspot host print          ← خذ الـ mac والـ address من هنا
#   /ip hotspot active login user=test password=test123 mac-address=XX:XX:XX:XX:XX:XX ip=10.10.0.25
#   /ip hotspot active print        ← يجب أن يظهر test
#   /ip hotspot active remove [find user=test]
#   /ip hotspot user remove [find name=test]
# لو نجح هذا الاختبار يدوياً، فالنظام كله سينجح.

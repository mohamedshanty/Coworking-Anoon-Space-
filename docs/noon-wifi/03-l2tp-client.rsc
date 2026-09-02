# ============================================================================
#  نفق L2TP/IPsec: الراوتر (عميل) ← VPS (خادم)
#  الهدف: أن يستطيع الـ backend على الـ VPS الوصول إلى API الراوتر بعنوان ثابت
#  دون فتح المنفذ 8728 على الإنترنت.
#  WireGuard غير مدعوم في RouterOS v6 — لذلك L2TP/IPsec هو الخيار العملي.
# ============================================================================

# --------- (أ) على الـ VPS (Ubuntu 24.04) — مرة واحدة --------------------------
# sudo apt install -y strongswan xl2tpd ppp
#
# /etc/ipsec.conf
#   conn L2TP-PSK
#     authby=secret ; type=transport ; keyexchange=ikev1
#     left=%defaultroute ; leftprotoport=17/1701
#     right=%any        ; rightprotoport=17/%any
#     auto=add ; ike=aes256-sha1-modp1024 ; esp=aes256-sha1
#
# /etc/ipsec.secrets
#   : PSK "<IPSEC_SECRET>"
#
# /etc/xl2tpd/xl2tpd.conf
#   [global]
#   [lns default]
#   ip range = 10.20.0.2-10.20.0.9
#   local ip = 10.20.0.1
#   require chap = yes ; refuse pap = yes ; ppp debug = no
#   pppoptfile = /etc/ppp/options.xl2tpd
#
# /etc/ppp/chap-secrets
#   noonrouter  *  <PPP_PASSWORD>  10.20.0.2
#
# افتح في جدار الـ VPS الناري: UDP 500، UDP 4500، UDP 1701، وبروتوكول ESP.
# ثم:  sudo systemctl restart ipsec xl2tpd && sudo systemctl enable ipsec xl2tpd

# --------- (ب) على الراوتر ----------------------------------------------------
/interface l2tp-client add name=l2tp-vps \
    connect-to=<VPS_IP> \
    user=noonrouter password="<PPP_PASSWORD>" \
    use-ipsec=yes ipsec-secret="<IPSEC_SECRET>" \
    add-default-route=no \
    profile=default-encryption \
    disabled=no comment="tunnel to noonCowork VPS"

# لا نغيّر مسار الإنترنت الافتراضي — النفق للإدارة فقط.
# اسمح للـ API عبر النفق فقط:
/ip firewall filter
add chain=input in-interface=l2tp-vps protocol=tcp dst-port=8728 \
    src-address=10.20.0.1 action=accept comment="noonWiFi API over tunnel" \
    place-before=[find where chain=input and action=drop]

# --------- (ج) تحقق ----------------------------------------------------------
# على الراوتر:  /ping 10.20.0.1
# على الـ VPS:  ping 10.20.0.2  ثم  nc -vz 10.20.0.2 8728
# ثم في .env الخاص بـ noonCowork:  MIKROTIK_HOST=10.20.0.2

# --------- (د) استقرار النفق --------------------------------------------------
# مراقبة وإعادة اتصال تلقائية كل 5 دقائق لو سقط النفق:
/system scheduler add name=l2tp-watchdog interval=5m policy=read,write,test \
    on-event=":if ([/ping 10.20.0.1 count=3] = 0) do={ \
        /interface l2tp-client disable l2tp-vps; :delay 3s; \
        /interface l2tp-client enable l2tp-vps; \
        :log warning \"noonWiFi: l2tp tunnel restarted\" }"

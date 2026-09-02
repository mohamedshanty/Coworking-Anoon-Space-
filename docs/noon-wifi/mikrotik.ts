/**
 * عميل MikroTik RouterOS — Binary API (منفذ 8728)
 * متوافق مع v6.49.19. لا يستخدم REST إطلاقاً (غير موجود قبل v7.1).
 *
 *   npm i node-routeros
 *
 * ملاحظات على صيغة node-routeros:
 *   - أول عنصر في المصفوفة هو المسار: '/ip/hotspot/user/print'
 *   - '=key=value' لتمرير قيمة (add/set/command)
 *   - '?key=value' للاستعلام (print)
 *   - الردود تعود كمصفوفة كائنات، ومفاتيحها بنفس أسماء RouterOS ('.id', 'mac-address'...)
 */

import { RouterOSAPI } from 'node-routeros';

export type MikrotikConfig = {
  host: string;
  user: string;
  password: string;
  port?: number;
  timeoutSec?: number;
};

export type HotspotHost = {
  id: string;
  mac: string;
  address?: string;
  toAddress?: string;
  authorized: boolean;
  bypassed: boolean;
};

export class MikrotikError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'MikrotikError';
  }
}

/** يوحّد صيغة الـ MAC: AA:BB:CC:DD:EE:FF */
export function normalizeMac(raw: string): string {
  const hex = (raw || '').replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  if (hex.length !== 12) throw new MikrotikError(`MAC غير صالح: ${raw}`);
  return hex.match(/.{2}/g)!.join(':');
}

export function isValidIpv4(ip: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) &&
    ip.split('.').every((o) => Number(o) >= 0 && Number(o) <= 255);
}

class MikrotikClient {
  private conn: RouterOSAPI | null = null;
  private connecting: Promise<RouterOSAPI> | null = null;

  constructor(private cfg: MikrotikConfig) {}

  // -- إدارة الاتصال ---------------------------------------------------------
  /**
   * اتصال واحد دائم يُعاد استخدامه. عند أي خطأ في الشبكة نُسقط المرجع
   * فيُعاد الاتصال في النداء التالي. `keepalive` يمنع إسقاط الجلسة الخاملة.
   */
  private async connect(): Promise<RouterOSAPI> {
    if (this.conn?.connected) return this.conn;
    if (this.connecting) return this.connecting;

    this.connecting = (async () => {
      const api = new RouterOSAPI({
        host: this.cfg.host,
        user: this.cfg.user,
        password: this.cfg.password,
        port: this.cfg.port ?? 8728,
        timeout: this.cfg.timeoutSec ?? 8,
        keepalive: true,
      });
      try {
        await api.connect();
      } catch (err) {
        this.connecting = null;
        throw new MikrotikError('فشل الاتصال بالراوتر', err);
      }
      api.on('error', () => { this.conn = null; });
      api.on('close', () => { this.conn = null; });
      this.conn = api;
      this.connecting = null;
      return api;
    })();

    return this.connecting;
  }

  /** تنفيذ أمر مع إعادة محاولة واحدة عند انقطاع الاتصال */
  private async write(cmd: string[]): Promise<any[]> {
    try {
      const api = await this.connect();
      return await api.write(cmd);
    } catch (err) {
      this.conn = null;
      try {
        const api = await this.connect();
        return await api.write(cmd);
      } catch (err2) {
        throw new MikrotikError(`فشل تنفيذ ${cmd[0]}`, err2);
      }
    }
  }

  async ping(): Promise<boolean> {
    const res = await this.write(['/system/identity/print']);
    return Array.isArray(res);
  }

  async close(): Promise<void> {
    if (this.conn?.connected) await this.conn.close();
    this.conn = null;
  }

  // -- مستخدمو الـ Hotspot ---------------------------------------------------

  async findUser(name: string): Promise<any | null> {
    const res = await this.write(['/ip/hotspot/user/print', `?name=${name}`]);
    return res[0] ?? null;
  }

  /**
   * ينشئ المستخدم أو يحدّث باقته وكلمة سره.
   * اسم المستخدم = رقم الجوال، فيبقى ثابتاً عبر الزيارات.
   */
  async ensureUser(opts: {
    name: string;
    password: string;
    profile: string;
    comment?: string;
  }): Promise<void> {
    const existing = await this.findUser(opts.name);
    const params = [
      `=password=${opts.password}`,
      `=profile=${opts.profile}`,
      `=comment=${opts.comment ?? 'noonWiFi'}`,
      '=disabled=no',
    ];
    if (existing) {
      await this.write(['/ip/hotspot/user/set', `=.id=${existing['.id']}`, ...params]);
    } else {
      await this.write(['/ip/hotspot/user/add', `=name=${opts.name}`, ...params]);
    }
  }

  async setUserDisabled(name: string, disabled: boolean): Promise<void> {
    const u = await this.findUser(name);
    if (!u) return;
    await this.write([
      '/ip/hotspot/user/set',
      `=.id=${u['.id']}`,
      `=disabled=${disabled ? 'yes' : 'no'}`,
    ]);
  }

  async removeUser(name: string): Promise<void> {
    const u = await this.findUser(name);
    if (!u) return;
    await this.write(['/ip/hotspot/user/remove', `=.id=${u['.id']}`]);
  }

  // -- تسجيل الدخول من جهة الخادم -------------------------------------------

  /**
   * الأمر الجوهري في هذا النظام.
   * متاح منذ RouterOS v6.34 (نسختك 6.49.19) — يسجّل دخول جهاز دون أي تفاعل
   * من متصفح العميل، ما يلغي الحاجة لـ CHAP ويتجاوز مشكلة mixed-content.
   */
  async activeLogin(opts: {
    user: string;
    password: string;
    ip: string;
    mac: string;
  }): Promise<void> {
    if (!isValidIpv4(opts.ip)) throw new MikrotikError(`IP غير صالح: ${opts.ip}`);
    await this.write([
      '/ip/hotspot/active/login',
      `=user=${opts.user}`,
      `=password=${opts.password}`,
      `=ip=${opts.ip}`,
      `=mac-address=${normalizeMac(opts.mac)}`,
    ]);
  }

  async listActiveByUser(user: string): Promise<any[]> {
    return this.write(['/ip/hotspot/active/print', `?user=${user}`]);
  }

  /** إنهاء كل الجلسات النشطة لرقم جوال (كل أجهزته) */
  async logoutUser(user: string): Promise<number> {
    const active = await this.listActiveByUser(user);
    for (const a of active) {
      await this.write(['/ip/hotspot/active/remove', `=.id=${a['.id']}`]);
    }
    return active.length;
  }

  async logoutMac(mac: string): Promise<number> {
    const m = normalizeMac(mac);
    const active = await this.write(['/ip/hotspot/active/print', `?mac-address=${m}`]);
    for (const a of active) {
      await this.write(['/ip/hotspot/active/remove', `=.id=${a['.id']}`]);
    }
    return active.length;
  }

  /** قطع كل الجلسات — تُستخدم في كرون نهاية الدوام كإجراء أخير */
  async logoutAll(): Promise<number> {
    const active = await this.write(['/ip/hotspot/active/print']);
    for (const a of active) {
      await this.write(['/ip/hotspot/active/remove', `=.id=${a['.id']}`]);
    }
    return active.length;
  }

  // -- استكشاف الأجهزة ------------------------------------------------------

  /**
   * جدول مضيفي الـ hotspot: كل جهاز متصل بالشبكة سواء فُوِّض أم لا.
   * نستخدمه للتحقق أن الـ MAC القادم من البوابة موجود فعلاً على شبكتنا،
   * حتى لا يستطيع أحد من خارج المساحة تفويض جهاز.
   */
  async findHost(mac: string): Promise<HotspotHost | null> {
    const m = normalizeMac(mac);
    const res = await this.write(['/ip/hotspot/host/print', `?mac-address=${m}`]);
    const h = res[0];
    if (!h) return null;
    return {
      id: h['.id'],
      mac: h['mac-address'],
      address: h['address'],
      toAddress: h['to-address'],
      authorized: h['authorized'] === 'true',
      bypassed: h['bypassed'] === 'true',
    };
  }

  /**
   * إيجاد IP الحالي لجهاز من الـ MAC.
   * الترتيب: hotspot host ← DHCP lease ← ARP.
   * هذا ما يسمح بإعادة تفويض اللابتوب عند مسح الـ QR من الجوال.
   */
  async findIpByMac(mac: string): Promise<string | null> {
    const m = normalizeMac(mac);

    const host = await this.findHost(m);
    if (host?.address && isValidIpv4(host.address)) return host.address;

    const leases = await this.write([
      '/ip/dhcp-server/lease/print',
      `?mac-address=${m}`,
      '?status=bound',
    ]);
    const lease = leases[0]?.['active-address'] ?? leases[0]?.['address'];
    if (lease && isValidIpv4(lease)) return lease;

    const arp = await this.write(['/ip/arp/print', `?mac-address=${m}`]);
    const arpIp = arp[0]?.['address'];
    if (arpIp && isValidIpv4(arpIp)) return arpIp;

    return null;
  }

  async getHostname(mac: string): Promise<string | null> {
    const m = normalizeMac(mac);
    const leases = await this.write(['/ip/dhcp-server/lease/print', `?mac-address=${m}`]);
    return leases[0]?.['host-name'] ?? null;
  }
}

// -- Singleton ----------------------------------------------------------------

let instance: MikrotikClient | null = null;

export function getMikrotik(): MikrotikClient {
  if (!instance) {
    const host = process.env.MIKROTIK_HOST;
    const user = process.env.MIKROTIK_USER;
    const password = process.env.MIKROTIK_PASSWORD;
    if (!host || !user || !password) {
      throw new MikrotikError('متغيرات MIKROTIK_* غير مضبوطة في البيئة');
    }
    instance = new MikrotikClient({
      host,
      user,
      password,
      port: Number(process.env.MIKROTIK_PORT ?? 8728),
      timeoutSec: Number(process.env.MIKROTIK_TIMEOUT_SEC ?? 8),
    });
  }
  return instance;
}

export type { MikrotikClient };

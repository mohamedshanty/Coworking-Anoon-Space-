/**
 * مهام مجدولة.
 *   npm i node-cron
 *
 * سجّلها في نقطة إقلاع الخادم:
 *   import { registerHotspotCrons } from './modules/hotspot/hotspot.cron';
 *   registerHotspotCrons();
 */

import cron from 'node-cron';
import { prisma } from '../../lib/prisma';
import { getMikrotik } from '../../lib/mikrotik';
import { endOfDaySweep, endByPhone } from './hotspot.service';
import { BUSINESS_CLOSE, TIMEZONE } from './hotspot.config';

export function registerHotspotCrons() {
  const [hh, mm] = BUSINESS_CLOSE.split(':');

  // 1) قطع الزوار عند نهاية الدوام
  cron.schedule(`${mm} ${hh} * * *`, async () => {
    try {
      const r = await endOfDaySweep();
      console.log('[hotspot] EOD sweep', r);
    } catch (err) {
      console.error('[hotspot] EOD sweep failed', err);
    }
  }, { timezone: TIMEZONE });

  // 2) مصالحة كل 10 دقائق:
  //    جلسة مفتوحة عندنا لكن الراوتر لم يعد يعرفها (idle timeout / إعادة تشغيل)
  //    ⇒ نغلقها ونحاسب عليها بدل أن تبقى مفتوحة للأبد.
  cron.schedule('*/10 * * * *', async () => {
    try {
      const open = await prisma.netSession.findMany({
        where: { endedAt: null },
        select: { phone: true },
      });
      if (open.length === 0) return;

      const mt = getMikrotik();
      for (const s of open) {
        const active = await mt.listActiveByUser(s.phone);
        if (active.length === 0) {
          await endByPhone(s.phone, 'IDLE');
          console.log('[hotspot] reconciled stale session', s.phone);
        }
      }
    } catch (err) {
      console.error('[hotspot] reconcile failed', err);
    }
  }, { timezone: TIMEZONE });

  console.log(`[hotspot] crons registered — close ${BUSINESS_CLOSE} ${TIMEZONE}`);
}

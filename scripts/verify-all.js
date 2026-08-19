const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_NePRtc7ikfM0@ep-raspy-moon-aix4blmi-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

const r2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

async function run() {
  console.log('=== FINAL VERIFICATION ===\n');

  // Bug 2: Week 2026-08-15 to 2026-08-20 (Palestine time)
  // Monday 00:00 Asia/Hebron = Sunday 21:00 UTC
  // Saturday 23:59:59 Asia/Hebron = Saturday 20:59:59 UTC
  const weekFrom = new Date('2026-08-14T21:00:00.000Z');
  const weekTo = new Date('2026-08-20T20:59:59.000Z');

  // Daily revenue for each day in the week
  console.log('--- BUG 2: Weekly consistency check (2026-08-15 to 2026-08-20) ---');
  let weeklySum = 0;
  const days = [
    { label: 'Fri Aug 15', from: '2026-08-14T21:00:00.000Z', to: '2026-08-15T20:59:59.000Z' },
    { label: 'Sat Aug 16', from: '2026-08-15T21:00:00.000Z', to: '2026-08-16T20:59:59.000Z' },
    { label: 'Sun Aug 17', from: '2026-08-16T21:00:00.000Z', to: '2026-08-17T20:59:59.000Z' },
    { label: 'Mon Aug 18', from: '2026-08-17T21:00:00.000Z', to: '2026-08-18T20:59:59.000Z' },
    { label: 'Tue Aug 19', from: '2026-08-18T21:00:00.000Z', to: '2026-08-19T20:59:59.000Z' },
    { label: 'Wed Aug 20', from: '2026-08-19T21:00:00.000Z', to: '2026-08-20T20:59:59.000Z' },
  ];

  for (const day of days) {
    const from = new Date(day.from);
    const to = new Date(day.to);

    const sessions = await pool.query(`
      SELECT s.amount, s."paymentStatus", s."sessionType", v.type as "visitorType",
        COALESCE((SELECT SUM(so.total) FROM "SnackOrder" so WHERE so."sessionId" = s.id), 0) as snacks_total
      FROM "Session" s
      JOIN "Visitor" v ON s."visitorId" = v.id
      WHERE s."checkIn" >= $1 AND s."checkIn" <= $2 AND s."checkOut" IS NOT NULL
    `, [from, to]);

    const hoursRev = r2(sessions.rows
      .filter(s => s.paymentStatus === 'paid')
      .reduce((sum, s) => sum + (Number(s.amount) - Number(s.snacks_total)), 0));

    weeklySum += hoursRev;
    console.log(`  ${day.label}: ${sessions.rows.length} sessions, hoursRevenue=${hoursRev}`);
  }
  console.log(`  TOTAL (sum of daily): ${r2(weeklySum)}`);

  // Direct weekly query
  const weeklySessions = await pool.query(`
    SELECT s.amount, s."paymentStatus",
      COALESCE((SELECT SUM(so.total) FROM "SnackOrder" so WHERE so."sessionId" = s.id), 0) as snacks_total
    FROM "Session" s
    WHERE s."checkIn" >= $1 AND s."checkIn" <= $2 AND s."checkOut" IS NOT NULL
  `, [weekFrom, weekTo]);

  const weeklyDirect = r2(weeklySessions.rows
    .filter(s => s.paymentStatus === 'paid')
    .reduce((sum, s) => sum + (Number(s.amount) - Number(s.snacks_total)), 0));

  console.log(`  TOTAL (direct query): ${weeklyDirect}`);
  console.log(`  MATCH: ${r2(weeklySum) === weeklyDirect ? '✓ YES' : '✗ NO'}`);

  // Bug 3: Debt verification
  console.log('\n--- BUG 3: Debt state after fixes ---');

  const collectedDebts = await pool.query(`
    SELECT id, name, amount, type, status, "sessionId", "sessionAmount", "collectedAt"
    FROM "Debt"
    WHERE status = 'collected'
    ORDER BY "collectedAt" DESC
  `);

  let debtHours = 0, debtSnacks = 0, debtManual = 0;
  for (const d of collectedDebts.rows) {
    const total = Number(d.amount);
    if (d.sessionId && d.sessionAmount != null) {
      const h = Number(d.sessionAmount);
      const s = total - h;
      debtHours += h;
      debtSnacks += s;
    } else {
      debtManual += total;
    }
  }

  console.log(`  Collected debts: ${collectedDebts.rows.length}`);
  console.log(`  Session debts (backfilled): ${collectedDebts.rows.filter(d => d.sessionId).length}`);
  console.log(`  Session debts hours portion: ${r2(debtHours)}`);
  console.log(`  Session debts snacks portion: ${r2(debtSnacks)}`);
  console.log(`  Manual/subscription debts: ${r2(debtManual)}`);

  // Verify no zeroed collected session debts remain
  const zeroedSession = await pool.query(`
    SELECT COUNT(*) as cnt FROM "Debt"
    WHERE status = 'collected' AND amount = 0 AND type = 'session'
  `);
  console.log(`  Zeroed collected session debts: ${zeroedSession.rows[0].cnt}`);

  await pool.end();
}

run().catch(e => { console.error('FATAL:', e); pool.end(); });

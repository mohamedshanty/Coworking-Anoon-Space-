const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_NePRtc7ikfM0@ep-raspy-moon-aix4blmi-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

const r2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

// Aug 15 (Sat) 00:00 Palestine = Aug 14 21:00 UTC
// Aug 19 (Wed) 23:59:59 Palestine = Aug 19 20:59:59 UTC
const weekFrom = new Date('2026-08-14T21:00:00.000Z');
const weekTo   = new Date('2026-08-19T20:59:59.000Z');

async function run() {
  console.log('=== PARTIAL WEEK: Sat Aug 15 - Wed Aug 19 (5 days) ===\n');

  // Daily breakdown
  const days = [
    { label: 'Sat Aug 15', from: '2026-08-14T21:00:00.000Z', to: '2026-08-15T20:59:59.000Z' },
    { label: 'Sun Aug 16', from: '2026-08-15T21:00:00.000Z', to: '2026-08-16T20:59:59.000Z' },
    { label: 'Mon Aug 17', from: '2026-08-16T21:00:00.000Z', to: '2026-08-17T20:59:59.000Z' },
    { label: 'Tue Aug 18', from: '2026-08-17T21:00:00.000Z', to: '2026-08-18T20:59:59.000Z' },
    { label: 'Wed Aug 19', from: '2026-08-18T21:00:00.000Z', to: '2026-08-19T20:59:59.000Z' },
  ];

  let dailySum = 0;
  for (const day of days) {
    const from = new Date(day.from);
    const to = new Date(day.to);

    const sessions = await pool.query(`
      SELECT s.id, s.amount::numeric, s."paymentStatus", s."hourlyPriceOverride"::numeric,
        COALESCE((SELECT SUM(so.total) FROM "SnackOrder" so WHERE so."sessionId" = s.id), 0) as snacks_total
      FROM "Session" s
      WHERE s."checkIn" >= $1 AND s."checkIn" <= $2 AND s."checkOut" IS NOT NULL
    `, [from, to]);

    const hoursRev = r2(sessions.rows
      .filter(s => s.paymentStatus === 'paid')
      .reduce((sum, s) => {
        const snacksTotal = Number(s.snacks_total);
        const hoursAmt = s.hourlyPriceOverride != null
          ? Number(s.hourlyPriceOverride)
          : Number(s.amount) - snacksTotal;
        return sum + hoursAmt;
      }, 0));

    dailySum += hoursRev;
    console.log(`  ${day.label}: ${sessions.rows.length} sessions, hoursRevenue=${r2(hoursRev)}`);
  }
  console.log(`\n  Sum of daily (manual): ${r2(dailySum)}`);

  // Direct query for the partial week
  const direct = await pool.query(`
    SELECT s.amount::numeric, s."paymentStatus", s."hourlyPriceOverride"::numeric,
      COALESCE((SELECT SUM(so.total) FROM "SnackOrder" so WHERE so."sessionId" = s.id), 0) as snacks_total
    FROM "Session" s
    WHERE s."checkIn" >= $1 AND s."checkIn" <= $2 AND s."checkOut" IS NOT NULL
  `, [weekFrom, weekTo]);

  const directRev = r2(direct.rows
    .filter(s => s.paymentStatus === 'paid')
    .reduce((sum, s) => {
      const snacksTotal = Number(s.snacks_total);
      const hoursAmt = s.hourlyPriceOverride != null
        ? Number(s.hourlyPriceOverride)
        : Number(s.amount) - snacksTotal;
      return sum + hoursAmt;
    }, 0));

  console.log(`  Direct query:        ${directRev}`);
  console.log(`  Match: ${r2(dailySum) === directRev ? 'YES' : 'NO'}`);

  await pool.end();
}

run().catch(e => { console.error('FATAL:', e); pool.end(); });

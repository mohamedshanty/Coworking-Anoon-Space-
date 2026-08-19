const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_NePRtc7ikfM0@ep-raspy-moon-aix4blmi-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

const r2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

// Aug 1 00:00 Palestine = Jul 31 21:00 UTC
// Aug 19 23:59:59 Palestine = Aug 19 20:59:59 UTC
const monthFrom = new Date('2026-07-31T21:00:00.000Z');
const monthTo   = new Date('2026-08-19T20:59:59.000Z');

async function run() {
  console.log('=== MONTH-TO-DATE: Aug 1 - Aug 19, 2026 ===\n');

  // Daily breakdown
  const dayQueries = [];
  for (let d = 1; d <= 19; d++) {
    const dayStart = new Date(Date.UTC(2026, 7, d - 1, 21, 0, 0)); // Aug d 00:00 Palestine
    const dayEnd   = new Date(Date.UTC(2026, 7, d, 20, 59, 59));   // Aug d 23:59:59 Palestine
    dayQueries.push({ day: d, from: dayStart, to: dayEnd });
  }

  let dailySum = 0;
  for (const dq of dayQueries) {
    const sessions = await pool.query(`
      SELECT s.amount::numeric, s."paymentStatus", s."hourlyPriceOverride"::numeric,
        COALESCE((SELECT SUM(so.total) FROM "SnackOrder" so WHERE so."sessionId" = s.id), 0) as snacks_total
      FROM "Session" s
      WHERE s."checkIn" >= $1 AND s."checkIn" <= $2 AND s."checkOut" IS NOT NULL
    `, [dq.from, dq.to]);

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
    if (sessions.rows.length > 0) {
      console.log(`  Aug ${String(dq.day).padStart(2)}: ${sessions.rows.length} sessions, hoursRevenue=${r2(hoursRev)}`);
    }
  }
  console.log(`\n  Sum of daily (manual): ${r2(dailySum)}`);

  // Direct query for the full month range
  const direct = await pool.query(`
    SELECT s.amount::numeric, s."paymentStatus", s."hourlyPriceOverride"::numeric,
      COALESCE((SELECT SUM(so.total) FROM "SnackOrder" so WHERE so."sessionId" = s.id), 0) as snacks_total
    FROM "Session" s
    WHERE s."checkIn" >= $1 AND s."checkIn" <= $2 AND s."checkOut" IS NOT NULL
  `, [monthFrom, monthTo]);

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
  console.log(`  Total sessions: ${direct.rows.length} (${direct.rows.filter(s => s.paymentStatus === 'paid').length} paid)`);
  console.log(`  Match: ${r2(dailySum) === directRev ? 'YES' : 'NO'}`);

  await pool.end();
}

run().catch(e => { console.error('FATAL:', e); pool.end(); });

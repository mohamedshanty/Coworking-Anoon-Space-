const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_NePRtc7ikfM0@ep-raspy-moon-aix4blmi-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

const r2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

// Palestine-local boundaries for the current week
// Aug 19 2026 = Wednesday. Saturday = Aug 15, Thursday = Aug 20
// Saturday 00:00 Asia/Hebron = Friday 21:00 UTC
// Thursday 23:59:59 Asia/Hebron = Thursday 20:59:59 UTC
const weekFrom = new Date('2026-08-14T21:00:00.000Z'); // Sat Aug 15 00:00 Palestine
const weekTo   = new Date('2026-08-20T20:59:59.000Z'); // Thu Aug 20 23:59:59 Palestine

async function run() {
  console.log('=== STEP 2: THREE INDEPENDENT CALCULATIONS ===');
  console.log('Week: Sat Aug 15 - Thu Aug 20 (Palestine time)\n');

  // ========================================
  // CALC A: Sum of daily hoursRevenue using getHistorySummary formula
  // ========================================
  console.log('--- (A) Sum of daily getHistorySummary hoursRevenue ---');
  const days = [
    { label: 'Sat Aug 15', from: '2026-08-14T21:00:00.000Z', to: '2026-08-15T20:59:59.000Z' },
    { label: 'Sun Aug 16', from: '2026-08-15T21:00:00.000Z', to: '2026-08-16T20:59:59.000Z' },
    { label: 'Mon Aug 17', from: '2026-08-16T21:00:00.000Z', to: '2026-08-17T20:59:59.000Z' },
    { label: 'Tue Aug 18', from: '2026-08-17T21:00:00.000Z', to: '2026-08-18T20:59:59.000Z' },
    { label: 'Wed Aug 19', from: '2026-08-18T21:00:00.000Z', to: '2026-08-19T20:59:59.000Z' },
    { label: 'Thu Aug 20', from: '2026-08-19T21:00:00.000Z', to: '2026-08-20T20:59:59.000Z' },
  ];

  let dailySumA = 0;
  for (const day of days) {
    const from = new Date(day.from);
    const to = new Date(day.to);

    const sessions = await pool.query(`
      SELECT s.id, s.amount::numeric, s."paymentStatus", s."hourlyPriceOverride"::numeric,
        COALESCE((SELECT SUM(so.total) FROM "SnackOrder" so WHERE so."sessionId" = s.id), 0) as snacks_total
      FROM "Session" s
      WHERE s."checkIn" >= $1 AND s."checkIn" <= $2 AND s."checkOut" IS NOT NULL
    `, [from, to]);

    // getHistorySummary formula: hourlyPriceOverride ?? (amount - snacksTotal), paid only
    const hoursRev = r2(sessions.rows
      .filter(s => s.paymentStatus === 'paid')
      .reduce((sum, s) => {
        const snacksTotal = Number(s.snacks_total);
        const hoursAmt = s.hourlyPriceOverride != null
          ? Number(s.hourlyPriceOverride)
          : Number(s.amount) - snacksTotal;
        return sum + hoursAmt;
      }, 0));

    dailySumA += hoursRev;
    console.log(`  ${day.label}: ${sessions.rows.length} sessions, hoursRevenue=${r2(hoursRev)}`);
  }
  console.log(`  TOTAL (A): ${r2(dailySumA)}\n`);

  // ========================================
  // CALC B: Direct weekly query using calculateRevenue's formula (with debt split)
  // ========================================
  console.log('--- (B) calculateRevenue() formula (weekly, with debt split) ---');

  // B1: Paid sessions hours portion
  const paidSessions = await pool.query(`
    SELECT s.amount::numeric, s."paymentStatus",
      COALESCE((SELECT SUM(so.total) FROM "SnackOrder" so WHERE so."sessionId" = s.id), 0) as snacks_total
    FROM "Session" s
    WHERE s."checkIn" >= $1 AND s."checkIn" <= $2 AND s."checkOut" IS NOT NULL
      AND s."paymentStatus" = 'paid'
  `, [weekFrom, weekTo]);

  const paidHoursRevenue = r2(paidSessions.rows.reduce((sum, s) => {
    return sum + (Number(s.amount) - Number(s.snacks_total));
  }, 0));
  console.log(`  Paid sessions hoursRevenue (no override check): ${paidHoursRevenue}`);
  console.log(`  Paid sessions count: ${paidSessions.rows.length}`);

  // B2: Collected debts in this week, split into hours/snacks
  const collectedDebts = await pool.query(`
    SELECT id, name, amount::numeric, type, "sessionId", "sessionAmount"::numeric, "collectedAt"
    FROM "Debt"
    WHERE status = 'collected' AND "collectedAt" >= $1 AND "collectedAt" <= $2
  `, [weekFrom, weekTo]);

  let debtHours = 0, debtSnacks = 0, debtManual = 0;
  for (const d of collectedDebts.rows) {
    const totalAmount = Number(d.amount);
    if (d.sessionId && d.sessionAmount != null) {
      const hoursPortion = Number(d.sessionAmount);
      debtHours += hoursPortion;
      debtSnacks += (totalAmount - hoursPortion);
    } else {
      debtManual += totalAmount;
    }
  }
  console.log(`  Collected debts: ${collectedDebts.rows.length}`);
  console.log(`    session debts hours: ${r2(debtHours)}`);
  console.log(`    session debts snacks: ${r2(debtSnacks)}`);
  console.log(`    manual/subscription: ${r2(debtManual)}`);

  const totalB = r2(paidHoursRevenue + debtHours);
  console.log(`  TOTAL (B) = paidHoursRevenue + debtHours = ${totalB}\n`);

  // ========================================
  // CALC C: What getHistorySummary() ACTUALLY returns for this week
  // ========================================
  console.log('--- (C) getHistorySummary() actual output (replicated in SQL) ---');
  // This is the exact code from getHistorySummary: sum paid sessions with hourlyPriceOverride check
  const allSessions = await pool.query(`
    SELECT s.id, s.amount::numeric, s."paymentStatus", s."hourlyPriceOverride"::numeric, s."sessionType",
      v.type as "visitorType", v.id as "visitorId",
      COALESCE((SELECT SUM(so.total) FROM "SnackOrder" so WHERE so."sessionId" = s.id), 0) as snacks_total
    FROM "Session" s
    JOIN "Visitor" v ON s."visitorId" = v.id
    WHERE s."checkIn" >= $1 AND s."checkIn" <= $2 AND s."checkOut" IS NOT NULL
  `, [weekFrom, weekTo]);

  // getHistorySummary formula (exact replica of lines 1616-1626)
  const hoursRevenueC = r2(allSessions.rows
    .filter(s => s.paymentStatus === 'paid')
    .reduce((sum, s) => {
      const snacksTotal = Number(s.snacks_total);
      const hoursAmt = s.hourlyPriceOverride != null
        ? Number(s.hourlyPriceOverride)
        : Number(s.amount) - snacksTotal;
      return sum + hoursAmt;
    }, 0));

  console.log(`  Total sessions: ${allSessions.rows.length}`);
  console.log(`  Paid sessions: ${allSessions.rows.filter(s => s.paymentStatus === 'paid').length}`);
  console.log(`  hoursRevenue (getHistorySummary): ${hoursRevenueC}`);

  // ========================================
  // DOUBLE-COUNT CHECK: sessions that are BOTH paid AND have a collected debt
  // ========================================
  console.log('\n--- DOUBLE-COUNT CHECK ---');
  const doubleCount = await pool.query(`
    SELECT d.id as "debtId", d.name, d.amount::numeric as "debtAmount",
      d."sessionId", d."sessionAmount"::numeric,
      s.amount::numeric as "sessionAmount", s."paymentStatus", s."checkIn"
    FROM "Debt" d
    JOIN "Session" s ON d."sessionId" = s.id
    WHERE d.status = 'collected'
      AND d."collectedAt" >= $1 AND d."collectedAt" <= $2
      AND s."paymentStatus" = 'paid'
  `, [weekFrom, weekTo]);

  console.log(`  Sessions that are BOTH paid AND have collected debt: ${doubleCount.rows.length}`);
  for (const dc of doubleCount.rows) {
    console.log(`    ${dc.name}: debt=${dc.debtAmount} (hours=${dc.sessionAmount}), session=${dc.sessionAmount}, status=${dc.paymentStatus}`);
  }

  // ========================================
  // Also check: what the frontend "week" tab actually sends
  // ========================================
  console.log('\n--- FRONTEND "week" tab range ---');
  // Frontend: from = now - 7 days, to = today
  // If today = Aug 19: from = Aug 12, to = Aug 19
  const frontendFrom = new Date('2026-08-11T21:00:00.000Z'); // Aug 12 00:00 Palestine
  const frontendTo   = new Date('2026-08-19T20:59:59.000Z'); // Aug 19 23:59:59 Palestine

  const frontendSessions = await pool.query(`
    SELECT s.id, s.amount::numeric, s."paymentStatus", s."hourlyPriceOverride"::numeric,
      COALESCE((SELECT SUM(so.total) FROM "SnackOrder" so WHERE so."sessionId" = s.id), 0) as snacks_total
    FROM "Session" s
    WHERE s."checkIn" >= $1 AND s."checkIn" <= $2 AND s."checkOut" IS NOT NULL
  `, [frontendFrom, frontendTo]);

  const frontendHoursRev = r2(frontendSessions.rows
    .filter(s => s.paymentStatus === 'paid')
    .reduce((sum, s) => {
      const snacksTotal = Number(s.snacks_total);
      const hoursAmt = s.hourlyPriceOverride != null
        ? Number(s.hourlyPriceOverride)
        : Number(s.amount) - snacksTotal;
      return sum + hoursAmt;
    }, 0));

  console.log(`  Frontend range: Aug 12 - Aug 19 (7 days)`);
  console.log(`  Sessions: ${frontendSessions.rows.length}`);
  console.log(`  hoursRevenue: ${frontendHoursRev}`);

  // Check frontend range for double-count too
  const frontendDoubleCount = await pool.query(`
    SELECT d.id, d.name, d.amount::numeric, d."sessionId",
      s."paymentStatus"
    FROM "Debt" d
    JOIN "Session" s ON d."sessionId" = s.id
    WHERE d.status = 'collected'
      AND d."collectedAt" >= $1 AND d."collectedAt" <= $2
      AND s."paymentStatus" = 'paid'
  `, [frontendFrom, frontendTo]);
  console.log(`  Double-counted in frontend range: ${frontendDoubleCount.rows.length}`);

  await pool.end();
}

run().catch(e => { console.error('FATAL:', e); pool.end(); });

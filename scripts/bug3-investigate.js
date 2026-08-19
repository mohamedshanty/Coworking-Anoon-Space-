const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_NePRtc7ikfM0@ep-raspy-moon-aix4blmi-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

const r2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

async function run() {
  // Check collected debts - are amounts zeroed out?
  console.log('=== COLLECTED DEBTS (sample) ===');
  const collected = await pool.query(
    `SELECT id, name, amount::numeric, type, status, "createdAt", "collectedAt", note
     FROM "Debt"
     WHERE status = 'collected'
     ORDER BY "collectedAt" DESC LIMIT 15`
  );
  for (const d of collected.rows) {
    console.log('  ', d.name, '| amt=', Number(d.amount).toFixed(2), '| type=', d.type, '| created=', d.createdAt, '| collected=', d.collectedAt);
  }

  // Check ALL debts amounts
  console.log('\n=== DEBT AMOUNT DISTRIBUTION ===');
  const amtDist = await pool.query(
    `SELECT status,
            COUNT(*) as cnt,
            SUM(CASE WHEN amount::numeric = 0 THEN 1 ELSE 0 END) as zero_amt,
            SUM(CASE WHEN amount::numeric > 0 THEN 1 ELSE 0 END) as positive_amt
     FROM "Debt"
     GROUP BY status`
  );
  for (const row of amtDist.rows) {
    console.log('  ', row.status, ': total=', row.cnt, '| zero_amount=', row.zero_amt, '| positive_amount=', row.positive_amt);
  }

  // Check how many collected debts have amount=0
  console.log('\n=== COLLECTED DEBTS WITH AMOUNT=0 ===');
  const zeroCollected = await pool.query(
    `SELECT COUNT(*) as cnt, SUM(amount::numeric) as total
     FROM "Debt" WHERE status = 'collected' AND amount::numeric = 0`
  );
  console.log('  count:', zeroCollected.rows[0].cnt, '| sum:', Number(zeroCollected.rows[0].total).toFixed(2));

  // Check collected debts with amount > 0
  const posCollected = await pool.query(
    `SELECT COUNT(*) as cnt, SUM(amount::numeric) as total
     FROM "Debt" WHERE status = 'collected' AND amount::numeric > 0`
  );
  console.log('  With amount > 0: count:', posCollected.rows[0].cnt, '| sum:', Number(posCollected.rows[0].total).toFixed(2));

  // Check the full_debt sessions - do they have debt records?
  console.log('\n=== FULL_DEBT SESSIONS WITHOUT DEBT RECORDS ===');
  const debtSessions = await pool.query(
    `SELECT s.id, s."visitorId", s.amount::numeric, s."checkIn", v.name,
            d.id as debt_id, d.amount::numeric as debt_amount, d.status as debt_status
     FROM "Session" s
     JOIN "Visitor" v ON s."visitorId" = v.id
     LEFT JOIN "Debt" d ON d."visitorId" = s."visitorId" AND d.type = 'session'
     WHERE s."paymentStatus" = 'full_debt'
     ORDER BY s."checkIn" DESC LIMIT 20`
  );
  let withDebt = 0, withoutDebt = 0;
  for (const s of debtSessions.rows) {
    const hasDebt = s.debt_id != null;
    if (hasDebt) withDebt++; else withoutDebt++;
    console.log('  ', s.name, '| sessionAmt=', Number(s.amount).toFixed(2), '| checkIn=', s.checkIn,
      '| hasDebt=', hasDebt ? 'YES(' + Number(s.debt_amount).toFixed(2) + ')' : 'NO');
  }
  console.log('  With debt record:', withDebt, '| Without debt record:', withoutDebt);

  // Check: was the session checked out as unpaid originally (has checkoutUnpaid debt)?
  // vs edited to full_debt after paid checkout
  console.log('\n=== SESSION CHECKOUT PATTERNS ===');
  // Sessions with full_debt that have calculatedPrice (meaning they went through checkout)
  const checkoutPattern = await pool.query(
    `SELECT s."paymentStatus",
            COUNT(*) as cnt,
            SUM(CASE WHEN s."calculatedPrice" IS NOT NULL AND s."calculatedPrice"::numeric > 0 THEN 1 ELSE 0 END) as has_calc_price,
            SUM(CASE WHEN s.amount::numeric = 0 AND s."calculatedPrice"::numeric > 0 THEN 1 ELSE 0 END) as zero_amt_with_calc
     FROM "Session" s
     WHERE s."checkOut" IS NOT NULL
     GROUP BY s."paymentStatus"`
  );
  for (const row of checkoutPattern.rows) {
    console.log('  ', row.paymentStatus, ': total=', row.cnt,
      '| hasCalcPrice=', row.has_calc_price,
      '| zeroAmtWithCalc=', row.zero_amt_with_calc);
  }

  // Check if any sessions were edited from paid to debt
  // A paid session that was edited to full_debt would have:
  //   - calculatedPrice set (from original checkout)
  //   - amount possibly recalculated
  //   - no corresponding debt record from checkoutUnpaid
  console.log('\n=== POSSIBLY EDITED: PAID->DEBT SESSIONS ===');
  const editedToDebt = await pool.query(
    `SELECT s.id, v.name, s.amount::numeric, s."calculatedPrice"::numeric,
            s."finalPrice"::numeric, s."paymentStatus", s."discountAmount"::numeric,
            s."hourlyPriceOverride"::numeric, s."checkIn"
     FROM "Session" s
     JOIN "Visitor" v ON s."visitorId" = v.id
     WHERE s."paymentStatus" = 'full_debt'
       AND s."checkOut" IS NOT NULL
       AND s."calculatedPrice" IS NOT NULL
       AND s."calculatedPrice"::numeric > 0
       AND s.amount::numeric = 0
     ORDER BY s."checkIn" DESC LIMIT 10`
  );
  for (const s of editedToDebt.rows) {
    console.log('  ', s.name, '| amount=', Number(s.amount).toFixed(2),
      '| calcPrice=', Number(s.calculatedPrice).toFixed(2),
      '| finalPrice=', Number(s.finalPrice).toFixed(2),
      '| checkIn=', s.checkIn);
  }
  console.log('  These sessions have calculatedPrice > 0 but amount = 0 and status = full_debt');
  console.log('  This suggests they were checked out as paid, then edited to full_debt, and amount was zeroed.');

  // What revenue does calculateRevenue give for collected debts?
  console.log('\n=== REVENUE FROM COLLECTED DEBTS ===');
  const revResult = await pool.query(
    `SELECT SUM(amount::numeric) as debt_revenue
     FROM "Debt"
     WHERE status = 'collected' AND "collectedAt" IS NOT NULL`
  );
  console.log('Total debtRevenue (current formula):', Number(revResult.rows[0].debt_revenue || 0).toFixed(2));
  console.log('(This is the sum of debt.amount WHERE status=collected - but amounts were zeroed on collection!)');

  await pool.end();
}

run().catch(e => { console.error('FATAL:', e); pool.end(); });

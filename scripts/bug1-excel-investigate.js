const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_NePRtc7ikfM0@ep-raspy-moon-aix4blmi-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

const r2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
const rn = (v) => Math.round(v); // Excel export rounds to INTEGER

async function run() {
  const targetDay = '2026-08-18';

  // Get all sessions for this day (same as Excel export - NO paymentStatus filter)
  const sessions = await pool.query(
    `SELECT s.id, s.amount::numeric, s."paymentStatus", s."sessionType",
            s."hourlyRate"::numeric, s."hourlyPriceOverride"::numeric,
            s."discountAmount"::numeric, s."checkIn", s."checkOut",
            v.name as visitor_name, v.type as visitor_type
     FROM "Session" s
     JOIN "Visitor" v ON s."visitorId" = v.id
     WHERE to_char(s."checkIn" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Hebron', 'YYYY-MM-DD') = $1
     ORDER BY s."checkIn" ASC`,
    [targetDay]
  );

  // Get snack orders
  const sessionIds = sessions.rows.map(s => s.id);
  let snackMap = {};
  if (sessionIds.length > 0) {
    const snR = await pool.query(
      `SELECT "sessionId", SUM(total)::numeric as st FROM "SnackOrder" WHERE "sessionId" = ANY($1) GROUP BY "sessionId"`,
      [sessionIds]
    );
    for (const so of snR.rows) snackMap[so.sessionId] = Number(so.st);
  }

  // Get settings
  const settings = await pool.query(`SELECT "hourlyRate"::numeric as rate, "fullDayPrice"::numeric as fdp FROM "Settings" WHERE id = 'default'`);
  const hourlyRate = Number(settings.rows[0].rate);
  const fullDayPrice = Number(settings.rows[0].fdp);
  console.log('Global settings: hourlyRate=', hourlyRate, 'fullDayPrice=', fullDayPrice);

  // Get active subscriptions
  const subs = await pool.query(
    `SELECT "visitorId" FROM "Subscription" WHERE status = 'active' AND "endDate" >= NOW()`
  );
  const activeSubIds = new Set(subs.rows.map(s => s.visitorId));

  console.log('\n=== EXCEL EXPORT (type=history) vs STORED VALUES ===');
  console.log('Excel uses Math.round() (integer) for hoursAmount column');
  console.log('getHistory uses r2() (2 decimals) for hoursAmount column');
  console.log('getHistorySummary uses raw (amount - snacks) for hoursRevenue\n');

  let excelHoursSum = 0;
  let inAppHoursSum = 0;
  let summaryHoursSum = 0;
  let paidCount = 0;

  for (const s of sessions.rows) {
    const snacksTotal = snackMap[s.id] || 0;
    const effectiveType = s.sessionType || s.visitor_type;
    const hasActiveSub = activeSubIds.has(s.visitorId);
    const isSub = effectiveType === 'subscriber' && hasActiveSub;
    const isPaid = s.paymentStatus === 'paid';

    // What the Excel export shows (type=history):
    //   hoursAmount = isSub ? "مشترك" : (hourlyPriceOverride != null ? rn(override) : rn(pricing.timeAmount))
    // We need to simulate pricing.timeAmount - it uses the session's hourly rate
    const sessionRate = s.hourlyRate != null ? Number(s.hourlyRate) : hourlyRate;

    // Simulate calculateSessionPricing
    const checkInMs = new Date(s.checkIn).getTime();
    const checkOutMs = s.checkOut ? new Date(s.checkOut).getTime() : Date.now();
    const hours = Math.max(0, (checkOutMs - checkInMs) / 3600000);
    const timeAmountRaw = isSub ? 0 : Math.min(hours * sessionRate, fullDayPrice);
    const timeAmount = r2(timeAmountRaw); // pricing.timeAmount

    // Excel export hoursAmount
    let excelHrsAmt;
    if (isSub) {
      excelHrsAmt = 'مشترك';
    } else if (s.hourlyPriceOverride != null) {
      excelHrsAmt = rn(Number(s.hourlyPriceOverride));
    } else {
      excelHrsAmt = rn(timeAmount); // Math.round() to INTEGER
    }

    // In-app table hoursAmount (getHistory)
    const inAppHrsAmt = isSub ? 0 :
      (s.hourlyPriceOverride != null ? r2(Number(s.hourlyPriceOverride)) : r2(Number(s.amount) - snacksTotal));

    // Summary hoursRevenue (getHistorySummary) - raw amount - snacks
    const summaryHrsAmt = r2(Number(s.amount) - snacksTotal);

    if (typeof excelHrsAmt === 'number' && isPaid) {
      paidCount++;
      excelHoursSum += excelHrsAmt;
      inAppHoursSum += inAppHrsAmt;
      summaryHoursSum += summaryHrsAmt;
    }

    const diff = typeof excelHrsAmt === 'number' ? excelHrsAmt - summaryHrsAmt : 0;
    if (Math.abs(diff) > 0.001 || !isPaid) {
      console.log(
        s.visitor_name.padEnd(18),
        effectiveType.padEnd(12),
        'amt=' + Number(s.amount).toFixed(2).padEnd(8),
        'snk=' + snacksTotal.toFixed(2).padEnd(8),
        'excel=' + (typeof excelHrsAmt === 'string' ? excelHrsAmt : excelHrsAmt.toFixed(2)).padEnd(8),
        'inApp=' + inAppHrsAmt.toFixed(2).padEnd(8),
        'summ=' + summaryHrsAmt.toFixed(2).padEnd(8),
        'status=' + s.paymentStatus.padEnd(10),
        'diff=' + diff.toFixed(2)
      );
    }
  }

  console.log('\n=== TOTALS (paid sessions only) ===');
  console.log('Excel export hoursAmount sum (integer-rounded):', excelHoursSum.toFixed(2));
  console.log('In-app table hoursAmount sum (2-decimal):      ', inAppHoursSum.toFixed(2));
  console.log('getHistorySummary hoursRevenue (raw):          ', summaryHoursSum.toFixed(2));
  console.log('');
  console.log('Excel - Summary diff:', (excelHoursSum - summaryHoursSum).toFixed(2));
  console.log('InApp - Summary diff:', (inAppHoursSum - summaryHoursSum).toFixed(2));

  // Now check the "reports" type export which has its own formula
  console.log('\n=== REPORTS TYPE EXPORT (Visits Summary sheet) ===');
  // This uses: totalRevenue = sum(amount - snacksTotal) for paid sessions
  const reportsRevenue = r2(
    sessions.rows
      .filter(s => s.paymentStatus === 'paid' && s.checkOut != null)
      .reduce((sum, s) => {
        const snacks = snackMap[s.id] || 0;
        return sum + (Number(s.amount) - snacks);
      }, 0)
  );
  console.log('Reports export hoursRevenue:', reportsRevenue.toFixed(2));
  console.log('This uses the SAME formula as getHistorySummary');

  // The daily email report also uses calculateRevenue()
  console.log('\n=== DAILY EMAIL REPORT (calculateRevenue) ===');
  const emailRevenue = r2(
    sessions.rows
      .filter(s => s.paymentStatus === 'paid' && s.checkOut != null)
      .reduce((sum, s) => {
        const snacks = snackMap[s.id] || 0;
        return sum + (Number(s.amount) - snacks);
      }, 0)
  );
  console.log('Email report hoursRevenue:', emailRevenue.toFixed(2));

  console.log('\n=== ROOT CAUSE ===');
  console.log('The Excel export (type=history) rounds hoursAmount to INTEGER via Math.round()');
  console.log('The in-app table and summary use 2-decimal precision');
  console.log('When the user manually sums the Excel export rows, they get a HIGHER number');
  console.log('because integer rounding (especially Math.round) tends to round UP');
  console.log('');
  console.log('Additionally, for sessions with hourlyPriceOverride + discount:');
  console.log('  Excel shows: hourlyPriceOverride (raw, no discount)');
  console.log('  Summary uses: amount - snacks (= hourlyPriceOverride - discount)');
  console.log('  This also makes the Excel sum higher than the summary');

  await pool.end();
}

run().catch(e => { console.error('FATAL:', e); pool.end(); });

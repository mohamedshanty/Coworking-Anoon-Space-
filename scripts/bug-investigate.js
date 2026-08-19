const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_NePRtc7ikfM0@ep-raspy-moon-aix4blmi-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

const r2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

// Convert UTC timestamp string to Palestine date string YYYY-MM-DD
function toPalestineDate(utcDate) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Hebron', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(utcDate);
}

async function run() {
  // Step 1: Find recent days with data (using correct timezone conversion)
  const r1 = await pool.query(
    `SELECT to_char("checkIn" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Hebron', 'YYYY-MM-DD') as day,
            COUNT(*) as cnt
     FROM "Session"
     WHERE "checkOut" IS NOT NULL
     GROUP BY day ORDER BY day DESC LIMIT 15`
  );
  console.log('=== RECENT DAYS WITH SESSIONS (Palestine time) ===');
  for (const row of r1.rows) {
    console.log('  ', row.day, ':', row.cnt, 'sessions');
  }

  if (r1.rows.length === 0) {
    console.log('No sessions found');
    await pool.end();
    return;
  }

  // Pick a day with enough sessions to see the bug
  let targetDay = r1.rows[1].day; // pick second day (likely has more sessions)
  for (const row of r1.rows) {
    if (parseInt(row.cnt) >= 10) { targetDay = row.day; break; }
  }
  console.log('\n=== INVESTIGATING DAY:', targetDay, '===');

  // Step 2: Get all sessions for this day using Palestine timezone
  const r2Result = await pool.query(
    `SELECT s.id, s."visitorId", s."checkIn", s."checkOut", s.amount::numeric, s."paymentStatus",
            s."hourlyRate"::numeric, s."hourlyPriceOverride"::numeric, s."discountAmount"::numeric,
            s."sessionType", s."calculatedPrice"::numeric, s."finalPrice"::numeric,
            v.name as visitor_name, v.type as visitor_type
     FROM "Session" s
     JOIN "Visitor" v ON s."visitorId" = v.id
     WHERE s."checkOut" IS NOT NULL
       AND to_char(s."checkIn" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Hebron', 'YYYY-MM-DD') = $1
     ORDER BY s."checkIn" ASC`,
    [targetDay]
  );

  console.log('Sessions found:', r2Result.rows.length);

  // Step 3: Get snack orders
  const sessionIds = r2Result.rows.map(s => s.id);
  let snackMap = {};
  if (sessionIds.length > 0) {
    const r3 = await pool.query(
      `SELECT "sessionId", SUM(total)::numeric as snacks_total
       FROM "SnackOrder"
       WHERE "sessionId" = ANY($1)
       GROUP BY "sessionId"`,
      [sessionIds]
    );
    for (const so of r3.rows) snackMap[so.sessionId] = Number(so.snacks_total);
  }

  // Step 4: Analyze each session
  let tableSum = 0;
  let summarySum = 0;
  let paidCount = 0;

  console.log('\n=== PER-SESSION BREAKDOWN (PAID ONLY) ===');
  for (const s of r2Result.rows) {
    const snacksTotal = snackMap[s.id] || 0;
    const effectiveType = s.sessionType || s.visitor_type;
    const hasOverride = s.hourlyPriceOverride != null;

    // Table formula (getHistory): hourlyPriceOverride ?? (amount - snacksTotal)
    const tableHrsAmt = hasOverride
      ? r2(Number(s.hourlyPriceOverride))
      : r2(Number(s.amount) - snacksTotal);

    // Summary formula (getHistorySummary): always (amount - snacksTotal)
    const summaryHrsAmt = r2(Number(s.amount) - snacksTotal);

    const isPaid = s.paymentStatus === 'paid';
    if (isPaid) {
      paidCount++;
      tableSum += tableHrsAmt;
      summarySum += summaryHrsAmt;
    }

    if (isPaid || true) { // show all for context
      console.log(
        (s.visitor_name || '?').padEnd(18),
        (effectiveType || '?').padEnd(12),
        'amt=' + Number(s.amount).toFixed(2).padEnd(8),
        'snk=' + snacksTotal.toFixed(2).padEnd(8),
        'tbl=' + tableHrsAmt.toFixed(2).padEnd(8),
        'sum=' + summaryHrsAmt.toFixed(2).padEnd(8),
        (s.paymentStatus || '').padEnd(12),
        'ovr=' + (hasOverride ? Number(s.hourlyPriceOverride).toFixed(2) : 'N/A')
      );
    }
  }

  console.log('\n=== BUG 1: HOURS REVENUE COMPARISON ===');
  console.log('Paid sessions:', paidCount);
  console.log('Sum of getHistory table hoursAmount: ', r2(tableSum).toFixed(2));
  console.log('getHistorySummary hoursRevenue:      ', r2(summarySum).toFixed(2));
  console.log('DIFFERENCE (table - summary):         ', r2(tableSum - summarySum).toFixed(2));

  // Step 5: Subscriber hours
  console.log('\n=== SUBSCRIBER HOURS ===');
  const subSessions = r2Result.rows.filter(s => {
    const t = s.sessionType || s.visitor_type;
    return t === 'subscriber' || t === 'trainee';
  });
  if (subSessions.length > 0) {
    const r4 = await pool.query(
      `SELECT id, "visitorId", "startDate", "endDate", "amountPaid"::numeric
       FROM "Subscription"
       WHERE "startDate" <= ($2::timestamp) AND "endDate" >= ($1::timestamp)`,
      [targetDay + 'T00:00:00Z', targetDay + 'T23:59:59Z']
    );
    const sameDayCount = {};
    for (const s of subSessions) {
      const key = s.visitorId + '_' + targetDay;
      sameDayCount[key] = (sameDayCount[key] || 0) + 1;
    }
    let subTotalRounded = 0;
    let subTotalExact = 0;
    for (const s of subSessions) {
      const sub = r4.rows.find(sub => sub.visitorId === s.visitorId);
      if (!sub) { console.log('  No sub for', s.visitor_name); continue; }
      const daysInSub = Math.max(1, Math.ceil(
        (new Date(sub.endDate).getTime() - new Date(sub.startDate).getTime()) / 86400000
      ));
      const dailyRate = Number(sub.amountPaid) / daysInSub;
      const key = s.visitorId + '_' + targetDay;
      const sessionsOnDay = sameDayCount[key] || 1;
      const perSessionRounded = r2(dailyRate / sessionsOnDay); // what the code does (per-session rounding)
      const perSessionExact = dailyRate / sessionsOnDay; // no per-session rounding
      subTotalRounded += perSessionRounded;
      subTotalExact += perSessionExact;
      console.log('  ', s.visitor_name,
        ': dailyRate=' + r2(dailyRate).toFixed(2),
        '/ sessionsOnDay=' + sessionsOnDay,
        '= rounded=' + perSessionRounded.toFixed(4),
        ' exact=' + perSessionExact.toFixed(4));
    }
    console.log('Subscriber hoursRevenue (per-session rounded):', r2(subTotalRounded).toFixed(2));
    console.log('Subscriber hoursRevenue (round once at end):  ', r2(subTotalExact).toFixed(2));
    console.log('Rounding drift:', r2(subTotalRounded - subTotalExact).toFixed(4));
  } else {
    console.log('No subscriber/trainee sessions on this day');
  }

  // Step 6: Weekly investigation
  console.log('\n=== BUG 2: WEEKLY INVESTIGATION ===');
  // Parse targetDay to get day of week
  const td = new Date(targetDay + 'T12:00:00Z');
  const dayOfWeek = td.getUTCDay();
  // Saturday = 6 in JS. We need the Saturday of this week.
  const satOffset = (dayOfWeek + 1) % 7; // days since Saturday
  const satDate = new Date(td);
  satDate.setUTCDate(satDate.getUTCDate() - satOffset);
  const thuDate = new Date(satDate);
  thuDate.setUTCDate(thuDate.getUTCDate() + 5);
  const satStr = satDate.toISOString().slice(0, 10);
  const thuStr = thuDate.toISOString().slice(0, 10);
  console.log('Week:', satStr, '(Sat) to', thuStr, '(Thu)');

  let weeklyDailySum = 0;
  const dayNames = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu'];
  for (let i = 0; i < 6; i++) {
    const d = new Date(satDate);
    d.setUTCDate(d.getUTCDate() + i);
    const dayStr = d.toISOString().slice(0, 10);
    const dayResult = await pool.query(
      `SELECT s.id, s.amount::numeric, s."paymentStatus"
       FROM "Session" s
       WHERE s."checkOut" IS NOT NULL
         AND to_char(s."checkIn" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Hebron', 'YYYY-MM-DD') = $1`,
      [dayStr]
    );
    const dayIds = dayResult.rows.map(s => s.id);
    let daySnackMap = {};
    if (dayIds.length > 0) {
      const snR = await pool.query(
        `SELECT "sessionId", SUM(total)::numeric as st FROM "SnackOrder" WHERE "sessionId" = ANY($1) GROUP BY "sessionId"`,
        [dayIds]
      );
      for (const so of snR.rows) daySnackMap[so.sessionId] = Number(so.st);
    }
    const dayRev = r2(
      dayResult.rows.filter(s => s.paymentStatus === 'paid').reduce((sum, s) => {
        return sum + (Number(s.amount) - (daySnackMap[s.id] || 0));
      }, 0)
    );
    const paidInDay = dayResult.rows.filter(s => s.paymentStatus === 'paid').length;
    console.log('  ', dayNames[i], dayStr, ':', dayResult.rows.length, 'sessions (' + paidInDay + ' paid), hoursRev=', dayRev.toFixed(2));
    weeklyDailySum += dayRev;
  }
  console.log('Sum of daily hoursRevenue:', r2(weeklyDailySum).toFixed(2));

  // Weekly single query using calculateRevenue formula
  // Need Palestine start/end for the week
  const weekFrom = satStr + 'T00:00:00Z'; // We'll filter in JS
  const weekTo = thuStr + 'T23:59:59.999Z';
  const weekResult = await pool.query(
    `SELECT s.id, s.amount::numeric, s."paymentStatus"
     FROM "Session" s
     WHERE s."checkOut" IS NOT NULL
       AND s."checkIn" >= ($1::timestamp)
       AND s."checkIn" <= ($2::timestamp)`,
    [weekFrom, weekTo]
  );

  // Filter to only sessions in the Palestine week range
  const weekIds = weekResult.rows.map(s => s.id);
  let weekSnackMap = {};
  if (weekIds.length > 0) {
    const snR = await pool.query(
      `SELECT "sessionId", SUM(total)::numeric as st FROM "SnackOrder" WHERE "sessionId" = ANY($1) GROUP BY "sessionId"`,
      [weekIds]
    );
    for (const so of snR.rows) weekSnackMap[so.sessionId] = Number(so.st);
  }
  const weeklyRev = r2(
    weekResult.rows.filter(s => s.paymentStatus === 'paid').reduce((sum, s) => {
      return sum + (Number(s.amount) - (weekSnackMap[s.id] || 0));
    }, 0)
  );
  console.log('Weekly single query hoursRevenue:', weeklyRev.toFixed(2));
  console.log('DIFFERENCE (sum daily - weekly):', r2(weeklyDailySum - weeklyRev).toFixed(2));

  // Check overlap
  const weekAllIds = new Set(weekResult.rows.map(s => s.id));
  const dailyAllIds = new Set();
  for (let i = 0; i < 6; i++) {
    const d = new Date(satDate);
    d.setUTCDate(d.getUTCDate() + i);
    const dayStr = d.toISOString().slice(0, 10);
    const dayResult = await pool.query(
      `SELECT s.id FROM "Session" s
       WHERE s."checkOut" IS NOT NULL
         AND to_char(s."checkIn" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Hebron', 'YYYY-MM-DD') = $1`,
      [dayStr]
    );
    for (const s of dayResult.rows) dailyAllIds.add(s.id);
  }
  console.log('Sessions in weekly query:', weekAllIds.size);
  console.log('Sessions in daily queries:', dailyAllIds.size);
  const inWeeklyNotDaily = [...weekAllIds].filter(id => !dailyAllIds.has(id));
  const inDailyNotWeekly = [...dailyAllIds].filter(id => !weekAllIds.has(id));
  console.log('In weekly but NOT in daily:', inWeeklyNotDaily.length);
  for (const id of inWeeklyNotDaily) {
    const s = await pool.query(`SELECT "checkIn", "paymentStatus", amount::numeric FROM "Session" WHERE id = $1`, [id]);
    const palestineDate = toPalestineDate(s.rows[0].checkIn);
    console.log('  ', id.slice(0, 8), 'checkIn=', s.rows[0].checkIn, 'palestineDate=', palestineDate, 'status=', s.rows[0].paymentStatus, 'amount=', Number(s.rows[0].amount).toFixed(2));
  }
  console.log('In daily but NOT in weekly:', inDailyNotWeekly.length);
  for (const id of inDailyNotWeekly) {
    const s = await pool.query(`SELECT "checkIn", "paymentStatus", amount::numeric FROM "Session" WHERE id = $1`, [id]);
    const palestineDate = toPalestineDate(s.rows[0].checkIn);
    console.log('  ', id.slice(0, 8), 'checkIn=', s.rows[0].checkIn, 'palestineDate=', palestineDate, 'status=', s.rows[0].paymentStatus, 'amount=', Number(s.rows[0].amount).toFixed(2));
  }

  // Bug 3: Debt check
  console.log('\n=== BUG 3: DEBT STATUS ===');
  const debtCheck = await pool.query(
    `SELECT status, COUNT(*) as cnt, COALESCE(SUM(amount::numeric), 0) as total FROM "Debt" GROUP BY status`
  );
  for (const row of debtCheck.rows) {
    console.log('  ', row.status, ':', row.cnt, 'debts, total:', Number(row.total).toFixed(2));
  }
  const statusCheck = await pool.query(
    `SELECT "paymentStatus", COUNT(*) as cnt FROM "Session" WHERE "checkOut" IS NOT NULL GROUP BY "paymentStatus"`
  );
  console.log('Session payment statuses:');
  for (const row of statusCheck.rows) {
    console.log('  ', row.paymentStatus, ':', row.cnt);
  }

  // Check for edited sessions (paid->debt scenario)
  const editedDebts = await pool.query(
    `SELECT s.id, s."paymentStatus", s.amount::numeric, v.name, d.id as debt_id, d.status as debt_status
     FROM "Session" s
     JOIN "Visitor" v ON s."visitorId" = v.id
     LEFT JOIN "Debt" d ON d."visitorId" = s."visitorId" AND d.type = 'session'
     WHERE s."paymentStatus" IN ('full_debt', 'partial_debt')
     ORDER BY s."checkIn" DESC LIMIT 10`
  );
  console.log('\nRecent debt sessions:');
  for (const row of editedDebts.rows) {
    console.log('  ', row.name, '| status=', row.paymentStatus, '| amount=', Number(row.amount).toFixed(2), '| debtId=', row.debt_id ? 'YES' : 'NO', '| debtStatus=', row.debt_status || 'N/A');
  }

  await pool.end();
}

run().catch(e => { console.error('FATAL:', e); pool.end(); });

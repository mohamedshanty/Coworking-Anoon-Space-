const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_NePRtc7ikfM0@ep-raspy-moon-aix4blmi-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  // Show all collected debts with their original amounts
  console.log('=== ALL COLLECTED DEBTS ===');
  const all = await pool.query(
    `SELECT id, name, amount::numeric, type, status, "createdAt", "collectedAt"
     FROM "Debt" WHERE status = 'collected' ORDER BY "collectedAt" ASC`
  );
  for (const d of all.rows) {
    console.log('  collected=', d.collectedAt, '| amt=', Number(d.amount).toFixed(2), '| type=', d.type, '| name=', d.name);
  }
  console.log('\nTotal collected debts:', all.rows.length);
  console.log('Debts with amount=0:', all.rows.filter(d => Number(d.amount) === 0).length);
  console.log('Debts with amount>0:', all.rows.filter(d => Number(d.amount) > 0).length);
  console.log('Total amount:', all.rows.reduce((s, d) => s + Number(d.amount), 0).toFixed(2));

  // Check: which days have collected debts and what would revenue be?
  console.log('\n=== REVENUE IMPACT OF COLLECTED DEBTS BY DAY ===');
  const byDay = await pool.query(
    `SELECT to_char("collectedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Hebron', 'YYYY-MM-DD') as day,
            COUNT(*) as cnt,
            SUM(amount::numeric) as total
     FROM "Debt"
     WHERE status = 'collected' AND "collectedAt" IS NOT NULL
     GROUP BY day ORDER BY day DESC`
  );
  for (const row of byDay.rows) {
    console.log('  ', row.day, ':', row.cnt, 'debts, amount=', Number(row.total).toFixed(2));
  }

  // Check if any sessions are paid but their amount includes subscriber hours
  // that should be separate
  console.log('\n=== SESSIONS WITH AMOUNT=0 AND PAID STATUS (subscriber time=0) ===');
  const zeroPaid = await pool.query(
    `SELECT COUNT(*) as cnt FROM "Session"
     WHERE "checkOut" IS NOT NULL AND "paymentStatus" = 'paid' AND amount::numeric = 0`
  );
  console.log('Count:', zeroPaid.rows[0].cnt);

  await pool.end();
}

run().catch(e => { console.error('FATAL:', e); pool.end(); });

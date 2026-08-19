const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_NePRtc7ikfM0@ep-raspy-moon-aix4blmi-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  // Try to find hints about original amounts from nearby records
  const debts = await pool.query(`
    SELECT id, name, phone, type, amount, "createdAt", "collectedAt", "visitorId"
    FROM "Debt"
    WHERE status = 'collected' AND amount = 0
    ORDER BY "collectedAt" ASC
  `);

  console.log('Investigating original amounts for 7 zeroed debts:\n');

  for (const debt of debts.rows) {
    console.log(`--- ${debt.name} (${debt.type}) ---`);
    console.log(`  createdAt: ${debt.createdAt}`);

    if (debt.visitorId) {
      // Check if visitor has other debts with amounts
      const otherDebts = await pool.query(`
        SELECT amount, type, status, "createdAt"
        FROM "Debt"
        WHERE "visitorId" = $1 AND id != $2
        ORDER BY "createdAt" DESC
        LIMIT 5
      `, [debt.visitorId, debt.id]);

      if (otherDebts.rows.length > 0) {
        console.log(`  Other debts for this visitor:`);
        for (const od of otherDebts.rows) {
          console.log(`    ${od.type}: ${od.amount} (${od.status}) at ${od.createdAt}`);
        }
      }

      // Check sessions around the same time
      const sessions = await pool.query(`
        SELECT amount, "paymentStatus", "checkIn"
        FROM "Session"
        WHERE "visitorId" = $1
          AND "checkIn" >= $2::timestamp - interval '7 days'
          AND "checkIn" <= $2::timestamp + interval '7 days'
        ORDER BY "checkIn"
      `, [debt.visitorId, debt.createdAt]);

      if (sessions.rows.length > 0) {
        console.log(`  Sessions within ±7 days:`);
        for (const s of sessions.rows) {
          console.log(`    ${s.amount} (${s.paymentStatus}) at ${s.checkIn}`);
        }
      }
    }
    console.log('');
  }

  await pool.end();
}

run().catch(e => { console.error('FATAL:', e); pool.end(); });

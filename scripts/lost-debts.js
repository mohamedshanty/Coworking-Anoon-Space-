const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_NePRtc7ikfM0@ep-raspy-moon-aix4blmi-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const zeroed = await pool.query(`
    SELECT id, name, phone, type, "createdAt", "collectedAt"
    FROM "Debt"
    WHERE status = 'collected' AND amount = 0
    ORDER BY "collectedAt" ASC
  `);

  console.log(`Total zeroed collected debts: ${zeroed.rows.length}`);
  console.log('\n7 debts with permanently lost amounts (manual/subscription, no session link):');

  let totalLost = 0;
  for (const debt of zeroed.rows) {
    if (debt.type !== 'session') {
      console.log(`  - ${debt.name} (${debt.type}): amount LOST, collected ${debt.collectedAt}`);
    }
  }

  console.log('\nNote: The original amounts of these 7 debts were zeroed during collection');
  console.log('and cannot be recovered from the database. They must be manually reconciled.');
  console.log('Total permanently lost from historical reports: UNKNOWN (amounts zeroed)');

  await pool.end();
}

run().catch(e => { console.error('FATAL:', e); pool.end(); });

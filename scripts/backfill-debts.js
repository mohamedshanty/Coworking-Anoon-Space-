const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_NePRtc7ikfM0@ep-raspy-moon-aix4blmi-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const zeroed = await pool.query(`
    SELECT id, "visitorId", name, phone, amount, type, status, "createdAt", "collectedAt"
    FROM "Debt"
    WHERE status = 'collected' AND amount = 0
    ORDER BY "collectedAt" ASC
  `);
  console.log(`Found ${zeroed.rows.length} zeroed collected debts`);

  if (zeroed.rows.length === 0) {
    await pool.end();
    return;
  }

  let updated = 0;
  for (const debt of zeroed.rows) {
    console.log(`\n--- Debt ${debt.id} (${debt.name}, type=${debt.type}) ---`);
    console.log(`  createdAt: ${debt.createdAt}, collectedAt: ${debt.collectedAt}`);

    if (debt.type === 'session' && debt.visitorId) {
      const session = await pool.query(`
        SELECT id, amount, "checkIn"
        FROM "Session"
        WHERE "visitorId" = $1
          AND "checkIn" >= $2::timestamp - interval '24 hours'
          AND "checkIn" <= $2::timestamp + interval '24 hours'
        ORDER BY ABS(EXTRACT(EPOCH FROM ("checkIn" - $2::timestamp)))
        LIMIT 1
      `, [debt.visitorId, debt.createdAt]);

      if (session.rows.length > 0) {
        const s = session.rows[0];
        const sessionAmount = Number(s.amount);

        // Get snack orders for this session from the SnackOrder table
        const snacks = await pool.query(`
          SELECT COALESCE(SUM(total), 0) as snacks_total
          FROM "SnackOrder"
          WHERE "sessionId" = $1
        `, [s.id]);

        const snacksTotal = Number(snacks.rows[0].snacks_total);
        const hoursPortion = Math.round((sessionAmount - snacksTotal + Number.EPSILON) * 100) / 100;

        await pool.query(`
          UPDATE "Debt"
          SET amount = $1::decimal, "sessionId" = $2, "sessionAmount" = $3::decimal
          WHERE id = $4
        `, [sessionAmount, s.id, hoursPortion, debt.id]);

        console.log(`  ✓ Matched session ${s.id}: amount=${sessionAmount}, hoursPortion=${hoursPortion}, snacks=${snacksTotal}`);
        updated++;
      } else {
        console.log(`  ✗ No matching session found — skipping`);
      }
    } else {
      console.log(`  ✗ Not a session debt or missing visitorId — skipping`);
    }
  }

  console.log(`\n=== Done: ${updated}/${zeroed.rows.length} debts backfilled ===`);
  await pool.end();
}

run().catch(e => { console.error('FATAL:', e); pool.end(); });

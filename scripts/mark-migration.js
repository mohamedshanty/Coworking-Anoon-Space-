const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_NePRtc7ikfM0@ep-raspy-moon-aix4blmi-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  // Check current migration state
  const res = await pool.query('SELECT * FROM "_prisma_migrations" ORDER BY finished_at DESC LIMIT 5');
  console.log('Recent migrations:');
  for (const row of res.rows) {
    console.log(' ', row.migration_name, row.finished_at ? '✓ applied' : '✗ pending');
  }

  // Check if our migration is already tracked
  const existing = await pool.query(
    'SELECT * FROM "_prisma_migrations" WHERE migration_name = $1',
    ['20260819000000_add_session_to_debt']
  );

  if (existing.rows.length === 0) {
    // Insert as already-applied
    await pool.query(`
      INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, rolled_back_at, started_at)
      VALUES (gen_random_uuid(), 'manual', NOW(), '20260819000000_add_session_to_debt', NULL, NOW())
    `);
    console.log('\n✓ Migration 20260819000000_add_session_to_debt marked as applied');
  } else {
    console.log('\nMigration already tracked');
  }

  // Verify
  const verify = await pool.query(
    'SELECT * FROM "_prisma_migrations" WHERE migration_name = $1',
    ['20260819000000_add_session_to_debt']
  );
  console.log('Verification:', verify.rows[0]);

  await pool.end();
}

run().catch(e => { console.error('FATAL:', e); pool.end(); });

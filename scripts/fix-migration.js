const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_NePRtc7ikfM0@ep-raspy-moon-aix4blmi-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  // Fix applied_steps_count
  await pool.query(`
    UPDATE "_prisma_migrations"
    SET applied_steps_count = 1
    WHERE migration_name = '20260819000000_add_session_to_debt'
  `);
  console.log('✓ Fixed applied_steps_count');

  // Show all migrations status
  const res = await pool.query('SELECT migration_name, finished_at IS NOT NULL as applied FROM "_prisma_migrations" ORDER BY started_at');
  console.log('\nAll migrations:');
  for (const row of res.rows) {
    console.log(' ', row.applied ? '✓' : '✗', row.migration_name);
  }

  await pool.end();
}

run().catch(e => { console.error('FATAL:', e); pool.end(); });

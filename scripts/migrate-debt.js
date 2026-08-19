const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_NePRtc7ikfM0@ep-raspy-moon-aix4blmi-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  // Add sessionId and sessionAmount columns to Debt table
  console.log('Adding sessionId column to Debt...');
  await pool.query(`ALTER TABLE "Debt" ADD COLUMN IF NOT EXISTS "sessionId" TEXT`);
  
  console.log('Adding sessionAmount column to Debt...');
  await pool.query(`ALTER TABLE "Debt" ADD COLUMN IF NOT EXISTS "sessionAmount" DECIMAL(10,2)`);
  
  // Verify columns exist
  const cols = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'Debt' 
    ORDER BY ordinal_position
  `);
  console.log('\nDebt table columns:');
  for (const col of cols.rows) {
    console.log('  ', col.column_name, ':', col.data_type);
  }
  
  await pool.end();
}

run().catch(e => { console.error('FATAL:', e); pool.end(); });

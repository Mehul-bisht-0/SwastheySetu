/** Reset only an explicitly selected test database, then install the frozen suite's fixtures. */
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { loadSeed } from '../infra/seed/load.ts';
const address = new URL(process.env.DATABASE_URL ?? '');
if (process.env.NODE_ENV !== 'test' || !address.pathname.endsWith('_test')) {
  throw new Error('Refusing to reset: NODE_ENV=test and a database name ending in _test are required.');
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  await pool.query('TRUNCATE sync_operations, facility_activity, household_visits, triage_reports');
  await loadSeed();
  // The immutable facilities/sync tests use this older demo account.
  await pool.query(`INSERT INTO users(phone,full_name,role,password_hash,district_code,is_active)
    VALUES ($1,$2,'ASHA',$3,$4,true) ON CONFLICT(phone) DO UPDATE SET password_hash=EXCLUDED.password_hash`,
    ['+919000000001', 'Test ASHA', await bcrypt.hash('demo-asha-password', 10), process.env.DEMO_DISTRICT_CODE ?? '227']);
  console.log('Isolated test fixtures ready.');
} finally { await pool.end(); }

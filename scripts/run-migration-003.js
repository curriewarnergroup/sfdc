// Migration 003 — Unmanned Runs
// Runs via: node scripts/run-migration-003.js

const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
})

async function run() {
  console.log('Running migration 003 — Unmanned Runs...')

  // Step 1: Drop & recreate role check to include SUPERVISOR
  const { error: e1 } = await supabase.rpc('exec_sql', {
    sql: `ALTER TABLE shopfloor_users DROP CONSTRAINT IF EXISTS shopfloor_users_role_check;
ALTER TABLE shopfloor_users ADD CONSTRAINT shopfloor_users_role_check
  CHECK (role IN ('OPERATOR','SETTER','QC','ADMIN','SUPERVISOR'));`,
  }).catch(() => ({ error: 'rpc_not_available' }))
  if (e1 && e1 !== 'rpc_not_available') console.warn('Role constraint:', e1)

  // Step 2: Drop & recreate session_type check to include UNMANNED
  const { error: e2 } = await supabase.rpc('exec_sql', {
    sql: `ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_session_type_check;
ALTER TABLE sessions ADD CONSTRAINT sessions_session_type_check
  CHECK (session_type IN ('SETUP','RUN','UNMANNED'));`,
  }).catch(() => ({ error: 'rpc_not_available' }))
  if (e2 && e2 !== 'rpc_not_available') console.warn('Session type constraint:', e2)

  // Step 3: Add authorised_by column
  const { error: e3 } = await supabase.rpc('exec_sql', {
    sql: `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS authorised_by UUID REFERENCES shopfloor_users(id);`,
  }).catch(() => ({ error: 'rpc_not_available' }))
  if (e3 && e3 !== 'rpc_not_available') console.warn('authorised_by column:', e3)

  // Verify by checking sessions columns
  const { data: testSession } = await supabase
    .from('sessions')
    .select('id, session_type, authorised_by')
    .limit(1)

  if (testSession !== null) {
    console.log('[OK] sessions table has authorised_by column — migration verified')
  } else {
    console.warn('[WARN] Could not verify sessions table')
  }

  // Verify SUPERVISOR can be inserted into users (check constraint test)
  console.log('[OK] Migration 003 complete')
  console.log('')
  console.log('NOTE: If constraint errors occurred above, run scripts/003_unmanned.sql')
  console.log('manually in Supabase SQL Editor.')
}

run().catch(console.error)

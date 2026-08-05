const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

// We use the Supabase REST API to run raw SQL via the pg connection
// by inserting into a function. Since exec_sql may not exist, we verify
// tables exist via select — and use the Supabase management API for DDL.
const fetch = globalThis.fetch || require('node-fetch')

async function runSQL(sql, description) {
  const pgUrl = supabaseUrl.replace('https://', 'https://') + '/rest/v1/rpc/exec_sql'

  // Try supabase rpc first
  const res = await fetch(pgUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': serviceRoleKey,
      'Authorization': `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ sql }),
  })

  if (!res.ok) {
    const text = await res.text()
    console.warn(`  [WARN] ${description}: ${text.slice(0, 120)}`)
    return false
  }
  console.log(`  [OK] ${description}`)
  return true
}

async function verifyTable(name) {
  const { data, error } = await supabase.from(name).select('id').limit(1)
  if (error && error.code !== 'PGRST116') {
    console.error(`  [FAIL] Table "${name}" not accessible: ${error.message}`)
    return false
  }
  console.log(`  [OK] Table "${name}" is accessible`)
  return true
}

async function run() {
  console.log('=== QC Migration ===\n')

  const statements = [
    [`ALTER TYPE session_event_type ADD VALUE IF NOT EXISTS 'QC_CHECK_SUBMITTED'`, 'Add QC_CHECK_SUBMITTED event type'],

    [`CREATE TABLE IF NOT EXISTS check_templates (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name            TEXT NOT NULL,
        description     TEXT,
        input_type      TEXT NOT NULL CHECK (input_type IN ('PASS_FAIL','NUMERIC','TEXT')),
        target_value    NUMERIC,
        tolerance_plus  NUMERIC,
        tolerance_minus NUMERIC,
        unit            TEXT,
        product_id      TEXT,
        is_active       BOOLEAN NOT NULL DEFAULT TRUE,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`, 'Create check_templates'],

    [`CREATE INDEX IF NOT EXISTS idx_check_templates_product ON check_templates(product_id)`, 'Index check_templates.product_id'],

    [`CREATE TABLE IF NOT EXISTS mo_check_assignments (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        mo_number         TEXT NOT NULL,
        product_id        TEXT,
        check_template_id UUID NOT NULL REFERENCES check_templates(id) ON DELETE CASCADE,
        order_index       INT NOT NULL DEFAULT 0,
        required          BOOLEAN NOT NULL DEFAULT TRUE,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (mo_number, check_template_id)
      )`, 'Create mo_check_assignments'],

    [`CREATE INDEX IF NOT EXISTS idx_mo_check_mo ON mo_check_assignments(mo_number)`, 'Index mo_check_assignments.mo_number'],
    [`CREATE INDEX IF NOT EXISTS idx_mo_check_product ON mo_check_assignments(product_id)`, 'Index mo_check_assignments.product_id'],

    [`CREATE TABLE IF NOT EXISTS check_results (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        mo_number         TEXT NOT NULL,
        product_id        TEXT,
        machine_id        UUID REFERENCES machines(id),
        session_id        UUID REFERENCES sessions(id) ON DELETE SET NULL,
        check_template_id UUID NOT NULL REFERENCES check_templates(id),
        result            TEXT CHECK (result IN ('PASS','FAIL')),
        numeric_value     NUMERIC,
        text_value        TEXT,
        checked_by        UUID REFERENCES shopfloor_users(id),
        checked_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        notes             TEXT
      )`, 'Create check_results'],

    [`CREATE INDEX IF NOT EXISTS idx_check_results_mo      ON check_results(mo_number)`, 'Index check_results.mo_number'],
    [`CREATE INDEX IF NOT EXISTS idx_check_results_session  ON check_results(session_id)`, 'Index check_results.session_id'],
    [`CREATE INDEX IF NOT EXISTS idx_check_results_template ON check_results(check_template_id)`, 'Index check_results.check_template_id'],
    [`CREATE INDEX IF NOT EXISTS idx_check_results_product  ON check_results(product_id)`, 'Index check_results.product_id'],
    [`CREATE INDEX IF NOT EXISTS idx_check_results_machine  ON check_results(machine_id)`, 'Index check_results.machine_id'],

    [`ALTER TABLE check_templates     ENABLE ROW LEVEL SECURITY`, 'RLS check_templates'],
    [`ALTER TABLE mo_check_assignments ENABLE ROW LEVEL SECURITY`, 'RLS mo_check_assignments'],
    [`ALTER TABLE check_results        ENABLE ROW LEVEL SECURITY`, 'RLS check_results'],

    [`DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='check_templates' AND policyname='svc_check_templates') THEN
         CREATE POLICY "svc_check_templates" ON check_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);
       END IF;
       IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='mo_check_assignments' AND policyname='svc_mo_check_assignments') THEN
         CREATE POLICY "svc_mo_check_assignments" ON mo_check_assignments FOR ALL TO authenticated USING (true) WITH CHECK (true);
       END IF;
       IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='check_results' AND policyname='svc_check_results') THEN
         CREATE POLICY "svc_check_results" ON check_results FOR ALL TO authenticated USING (true) WITH CHECK (true);
       END IF;
     END $$`, 'Create RLS policies'],
  ]

  for (const [sql, desc] of statements) {
    await runSQL(sql, desc)
  }

  console.log('\n=== Verifying tables ===\n')
  await verifyTable('check_templates')
  await verifyTable('mo_check_assignments')
  await verifyTable('check_results')

  console.log('\nDone.')
}

run().catch(console.error)

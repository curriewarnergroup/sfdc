import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const steps = [
  {
    name: 'Add QC_CHECK_SUBMITTED event type',
    sql: `ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'QC_CHECK_SUBMITTED';`
  },
  {
    name: 'Create check_templates table',
    sql: `
      CREATE TABLE IF NOT EXISTS check_templates (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name            TEXT NOT NULL,
        description     TEXT,
        input_type      TEXT NOT NULL CHECK (input_type IN ('PASS_FAIL', 'NUMERIC', 'TEXT')),
        target_value    NUMERIC,
        tolerance_plus  NUMERIC,
        tolerance_minus NUMERIC,
        unit            TEXT,
        product_id      TEXT,
        is_active       BOOLEAN NOT NULL DEFAULT TRUE,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `
  },
  {
    name: 'Create index on check_templates.product_id',
    sql: `CREATE INDEX IF NOT EXISTS idx_check_templates_product ON check_templates(product_id);`
  },
  {
    name: 'Create mo_check_assignments table',
    sql: `
      CREATE TABLE IF NOT EXISTS mo_check_assignments (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        mo_number           TEXT NOT NULL,
        product_id          TEXT,
        check_template_id   UUID NOT NULL REFERENCES check_templates(id) ON DELETE CASCADE,
        order_index         INT NOT NULL DEFAULT 0,
        required            BOOLEAN NOT NULL DEFAULT TRUE,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (mo_number, check_template_id)
      );
    `
  },
  {
    name: 'Create indexes on mo_check_assignments',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_mo_check_assignments_mo ON mo_check_assignments(mo_number);
      CREATE INDEX IF NOT EXISTS idx_mo_check_assignments_product ON mo_check_assignments(product_id);
    `
  },
  {
    name: 'Create check_results table',
    sql: `
      CREATE TABLE IF NOT EXISTS check_results (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        mo_number           TEXT NOT NULL,
        product_id          TEXT,
        machine_id          UUID REFERENCES machines(id),
        session_id          UUID REFERENCES sessions(id) ON DELETE SET NULL,
        check_template_id   UUID NOT NULL REFERENCES check_templates(id),
        result              TEXT CHECK (result IN ('PASS', 'FAIL')),
        numeric_value       NUMERIC,
        text_value          TEXT,
        checked_by          UUID REFERENCES shopfloor_users(id),
        checked_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        notes               TEXT
      );
    `
  },
  {
    name: 'Create indexes on check_results',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_check_results_mo ON check_results(mo_number);
      CREATE INDEX IF NOT EXISTS idx_check_results_session ON check_results(session_id);
      CREATE INDEX IF NOT EXISTS idx_check_results_template ON check_results(check_template_id);
      CREATE INDEX IF NOT EXISTS idx_check_results_product ON check_results(product_id);
      CREATE INDEX IF NOT EXISTS idx_check_results_machine ON check_results(machine_id);
    `
  },
  {
    name: 'Enable RLS on new tables',
    sql: `
      ALTER TABLE check_templates      ENABLE ROW LEVEL SECURITY;
      ALTER TABLE mo_check_assignments  ENABLE ROW LEVEL SECURITY;
      ALTER TABLE check_results         ENABLE ROW LEVEL SECURITY;
    `
  },
  {
    name: 'Create RLS policies',
    sql: `
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'check_templates' AND policyname = 'auth_check_templates_all') THEN
          CREATE POLICY "auth_check_templates_all" ON check_templates FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'mo_check_assignments' AND policyname = 'auth_mo_check_assignments_all') THEN
          CREATE POLICY "auth_mo_check_assignments_all" ON mo_check_assignments FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'check_results' AND policyname = 'auth_check_results_all') THEN
          CREATE POLICY "auth_check_results_all" ON check_results FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
        END IF;
      END $$;
    `
  },
]

async function run() {
  console.log('Running QC migration via Supabase RPC...\n')

  for (const step of steps) {
    try {
      const { error } = await supabase.rpc('exec_sql', { sql: step.sql })
      if (error) {
        // Try via REST pg endpoint as fallback
        console.warn(`  RPC failed for "${step.name}": ${error.message}`)
        console.warn('  (This step may have already been applied or requires superuser)')
      } else {
        console.log(`  [OK] ${step.name}`)
      }
    } catch (e) {
      console.warn(`  [SKIP] ${step.name}: ${e.message}`)
    }
  }

  console.log('\nMigration complete. Verifying tables exist...')

  const tables = ['check_templates', 'mo_check_assignments', 'check_results']
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('id').limit(1)
    if (error) {
      console.error(`  [FAIL] ${table}: ${error.message}`)
    } else {
      console.log(`  [OK] ${table} is accessible`)
    }
  }
}

run().catch(console.error)

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const statements = [
  `ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'SUPERVISOR'`,
  `ALTER TYPE session_type ADD VALUE IF NOT EXISTS 'UNMANNED'`,
  `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS authorised_by UUID REFERENCES shopfloor_users(id)`,
  `ALTER TABLE machines ADD COLUMN IF NOT EXISTS unmanned_threshold_minutes INT NOT NULL DEFAULT 60`,
]

for (const sql of statements) {
  console.log(`Running: ${sql}`)
  const { error } = await supabase.rpc('exec_sql', { sql })
  if (error) {
    // Try direct REST approach for DDL
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ sql }),
    })
    if (!res.ok) {
      console.log(`[note] RPC unavailable for: ${sql.slice(0, 60)}`)
      console.log('[note] Please run this manually in Supabase SQL Editor')
    } else {
      console.log(`[OK] ${sql.slice(0, 60)}`)
    }
  } else {
    console.log(`[OK] ${sql.slice(0, 60)}`)
  }
}

// Verify SUPERVISOR is now available by checking enum values
const { data, error: checkErr } = await supabase
  .from('shopfloor_users')
  .select('role')
  .limit(1)

if (!checkErr) {
  console.log('[OK] shopfloor_users table accessible')
}

// Try inserting a test to see if enum is updated
const { error: enumErr } = await supabase
  .from('shopfloor_users')
  .select('id')
  .eq('role', 'SUPERVISOR')
  .limit(1)

if (!enumErr) {
  console.log('[OK] SUPERVISOR enum value is live and queryable')
} else {
  console.log('[PENDING] SUPERVISOR enum not yet active:', enumErr.message)
  console.log('')
  console.log('=== Run this SQL in Supabase SQL Editor ===')
  console.log("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'SUPERVISOR';")
  console.log("ALTER TYPE session_type ADD VALUE IF NOT EXISTS 'UNMANNED';")
  console.log('ALTER TABLE sessions ADD COLUMN IF NOT EXISTS authorised_by UUID REFERENCES shopfloor_users(id);')
  console.log('ALTER TABLE machines ADD COLUMN IF NOT EXISTS unmanned_threshold_minutes INT NOT NULL DEFAULT 60;')
}

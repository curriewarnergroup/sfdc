// Uses Supabase Management API to run DDL via the pg/sql endpoint
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const projectRef = supabaseUrl.replace('https://', '').split('.')[0]

async function runSql(sql) {
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ sql }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`HTTP ${res.status}: ${body}`)
  }
  return res.json().catch(() => null)
}

// Fallback: use the Supabase Management API (requires a personal access token)
// Instead, wrap DDL in a stored proc call via pg_catalog
async function runDDL(stmt) {
  // Supabase allows DDL via the /sql endpoint with service role
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ query: stmt }),
  })
  const body = await res.text()
  return { status: res.status, body }
}

const STATEMENTS = [
  `ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'SUPERVISOR'`,
  `ALTER TYPE session_type ADD VALUE IF NOT EXISTS 'UNMANNED'`,
  `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS authorised_by UUID REFERENCES shopfloor_users(id)`,
  `ALTER TABLE machines ADD COLUMN IF NOT EXISTS unmanned_threshold_minutes INT NOT NULL DEFAULT 60`,
]

console.log(`Project ref: ${projectRef}`)
console.log(`Supabase URL: ${supabaseUrl}\n`)

for (const stmt of STATEMENTS) {
  const { status, body } = await runDDL(stmt)
  const preview = stmt.slice(0, 75)
  if (status === 200 || body.includes('already exists') || body.includes('already a member')) {
    console.log(`[OK]   ${preview}`)
  } else {
    console.log(`[${status}] ${preview}`)
    console.log(`       ${body.slice(0, 200)}`)
  }
}

// Verify via normal REST select
const verifyRes = await fetch(
  `${supabaseUrl}/rest/v1/shopfloor_users?select=role&limit=1`,
  { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
)
console.log(`\nVerify REST connection: ${verifyRes.status === 200 ? 'OK' : verifyRes.status}`)
console.log('Done.')

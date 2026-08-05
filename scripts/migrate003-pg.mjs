import pg from 'pg'

const { Client } = pg

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const projectRef = supabaseUrl.replace('https://', '').split('.')[0]
const host = `db.${projectRef}.supabase.co`
const password = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

// Supabase direct connection uses postgres user + service role key as password
const client = new Client({
  host,
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password,
  ssl: { rejectUnauthorized: false },
})

const STATEMENTS = [
  `ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'SUPERVISOR'`,
  `ALTER TYPE session_type ADD VALUE IF NOT EXISTS 'UNMANNED'`,
  `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS authorised_by UUID REFERENCES shopfloor_users(id)`,
  `ALTER TABLE machines ADD COLUMN IF NOT EXISTS unmanned_threshold_minutes INT NOT NULL DEFAULT 60`,
]

try {
  console.log(`Connecting to ${host}...`)
  await client.connect()
  console.log('Connected.\n')

  for (const stmt of STATEMENTS) {
    try {
      await client.query(stmt)
      console.log(`[OK]  ${stmt.slice(0, 80)}`)
    } catch (e) {
      if (e.message.includes('already exists') || e.message.includes('already a member')) {
        console.log(`[SKIP] ${stmt.slice(0, 80)}`)
      } else {
        console.log(`[ERROR] ${stmt.slice(0, 80)}\n        ${e.message}`)
      }
    }
  }

  // Verify
  const roles = await client.query(`SELECT unnest(enum_range(NULL::user_role))::text AS v`)
  console.log(`\nuser_role values:    ${roles.rows.map(r => r.v).join(', ')}`)

  const types = await client.query(`SELECT unnest(enum_range(NULL::session_type))::text AS v`)
  console.log(`session_type values: ${types.rows.map(r => r.v).join(', ')}`)

  const col = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name='sessions' AND column_name='authorised_by'`)
  console.log(`sessions.authorised_by exists: ${col.rows.length > 0}`)

  const col2 = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name='machines' AND column_name='unmanned_threshold_minutes'`)
  console.log(`machines.unmanned_threshold_minutes exists: ${col2.rows.length > 0}`)

  await client.end()
  console.log('\nMigration complete.')
} catch (e) {
  console.error('Fatal:', e.message)
  process.exit(1)
}

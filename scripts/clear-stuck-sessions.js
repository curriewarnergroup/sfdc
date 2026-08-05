// Lists all active/paused sessions so we can see what's stuck
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const res = await fetch(
  `${supabaseUrl}/rest/v1/sessions?select=id,status,session_type,mo_number,started_at,machine:machines(machine_code)&status=in.(ACTIVE,PAUSED)&order=started_at.desc`,
  {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  }
)

const sessions = await res.json()
console.log(`Found ${sessions.length} active/paused session(s):\n`)
for (const s of sessions) {
  console.log(`  ID: ${s.id}`)
  console.log(`  Machine: ${s.machine?.machine_code ?? 'unknown'}`)
  console.log(`  MO: ${s.mo_number}`)
  console.log(`  Status: ${s.status}`)
  console.log(`  Type: ${s.session_type}`)
  console.log(`  Started: ${s.started_at}`)
  console.log('')
}

// Auto-close any sessions older than 24 hours
const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
const stale = sessions.filter(s => s.started_at < cutoff)

if (stale.length > 0) {
  console.log(`Auto-closing ${stale.length} session(s) older than 24 hours...`)
  for (const s of stale) {
    const r = await fetch(`${supabaseUrl}/rest/v1/sessions?id=eq.${s.id}`, {
      method: 'PATCH',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ status: 'AUTO_CLOSED', ended_at: new Date().toISOString() }),
    })
    console.log(`  Closed ${s.id} (${s.machine?.machine_code} / ${s.mo_number}): ${r.status === 204 ? 'OK' : r.status}`)
  }
} else {
  console.log('No sessions older than 24h found. Closing ALL active sessions...')
  for (const s of sessions) {
    const r = await fetch(`${supabaseUrl}/rest/v1/sessions?id=eq.${s.id}`, {
      method: 'PATCH',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ status: 'AUTO_CLOSED', ended_at: new Date().toISOString() }),
    })
    console.log(`  Closed ${s.id} (${s.machine?.machine_code} / ${s.mo_number}): ${r.status === 204 ? 'OK' : r.status}`)
  }
}

console.log('\nDone — machine is now free.')

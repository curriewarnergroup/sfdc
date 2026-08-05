// Check what database-related env vars are available
for (const [k, v] of Object.entries(process.env)) {
  if (/supa|postgres|pg_|database|neon|db_/i.test(k)) {
    console.log(`${k} = ${v.slice(0, 60)}...`)
  }
}

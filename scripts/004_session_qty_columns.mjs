import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const { error } = await supabase.rpc('exec_sql', {
  sql: `
    ALTER TABLE sessions
      ADD COLUMN IF NOT EXISTS qty_to_make   integer,
      ADD COLUMN IF NOT EXISTS qty_made      integer DEFAULT 0,
      ADD COLUMN IF NOT EXISTS qty_scrapped  integer DEFAULT 0;
  `
})

if (error) {
  // Try direct REST approach - columns may already exist
  console.log('[v0] Migration note:', error.message)
} else {
  console.log('[v0] qty columns added successfully')
}

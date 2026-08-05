import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Server-only service role client — bypasses RLS.
 * Never expose to the client. Only use in Server Actions / Route Handlers.
 */
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}

'use server'

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Layout guard — every page under /qc (except /qc/login) requires a valid
 * QC session cookie. /qc/login lives in the same segment but bypasses the
 * guard via the (login) route group pattern; here we just check the cookie
 * and allow the page through — if userId is missing the page itself redirects
 * to /qc/login, so there's no circular loop because the login page doesn't
 * call this layout (it uses its own standalone layout via route group).
 *
 * Simplest approach: guard only if there's no valid session cookie.
 * Login page sets the cookie, so first visit → no cookie → redirect to login.
 */
export default async function QcLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const userId = cookieStore.get('qc_user_id')?.value

  if (!userId) {
    redirect('/qc/login')
  }

  const supabase = createServiceClient()
  const { data: user } = await supabase
    .from('shopfloor_users')
    .select('id, role, is_active')
    .eq('id', userId)
    .single()

  if (!user || !user.is_active || !['QC', 'ADMIN'].includes(user.role)) {
    redirect('/qc/login')
  }

  return <>{children}</>
}

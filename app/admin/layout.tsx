'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/admin/login')

  // Verify the auth UID is in admin_users and linked to an ADMIN-role shopfloor user
  const svc = createServiceClient()
  const { data: adminUser } = await svc
    .from('admin_users')
    .select('user_id, shopfloor_users(role, is_active)')
    .eq('auth_uid', user.id)
    .single()

  const shopfloorUser = (adminUser as any)?.shopfloor_users
  if (!adminUser || !shopfloorUser?.is_active || shopfloorUser?.role !== 'ADMIN') {
    redirect('/admin/login')
  }

  return <>{children}</>
}

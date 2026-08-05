import { getAdminUsers } from '@/lib/actions/admin'
import { AdminShell, PageHeader } from '../_components/AdminShell'
import { AdminsClient } from './AdminsClient'

export const dynamic = 'force-dynamic'

export default async function AdminAdminsPage() {
  const admins = await getAdminUsers()
  return (
    <AdminShell>
      <PageHeader
        title="Admins"
        subtitle="Manage who can sign in to the admin console"
      />
      <AdminsClient admins={admins as any} />
    </AdminShell>
  )
}

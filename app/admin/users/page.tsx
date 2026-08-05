import { getAllShopfloorUsers, getShiftPatterns } from '@/lib/actions/admin'
import { AdminShell, PageHeader } from '../_components/AdminShell'
import { UsersClient } from './UsersClient'

export const dynamic = 'force-dynamic'

export default async function AdminUsersPage() {
  const [users, shifts] = await Promise.all([
    getAllShopfloorUsers(),
    getShiftPatterns(),
  ])
  return (
    <AdminShell>
      <PageHeader
        title="Users"
        subtitle="Manage shopfloor operator accounts"
      />
      <UsersClient users={users as any} shifts={shifts as any} />
    </AdminShell>
  )
}

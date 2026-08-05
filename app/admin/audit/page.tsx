import { getAuditLog } from '@/lib/actions/admin'
import { AdminShell, PageHeader } from '../_components/AdminShell'
import { AuditClient } from './AuditClient'

export const dynamic = 'force-dynamic'

export default async function AdminAuditPage() {
  const log = await getAuditLog(500)
  return (
    <AdminShell>
      <PageHeader title="Audit Log" subtitle="Full record of all system events and admin changes" />
      <AuditClient log={log as any} />
    </AdminShell>
  )
}

import { getPauseReasonsAdmin } from '@/lib/actions/admin'
import { AdminShell, PageHeader } from '../_components/AdminShell'
import { PauseReasonsClient } from './PauseReasonsClient'

export const dynamic = 'force-dynamic'

export default async function AdminPauseReasonsPage() {
  const reasons = await getPauseReasonsAdmin()
  return (
    <AdminShell>
      <PageHeader title="Pause Reasons" subtitle="Configure operator pause reason codes" />
      <PauseReasonsClient reasons={reasons as any} />
    </AdminShell>
  )
}

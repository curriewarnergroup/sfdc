import { getAllSessions } from '@/lib/actions/admin'
import { getPauseReasons } from '@/lib/actions/sessions'
import { AdminShell, PageHeader } from '../_components/AdminShell'
import { SessionsClient } from './SessionsClient'

export const dynamic = 'force-dynamic'

export default async function AdminSessionsPage() {
  const [sessions, pauseReasons] = await Promise.all([
    getAllSessions({ limit: 200 }),
    getPauseReasons(),
  ])
  return (
    <AdminShell>
      <PageHeader title="Sessions" subtitle="All shopfloor time-capture records" />
      <SessionsClient sessions={sessions as any} pauseReasons={pauseReasons} />
    </AdminShell>
  )
}

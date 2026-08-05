import { getShiftPatterns } from '@/lib/actions/admin'
import { AdminShell, PageHeader } from '../_components/AdminShell'
import { ShiftsClient } from './ShiftsClient'

export const dynamic = 'force-dynamic'

export default async function AdminShiftsPage() {
  const shifts = await getShiftPatterns()
  return (
    <AdminShell>
      <PageHeader title="Shift Patterns" subtitle="Define work shift start and end times" />
      <ShiftsClient shifts={shifts as any} />
    </AdminShell>
  )
}

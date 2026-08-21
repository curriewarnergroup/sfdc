import { redirect } from 'next/navigation'
import { getDeviceFromCookie } from '@/lib/actions/device-auth'
import { createServiceClient } from '@/lib/supabase/service'
import { getMoCheckAssignments } from '@/lib/actions/admin'
import { KioskQcClient } from './KioskQcClient'
import { QcJobPicker } from './QcJobPicker'

export const dynamic = 'force-dynamic'

export default async function KioskQcPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>
}) {
  // Use the same auth pattern as the kiosk layout
  const device = await getDeviceFromCookie()
  if (!device) redirect('/kiosk/login')

  const { session: sessionParam } = await searchParams
  const supabase = createServiceClient()

  // All active/paused RUN sessions for this device. Multi-setup machines can
  // have several at once, so the operator must pick which MO the check is for.
  const { data: runSessions } = await supabase
    .from('sessions')
    .select('*, user:shopfloor_users!user_id(id, display_name)')
    .eq('device_id', device.id)
    .eq('session_type', 'RUN')
    .in('status', ['ACTIVE', 'PAUSED'])
    .order('started_at', { ascending: false })

  const sessions = runSessions ?? []
  if (sessions.length === 0) redirect('/kiosk')

  // Resolve which session to run the check against.
  const selected =
    (sessionParam && sessions.find(s => s.id === sessionParam)) ||
    (sessions.length === 1 ? sessions[0] : null)

  // More than one live run and none chosen yet → show the picker.
  if (!selected) {
    return <QcJobPicker sessions={sessions} />
  }

  // Load checks for the selected MO
  const assignments = await getMoCheckAssignments(selected.mo_number)

  return (
    <KioskQcClient
      device={device}
      session={selected}
      assignments={assignments}
    />
  )
}

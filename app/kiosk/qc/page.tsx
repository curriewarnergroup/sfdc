import { redirect } from 'next/navigation'
import { getDeviceFromCookie } from '@/lib/actions/device-auth'
import { createServiceClient } from '@/lib/supabase/service'
import { getMoCheckAssignments } from '@/lib/actions/admin'
import { KioskQcClient } from './KioskQcClient'

export const dynamic = 'force-dynamic'

export default async function KioskQcPage() {
  // Use the same auth pattern as the kiosk layout
  const device = await getDeviceFromCookie()
  if (!device) redirect('/kiosk/login')

  const supabase = createServiceClient()

  // Get the active or paused RUN session for this device
  const { data: session } = await supabase
    .from('sessions')
    .select('*, user:shopfloor_users!user_id(id, display_name)')
    .eq('device_id', device.id)
    .eq('session_type', 'RUN')
    .in('status', ['ACTIVE', 'PAUSED'])
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!session) redirect('/kiosk')

  // Load checks for this MO
  const assignments = await getMoCheckAssignments(session.mo_number)

  return (
    <KioskQcClient
      device={device}
      session={session}
      assignments={assignments}
    />
  )
}

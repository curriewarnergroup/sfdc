import { redirect } from 'next/navigation'
import { getDeviceFromCookie, logoutDevice } from '@/lib/actions/device-auth'
import { getAllActiveSessionsForDevice } from '@/lib/actions/sessions'
import { KioskLayout } from '@/components/kiosk/KioskLayout'
import { KioskHome } from './components/KioskHome'
import { ShiftOverrunWatcher } from './components/ShiftOverrunWatcher'

export const dynamic = 'force-dynamic'

export default async function KioskPage() {
  const device = await getDeviceFromCookie()
  if (!device) redirect('/kiosk/login')

  const sessions = await getAllActiveSessionsForDevice(device.id)

  async function handleLogout() {
    'use server'
    await logoutDevice()
    redirect('/kiosk/login')
  }

  return (
    <KioskLayout
      stationName={device.station_name}
      headerActions={
        <form action={handleLogout}>
          <button
            type="submit"
            className="px-3 py-1.5 rounded-lg bg-secondary text-muted-foreground text-xs font-semibold hover:bg-secondary/80 transition-colors"
          >
            Sign Out
          </button>
        </form>
      }
    >
      <KioskHome device={device} sessions={sessions} />
      <ShiftOverrunWatcher deviceId={device.id} />
    </KioskLayout>
  )
}

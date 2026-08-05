import { redirect } from 'next/navigation'
import { getDeviceFromCookie } from '@/lib/actions/device-auth'
import { getSetupSessionsForStation, getPauseReasons } from '@/lib/actions/sessions'
import { KioskLayout } from '@/components/kiosk/KioskLayout'
import { SetupManageClient } from './SetupManageClient'

export const dynamic = 'force-dynamic'

export default async function SetupManagePage() {
  const device = await getDeviceFromCookie()
  if (!device) redirect('/kiosk/login')

  // Default to this station only; client-side toggle will call the server action
  const [sessions, pauseReasons] = await Promise.all([
    getSetupSessionsForStation({ deviceId: device.id, allStations: false }),
    getPauseReasons(),
  ])

  return (
    <KioskLayout
      stationName={device.station_name}
      headerActions={
        <a
          href="/kiosk"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-secondary-foreground text-xs font-semibold hover:bg-secondary/80 transition-colors"
          aria-label="Back to home"
        >
          <svg
            className="w-3.5 h-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M19 12H5" />
            <path d="M12 19l-7-7 7-7" />
          </svg>
          Home
        </a>
      }
    >
      <SetupManageClient
        device={device}
        initialSessions={sessions}
        pauseReasons={pauseReasons}
      />
    </KioskLayout>
  )
}

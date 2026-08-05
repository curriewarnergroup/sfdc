import { redirect } from 'next/navigation'
import { getDeviceFromCookie } from '@/lib/actions/device-auth'

export default async function KioskLayout({ children }: { children: React.ReactNode }) {
  const device = await getDeviceFromCookie()
  if (!device) redirect('/kiosk/login')
  return <>{children}</>
}

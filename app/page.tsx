import { redirect } from 'next/navigation'
import { getDeviceFromCookie } from '@/lib/actions/device-auth'

export default async function RootPage() {
  const device = await getDeviceFromCookie()
  if (device) {
    redirect('/kiosk')
  }
  redirect('/kiosk/login')
}

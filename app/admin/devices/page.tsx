import { getAllDevices, getAllMachines } from '@/lib/actions/admin'
import { AdminShell, PageHeader } from '../_components/AdminShell'
import { DevicesClient } from './DevicesClient'

export const dynamic = 'force-dynamic'

export default async function AdminDevicesPage() {
  const [devices, machines] = await Promise.all([getAllDevices(), getAllMachines()])
  return (
    <AdminShell>
      <PageHeader
        title="Devices"
        subtitle="Manage kiosk tablets, PINs, and assigned machines"
      />
      <DevicesClient devices={devices} machines={machines} />
    </AdminShell>
  )
}

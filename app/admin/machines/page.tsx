import { getAllMachines } from '@/lib/actions/admin'
import { AdminShell, PageHeader } from '../_components/AdminShell'
import { MachinesClient } from './MachinesClient'

export const dynamic = 'force-dynamic'

export default async function AdminMachinesPage() {
  const machines = await getAllMachines()
  return (
    <AdminShell>
      <PageHeader title="Machines" subtitle="Register and manage production assets" />
      <MachinesClient machines={machines as any} />
    </AdminShell>
  )
}

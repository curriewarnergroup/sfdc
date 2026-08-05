import { getAllMachines } from '@/lib/actions/admin'
import { getQcHistory, getQcSessionUser } from '@/lib/actions/qc'
import { QcConsoleClient } from './components/QcConsoleClient'

export const dynamic = 'force-dynamic'

export default async function QcPage() {
  const [machines, history, qcUser] = await Promise.all([
    getAllMachines(),
    getQcHistory({ limit: 50 }),
    getQcSessionUser(),
  ])

  return <QcConsoleClient machines={machines} history={history} qcUser={qcUser!} />
}

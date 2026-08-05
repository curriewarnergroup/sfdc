import { getCheckTemplates, getCheckResults, getAllMoAssignments } from '@/lib/actions/admin'
import { QcAdminClient } from './QcAdminClient'

export const dynamic = 'force-dynamic'

export default async function QcAdminPage() {
  const [templates, results, moList] = await Promise.all([
    getCheckTemplates(),
    getCheckResults({}),
    getAllMoAssignments(),
  ])

  return <QcAdminClient templates={templates} results={results} moList={moList} />
}

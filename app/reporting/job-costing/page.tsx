import { getJobCostRows, getJobCostingExceptions } from '@/lib/actions/job-costing'
import { ReportingShell } from '../_components/ReportingShell'
import { PageHeader } from '../../admin/_components/AdminShell'
import { JobCostingClient } from './JobCostingClient'

export const dynamic = 'force-dynamic'

export default async function JobCostingPage() {
  const [rows, exceptions] = await Promise.all([getJobCostRows(), getJobCostingExceptions()])
  return (
    <ReportingShell>
      <PageHeader title="Job Costing" subtitle="Quote vs. actual profitability for jobs in progress" />
      <JobCostingClient rows={rows} exceptions={exceptions} />
    </ReportingShell>
  )
}

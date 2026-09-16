import { notFound } from 'next/navigation'
import { getJobCostDetail, getPartHistory } from '@/lib/actions/job-costing'
import { ReportingShell } from '../../_components/ReportingShell'
import { PageHeader } from '../../../admin/_components/AdminShell'
import { JobCostDetailClient } from './JobCostDetailClient'

export const dynamic = 'force-dynamic'

export default async function JobCostDetailPage({ params }: { params: Promise<{ mo: string }> }) {
  const { mo } = await params
  const detail = await getJobCostDetail(mo)
  if (!detail) notFound()

  const partHistory = await getPartHistory(detail.quote.part_no, detail.quote.mo_number)

  return (
    <ReportingShell>
      <PageHeader
        title={`MO ${detail.quote.mo_number}`}
        subtitle={`Part ${detail.quote.part_no} — quote vs. actual breakdown`}
      />
      <JobCostDetailClient detail={detail as any} partHistory={partHistory as any} />
    </ReportingShell>
  )
}

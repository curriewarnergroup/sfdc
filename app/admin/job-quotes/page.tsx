import { getJobQuotes, getImportHistory } from '@/lib/actions/job-costing'
import { AdminShell, PageHeader } from '../_components/AdminShell'
import { JobQuotesClient } from './JobQuotesClient'

export const dynamic = 'force-dynamic'

export default async function AdminJobQuotesPage() {
  const [quotes, imports] = await Promise.all([getJobQuotes(), getImportHistory()])
  return (
    <AdminShell>
      <PageHeader title="Job Quotes" subtitle="Import Excel quote standards and manage MO records" />
      <JobQuotesClient quotes={quotes as any} imports={imports as any} />
    </AdminShell>
  )
}

import { getPassOffReport } from '@/lib/actions/reporting'
import { ReportingShell } from '../_components/ReportingShell'
import { PassOffClient } from './PassOffClient'

export const dynamic = 'force-dynamic'

type PageProps = {
  searchParams: Promise<{
    from?: string
    to?: string
    mo?: string
    machineId?: string
    submittedBy?: string
    passedBy?: string
    result?: string
  }>
}

function durationStr(mins: number | null) {
  if (mins == null) return '—'
  if (mins >= 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`
  return `${mins}m`
}

export default async function PassOffReportPage({ searchParams }: PageProps) {
  const filters = await searchParams
  const { rows, machines, users } = await getPassOffReport(filters)

  const timed = rows.filter(r => r.wait_mins != null)
  const avgWait = timed.length
    ? Math.round(timed.reduce((s, r) => s + (r.wait_mins ?? 0), 0) / timed.length)
    : null
  const longest = timed.length ? Math.max(...timed.map(r => r.wait_mins ?? 0)) : null
  const passes = rows.filter(r => r.result === 'PASS').length
  const passRate = rows.length ? Math.round((passes / rows.length) * 100) : null

  const activeFilters = [
    filters.from        && `From: ${filters.from}`,
    filters.to          && `To: ${filters.to}`,
    filters.mo          && `MO: ${filters.mo}`,
    filters.machineId   && `Machine: ${machines.find(m => m.id === filters.machineId)?.machine_code ?? filters.machineId}`,
    filters.submittedBy && `Submitted by: ${users.find(u => u.id === filters.submittedBy)?.display_name ?? filters.submittedBy}`,
    filters.passedBy    && `Passed by: ${users.find(u => u.id === filters.passedBy)?.display_name ?? filters.passedBy}`,
    filters.result      && `Result: ${filters.result}`,
  ].filter(Boolean)

  return (
    <ReportingShell>
      {/* Screen header */}
      <div className="px-8 py-6 border-b border-border print:hidden">
        <h1 className="text-xl font-bold text-foreground tracking-tight">Pass-Off Times</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          How long each job waited in first off — from submission through to QC decision and code redemption
        </p>
      </div>

      {/* Print header */}
      <div className="hidden print:block px-8 py-6 border-b border-gray-300">
        <h1 className="text-2xl font-bold text-black">First-Off Pass-Off Times</h1>
        {activeFilters.length > 0 && (
          <p className="text-xs text-gray-500 mt-1">Filters: {activeFilters.join(' · ')}</p>
        )}
        <p className="text-xs text-gray-400 mt-1">Printed: {new Date().toLocaleString('en-GB')}</p>
      </div>

      {/* Summary stats */}
      <div className="px-8 pt-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-card rounded-xl border border-border p-5 print:border-gray-300">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Submissions</p>
            <p className="text-3xl font-bold text-foreground mt-1">{rows.length}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-5 print:border-gray-300">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Avg Time to Pass Off</p>
            <p className="text-3xl font-bold text-foreground mt-1">{durationStr(avgWait)}</p>
            <p className="text-xs text-muted-foreground mt-1">Submission → QC decision</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-5 print:border-gray-300">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Longest Wait</p>
            <p className="text-3xl font-bold text-status-paused mt-1">{durationStr(longest)}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-5 print:border-gray-300">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Pass Rate</p>
            <p className="text-3xl font-bold text-status-running mt-1">
              {passRate != null ? `${passRate}%` : '—'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{passes} of {rows.length} passed</p>
          </div>
        </div>
      </div>

      <PassOffClient
        rows={rows}
        machines={machines}
        users={users}
        initialFilters={filters}
      />
    </ReportingShell>
  )
}

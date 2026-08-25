import { getJobTimesReport } from '@/lib/actions/reporting'
import { ReportingShell } from '../_components/ReportingShell'
import { JobTimesClient } from './JobTimesClient'

export const dynamic = 'force-dynamic'

function fmtHours(mins: number) {
  return (mins / 60).toFixed(1)
}

export default async function JobTimesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; mo?: string; machineId?: string }>
}) {
  const sp = await searchParams
  const { rows, machines, cycleTableReady } = await getJobTimesReport(sp)

  const totalSetup = rows.reduce((s, r) => s + r.setup_net_mins, 0)
  const totalRun = rows.reduce((s, r) => s + r.run_net_mins, 0)
  const withStandard = rows.filter(r => r.efficiency_pct != null)
  const avgEff = withStandard.length
    ? Math.round(withStandard.reduce((s, r) => s + (r.efficiency_pct ?? 0), 0) / withStandard.length)
    : null

  return (
    <ReportingShell>
      <div className="px-8 py-6 border-b border-border">
        <h1 className="text-xl font-bold text-foreground tracking-tight">Job Times &amp; Efficiency</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Setup and run time per job. Enter a standard cycle time and quantity to see efficiency against the
          time the job should have taken.
        </p>
      </div>

      <div className="p-8 space-y-6">
        {!cycleTableReady && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-5 py-4">
            <p className="text-sm font-semibold text-amber-400">Cycle times not enabled yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Run <code className="font-mono text-xs text-foreground">scripts/007_mo_cycle_times.sql</code> in
              the Supabase SQL editor to start recording standard cycle times. Setup and run times below work
              without it.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-card rounded-xl border border-border p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Jobs</p>
            <p className="text-3xl font-bold text-foreground mt-1">{rows.length}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Setup Time</p>
            <p className="text-3xl font-bold text-foreground mt-1">{fmtHours(totalSetup)}h</p>
            <p className="text-xs text-muted-foreground mt-1">Pauses excluded</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Run Time</p>
            <p className="text-3xl font-bold text-status-running mt-1">{fmtHours(totalRun)}h</p>
            <p className="text-xs text-muted-foreground mt-1">Pauses excluded</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Avg Efficiency</p>
            <p className="text-3xl font-bold text-foreground mt-1">
              {avgEff != null ? `${avgEff}%` : '—'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {withStandard.length} of {rows.length} jobs with a standard
            </p>
          </div>
        </div>

        <JobTimesClient rows={rows} machines={machines} filters={sp} />
      </div>
    </ReportingShell>
  )
}

import { getSetupTimeReport } from '@/lib/actions/reporting'
import { ReportingShell } from '../_components/ReportingShell'
import { SetupTimeGrid } from '../_components/SetupTimeGrid'
import { AutoRefresh } from '../_components/AutoRefresh'

export const dynamic = 'force-dynamic'

function fmtHours(mins: number) {
  return (mins / 60).toFixed(1)
}

export default async function SetupTimeReportPage() {
  const { rows, idleCount } = await getSetupTimeReport()

  const inSetupNow = rows.filter(m => m.in_setup).length
  const totalSetupMinutes = rows.reduce((s, m) => s + m.total_setup_minutes, 0)
  const totalWorkingMinutes = rows.reduce((s, m) => s + m.net_setup_minutes, 0)
  const totalPausedMinutes = rows.reduce((s, m) => s + m.paused_setup_minutes, 0)

  return (
    <ReportingShell>
      <AutoRefresh intervalMs={30000} />
      <div className="px-8 py-6 border-b border-border flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">Setup Time</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Setup time for the job (MO) currently on each machine
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
          <span className="text-muted-foreground">{inSetupNow} in setup</span>
        </div>
      </div>

      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-card rounded-xl border border-border p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">In Setup Now</p>
            <p className="text-3xl font-bold text-foreground mt-1">{inSetupNow}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Total Time</p>
            <p className="text-3xl font-bold text-foreground mt-1">{fmtHours(totalSetupMinutes)}h</p>
            <p className="text-xs text-muted-foreground mt-1">Since setup began, incl. pauses</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Working Time</p>
            <p className="text-3xl font-bold text-status-running mt-1">{fmtHours(totalWorkingMinutes)}h</p>
            <p className="text-xs text-muted-foreground mt-1">Pauses excluded</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Paused Time</p>
            <p className="text-3xl font-bold text-status-paused mt-1">{fmtHours(totalPausedMinutes)}h</p>
          </div>
        </div>

        <SetupTimeGrid machines={rows} />

        {idleCount > 0 && (
          <p className="text-xs text-muted-foreground">
            {idleCount} idle {idleCount === 1 ? 'machine has' : 'machines have'} no current job and {idleCount === 1 ? 'is' : 'are'} not shown.
          </p>
        )}
      </div>
    </ReportingShell>
  )
}

import { getSetupTimeReport } from '@/lib/actions/reporting'
import { ReportingShell } from '../_components/ReportingShell'
import { SetupTimeGrid } from '../_components/SetupTimeGrid'
import { AutoRefresh } from '../_components/AutoRefresh'

export const dynamic = 'force-dynamic'

function fmtHours(mins: number) {
  return (mins / 60).toFixed(1)
}

export default async function SetupTimeReportPage() {
  const machines = await getSetupTimeReport()

  const inSetupNow = machines.filter(m => m.in_setup).length
  const totalSetupMinutes = machines.reduce((s, m) => s + m.total_setup_minutes, 0)
  const totalWorkingMinutes = machines.reduce((s, m) => s + m.net_setup_minutes, 0)
  const totalPausedMinutes = machines.reduce((s, m) => s + m.paused_setup_minutes, 0)
  const totalSetups = machines.reduce((s, m) => s + m.setup_count, 0)

  return (
    <ReportingShell>
      <AutoRefresh intervalMs={30000} />
      <div className="px-8 py-6 border-b border-border flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">Setup Time</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Setup time per machine and who&apos;s in setup right now — click a machine to drill into its actions
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
          <span className="text-muted-foreground">{inSetupNow} in setup</span>
        </div>
      </div>

      <div className="p-8 space-y-6">
        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <div className="bg-card rounded-xl border border-border p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">In Setup Now</p>
            <p className="text-3xl font-bold text-foreground mt-1">{inSetupNow}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Total Time</p>
            <p className="text-3xl font-bold text-foreground mt-1">{fmtHours(totalSetupMinutes)}h</p>
            <p className="text-xs text-muted-foreground mt-1">Elapsed incl. pauses</p>
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
          <div className="bg-card rounded-xl border border-border p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Total Setups</p>
            <p className="text-3xl font-bold text-foreground mt-1">{totalSetups}</p>
          </div>
        </div>

        {/* Grid */}
        <SetupTimeGrid machines={machines} />
      </div>
    </ReportingShell>
  )
}

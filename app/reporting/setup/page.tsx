import { getSetupTimeReport } from '@/lib/actions/reporting'
import { ReportingShell } from '../_components/ReportingShell'
import { SetupTimeGrid } from '../_components/SetupTimeGrid'
import { AutoRefresh } from '../_components/AutoRefresh'
import { DateRangePicker } from '../_components/DateRangePicker'
import { ExportCsvButton } from '../_components/ExportCsvButton'
import { resolveRange, rangeSuffix, londonToday } from '@/lib/reporting/range'

export const dynamic = 'force-dynamic'

type PageProps = {
  searchParams: Promise<{ from?: string; to?: string; preset?: string }>
}

function fmtHours(mins: number) {
  return (mins / 60).toFixed(1)
}

export default async function SetupTimeReportPage({ searchParams }: PageProps) {
  const range = resolveRange(await searchParams)
  const machines = await getSetupTimeReport(range)
  // Stamped after the query so the client knows how long these totals have
  // been sitting still, and can keep any in-progress setup ticking.
  const dataAsOf = new Date().toISOString()

  const inSetupNow = machines.filter(m => m.in_setup).length
  const totalSetupMinutes = machines.reduce((s, m) => s + m.total_setup_minutes, 0)
  const totalWorkingMinutes = machines.reduce((s, m) => s + m.net_setup_minutes, 0)
  const totalPausedMinutes = machines.reduce((s, m) => s + m.paused_setup_minutes, 0)
  const totalSetups = machines.reduce((s, m) => s + m.setup_count, 0)
  const totalAbandoned = machines.reduce((s, m) => s + m.abandoned_count, 0)
  const avgSetup = totalSetups > 0 ? totalWorkingMinutes / totalSetups : 0

  // Auto-refresh only makes sense when the window includes today.
  const includesToday = range.to >= londonToday()

  return (
    <ReportingShell>
      {includesToday && <AutoRefresh intervalMs={30000} />}

      <div className="px-8 py-6 border-b border-border space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">Setup Time</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Setup time per machine for <span className="text-foreground font-medium">{range.label}</span> — click a machine
              to drill into its actions. Abandoned setups are excluded from the totals and counted separately.
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm shrink-0 print:hidden">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            <span className="text-muted-foreground">{inSetupNow} in setup now</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <DateRangePicker range={range} />
          <ExportCsvButton
            rows={machines as any}
            columns={[
              { key: 'machine_code', header: 'Machine' },
              { key: 'description', header: 'Description' },
              { key: 'setup_count', header: 'Setups' },
              { key: 'abandoned_count', header: 'Abandoned' },
              { key: 'net_setup_minutes', header: 'Working Minutes' },
              { key: 'paused_setup_minutes', header: 'Paused Minutes' },
              { key: 'total_setup_minutes', header: 'Total Minutes' },
              { key: 'avg_setup_minutes', header: 'Avg Setup Minutes' },
              { key: 'last_setup', header: 'Last Setup' },
            ]}
            filename={`setup-time_${rangeSuffix(range)}`}
          />
        </div>
      </div>

      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="bg-card rounded-xl border border-border p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">In Setup Now</p>
            <p className="text-3xl font-bold text-foreground mt-1">{inSetupNow}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Total Time</p>
            <p className="text-3xl font-bold text-foreground mt-1">{fmtHours(totalSetupMinutes)}h</p>
            <p className="text-xs text-muted-foreground mt-1">Incl. pauses</p>
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
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Setups</p>
            <p className="text-3xl font-bold text-foreground mt-1">{totalSetups}</p>
            <p className="text-xs text-muted-foreground mt-1">{totalAbandoned} abandoned</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Avg Setup</p>
            <p className="text-3xl font-bold text-foreground mt-1">{avgSetup.toFixed(0)}m</p>
            <p className="text-xs text-muted-foreground mt-1">Working time per setup</p>
          </div>
        </div>

        <SetupTimeGrid machines={machines as any} dataAsOf={dataAsOf} />
      </div>
    </ReportingShell>
  )
}

import { getOperatorTimeReport } from '@/lib/actions/reporting'
import { ReportingShell } from '../_components/ReportingShell'
import { DateRangePicker } from '../_components/DateRangePicker'
import { ExportCsvButton } from '../_components/ExportCsvButton'
import { resolveRange, rangeSuffix } from '@/lib/reporting/range'
import { User, TrendingUp } from 'lucide-react'

export const dynamic = 'force-dynamic'

type PageProps = {
  searchParams: Promise<{ from?: string; to?: string; preset?: string }>
}

function EfficiencyBadge({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-muted-foreground text-xs">N/A</span>
  const cls =
    pct >= 90 ? 'bg-status-running/20 text-status-running'
    : pct >= 70 ? 'bg-status-paused/20 text-status-paused'
    : 'bg-destructive/20 text-destructive'
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded ${cls}`}>{pct}%</span>
}

export default async function OperatorsReportPage({ searchParams }: PageProps) {
  const range = resolveRange(await searchParams)
  const operators = await getOperatorTimeReport(range)

  const totalHours = operators.reduce((s, o) => s + o.hours_worked, 0)
  const totalOnClock = operators.reduce((s, o) => s + o.hours_on_clock, 0)
  const totalPaused = operators.reduce((s, o) => s + o.hours_paused, 0)
  const withWork = operators.filter(o => o.hours_worked > 0).length

  return (
    <ReportingShell>
      <div className="px-8 py-6 border-b border-border space-y-4">
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">Operator Time</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Hours actually worked in <span className="text-foreground font-medium">{range.label}</span> — pauses and
            shift breaks excluded, attributed to whoever was signed on at the time
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <DateRangePicker range={range} />
          <ExportCsvButton
            rows={operators as any}
            columns={[
              { key: 'display_name', header: 'Operator' },
              { key: 'role', header: 'Role' },
              { key: 'session_count', header: 'Sessions' },
              { key: 'hours_worked', header: 'Machine Hours' },
              { key: 'hours_on_clock', header: 'Hours On Clock' },
              { key: 'hours_paused', header: 'Hours Paused' },
              { key: 'hours_break', header: 'Hours Break' },
              { key: 'hours_elapsed', header: 'Hours On-Clock' },
            ]}
            filename={`operator-time_${rangeSuffix(range)}`}
          />
        </div>
      </div>

      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-card rounded-xl border border-border p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Operators</p>
            <p className="text-3xl font-bold text-foreground mt-1">{withWork}</p>
            <p className="text-xs text-muted-foreground mt-1">of {operators.length} with recorded time</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Machine Hours</p>
            <p className="text-3xl font-bold text-status-running mt-1">{totalHours.toFixed(1)}h</p>
            <p className="text-xs text-muted-foreground mt-1">{totalOnClock.toFixed(1)}h on the clock</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Hours Paused</p>
            <p className="text-3xl font-bold text-status-paused mt-1">{totalPaused.toFixed(1)}h</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Avg Efficiency</p>
            <p className="text-3xl font-bold text-muted-foreground mt-1">N/A</p>
            <p className="text-xs text-muted-foreground mt-1">Needs standard hours from the ERP</p>
          </div>
        </div>

        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                {['Operator', 'Role', 'Sessions', 'Machine Hours', 'On Clock', 'Paused', 'Break', 'Elapsed', 'Produced', 'Efficiency'].map(h => (
                  <th key={h} className="text-left text-xs font-semibold uppercase tracking-widest text-muted-foreground px-4 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {operators.map(op => {
                const efficiency =
                  op.hours_produced != null && op.hours_worked > 0
                    ? Math.round((op.hours_produced / op.hours_worked) * 100)
                    : null
                return (
                  <tr key={op.id} className="bg-card hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                          <User className="w-3.5 h-3.5 text-muted-foreground" />
                        </div>
                        <span className="font-semibold text-foreground">{op.display_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded bg-muted text-muted-foreground">
                        {op.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-foreground font-mono">{op.session_count}</td>
                    <td className="px-4 py-3 font-mono font-semibold text-status-running">{op.hours_worked.toFixed(1)}h</td>
                    <td className="px-4 py-3 font-mono text-foreground">{op.hours_on_clock.toFixed(1)}h</td>
                    <td className="px-4 py-3 font-mono text-status-paused">{op.hours_paused.toFixed(1)}h</td>
                    <td className="px-4 py-3 font-mono text-muted-foreground">{op.hours_break.toFixed(1)}h</td>
                    <td className="px-4 py-3 font-mono text-muted-foreground">{op.hours_elapsed.toFixed(1)}h</td>
                    <td className="px-4 py-3 font-mono text-muted-foreground">
                      {op.hours_produced != null ? `${op.hours_produced.toFixed(1)}h` : 'N/A'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <EfficiencyBadge pct={efficiency} />
                        {efficiency != null && efficiency >= 90 && <TrendingUp className="w-3.5 h-3.5 text-status-running" />}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {operators.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center text-muted-foreground py-10">
                    No operator time recorded in this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-muted-foreground">
          <span className="text-foreground font-medium">Machine hours</span> sums every session, so an operator running
          three machines for an hour shows three hours — that is the figure job costing wants.{' '}
          <span className="text-foreground font-medium">On clock</span> merges overlapping sessions into real wall-clock
          time, which is the figure to use for attendance. They only differ for people working more than one machine at once.
        </p>
      </div>
    </ReportingShell>
  )
}

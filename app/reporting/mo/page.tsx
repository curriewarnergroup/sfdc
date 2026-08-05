import { getMoSummaryReport } from '@/lib/actions/reporting'
import { ReportingShell } from '../_components/ReportingShell'
import { DateRangePicker } from '../_components/DateRangePicker'
import { ExportCsvButton } from '../_components/ExportCsvButton'
import { MoSearch } from './MoSearch'
import { resolveRange, rangeSuffix } from '@/lib/reporting/range'

export const dynamic = 'force-dynamic'

type PageProps = {
  searchParams: Promise<{ from?: string; to?: string; preset?: string; mo?: string }>
}

function h(mins: number) {
  return (mins / 60).toFixed(1)
}

export default async function MoReportPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const range = resolveRange(sp)
  const mo = sp.mo?.trim() || undefined

  const rows = await getMoSummaryReport(range, mo)

  const totalMinutes = rows.reduce((s, r) => s + r.total_minutes, 0)
  const setupMinutes = rows.reduce((s, r) => s + r.setup_minutes, 0)
  const pausedMinutes = rows.reduce((s, r) => s + r.paused_minutes, 0)

  const exportRows = rows.map(r => ({
    mo_number: r.mo_number,
    machines: r.machines.join('; '),
    operators: r.operators.join('; '),
    sessions: r.session_count,
    setup_hours: Number(h(r.setup_minutes)),
    run_hours: Number(h(r.run_minutes)),
    unmanned_hours: Number(h(r.unmanned_minutes)),
    paused_hours: Number(h(r.paused_minutes)),
    total_hours: Number(h(r.total_minutes)),
    first_start: r.first_start ?? '',
    last_activity: r.last_activity ?? '',
    qty_made: r.qty_made ?? '',
    minutes_per_part: r.minutes_per_part ?? '',
  }))

  return (
    <ReportingShell>
      <div className="px-8 py-6 border-b border-border space-y-4">
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">Jobs / MO</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Total time against each manufacturing order in{' '}
            <span className="text-foreground font-medium">{range.label}</span>, across every machine and everyone who
            touched it. This is the view that lines up with job costing.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <DateRangePicker range={range} />
            <MoSearch initial={mo ?? ''} />
          </div>
          <ExportCsvButton
            rows={exportRows}
            columns={[
              { key: 'mo_number', header: 'MO' },
              { key: 'machines', header: 'Machines' },
              { key: 'operators', header: 'Operators' },
              { key: 'sessions', header: 'Sessions' },
              { key: 'setup_hours', header: 'Setup Hours' },
              { key: 'run_hours', header: 'Run Hours' },
              { key: 'unmanned_hours', header: 'Unmanned Hours' },
              { key: 'paused_hours', header: 'Paused Hours' },
              { key: 'total_hours', header: 'Total Hours' },
              { key: 'first_start', header: 'First Start' },
              { key: 'last_activity', header: 'Last Activity' },
              { key: 'qty_made', header: 'Qty Made' },
              { key: 'minutes_per_part', header: 'Minutes / Part' },
            ]}
            filename={`jobs-mo_${rangeSuffix(range)}`}
          />
        </div>
      </div>

      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-card rounded-xl border border-border p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Jobs</p>
            <p className="text-3xl font-bold text-foreground mt-1">{rows.length}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Total Time</p>
            <p className="text-3xl font-bold text-foreground mt-1">{h(totalMinutes)}h</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Of Which Setup</p>
            <p className="text-3xl font-bold text-blue-400 mt-1">{h(setupMinutes)}h</p>
            <p className="text-xs text-muted-foreground mt-1">
              {totalMinutes > 0 ? `${Math.round((setupMinutes / totalMinutes) * 100)}% of job time` : '—'}
            </p>
          </div>
          <div className="bg-card rounded-xl border border-border p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Of Which Stopped</p>
            <p className="text-3xl font-bold text-status-paused mt-1">{h(pausedMinutes)}h</p>
            <p className="text-xs text-muted-foreground mt-1">
              {totalMinutes > 0 ? `${Math.round((pausedMinutes / totalMinutes) * 100)}% of job time` : '—'}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                {['MO', 'Machines', 'Operators', 'Setup', 'Run', 'Stopped', 'Total', 'Qty Made', 'Last Activity'].map(x => (
                  <th key={x} className="text-left text-xs font-semibold uppercase tracking-widest text-muted-foreground px-4 py-3">
                    {x}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map(r => (
                <tr key={r.mo_number} className="bg-card hover:bg-muted/30 transition-colors align-top">
                  <td className="px-4 py-3 font-mono font-semibold text-foreground">{r.mo_number}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{r.machines.join(', ')}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{r.operators.join(', ') || '—'}</td>
                  <td className="px-4 py-3 font-mono text-blue-400">{h(r.setup_minutes)}h</td>
                  <td className="px-4 py-3 font-mono text-status-running">
                    {h(r.run_minutes + r.unmanned_minutes)}h
                  </td>
                  <td className="px-4 py-3 font-mono text-status-paused">{h(r.paused_minutes)}h</td>
                  <td className="px-4 py-3 font-mono font-semibold text-foreground">{h(r.total_minutes)}h</td>
                  <td className="px-4 py-3 font-mono text-muted-foreground">{r.qty_made ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {r.last_activity ? new Date(r.last_activity).toLocaleString('en-GB') : '—'}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center text-muted-foreground py-10">
                    No job activity recorded in this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </ReportingShell>
  )
}

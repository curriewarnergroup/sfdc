import { getDowntimeParetoReport } from '@/lib/actions/reporting'
import { getAllMachines } from '@/lib/actions/admin'
import { ReportingShell } from '../_components/ReportingShell'
import { DateRangePicker } from '../_components/DateRangePicker'
import { ExportCsvButton } from '../_components/ExportCsvButton'
import { MachineFilter } from './MachineFilter'
import { resolveRange, rangeSuffix } from '@/lib/reporting/range'

export const dynamic = 'force-dynamic'

type PageProps = {
  searchParams: Promise<{ from?: string; to?: string; preset?: string; machineId?: string }>
}

export default async function DowntimeReportPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const range = resolveRange(sp)
  const machineId = sp.machineId?.trim() || undefined

  const [rows, machines] = await Promise.all([
    getDowntimeParetoReport(range, machineId),
    getAllMachines(),
  ])

  const totalHours = rows.reduce((s, r) => s + r.hours, 0)
  const totalStops = rows.reduce((s, r) => s + r.occurrences, 0)
  const worst = rows[0] ?? null
  const maxMinutes = worst?.minutes ?? 1
  // How many reasons account for 80% of the lost time.
  const vitalFew = rows.findIndex(r => r.running_pct >= 80)

  return (
    <ReportingShell>
      <div className="px-8 py-6 border-b border-border space-y-4">
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">Downtime</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Where stopped time went in <span className="text-foreground font-medium">{range.label}</span>, biggest cause first.
            Pauses recorded without a reason are classified from the event that caused them rather than dumped into
            &ldquo;Unspecified&rdquo;.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <DateRangePicker range={range} />
            <MachineFilter machines={machines as any} selected={machineId ?? ''} />
          </div>
          <ExportCsvButton
            rows={rows as any}
            columns={[
              { key: 'pause_reason', header: 'Reason' },
              { key: 'hours', header: 'Hours Lost' },
              { key: 'minutes', header: 'Minutes Lost' },
              { key: 'occurrences', header: 'Stops' },
              { key: 'machines_hit', header: 'Machines Affected' },
              { key: 'pct_of_total', header: '% of Downtime' },
              { key: 'running_pct', header: 'Cumulative %' },
            ]}
            filename={`downtime_${rangeSuffix(range)}`}
          />
        </div>
      </div>

      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-card rounded-xl border border-border p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Hours Lost</p>
            <p className="text-3xl font-bold text-status-paused mt-1">{totalHours.toFixed(1)}h</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Stoppages</p>
            <p className="text-3xl font-bold text-foreground mt-1">{totalStops}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Biggest Cause</p>
            <p className="text-lg font-bold text-foreground mt-2 leading-tight">{worst?.pause_reason ?? '—'}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {worst ? `${worst.hours.toFixed(1)}h · ${worst.pct_of_total}%` : 'No downtime recorded'}
            </p>
          </div>
          <div className="bg-card rounded-xl border border-border p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">80% Comes From</p>
            <p className="text-3xl font-bold text-foreground mt-1">{vitalFew >= 0 ? vitalFew + 1 : rows.length}</p>
            <p className="text-xs text-muted-foreground mt-1">of {rows.length} reasons</p>
          </div>
        </div>

        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                {['Reason', 'Lost Time', 'Stops', 'Machines', '% of Total', 'Cumulative'].map(h => (
                  <th key={h} className="text-left text-xs font-semibold uppercase tracking-widest text-muted-foreground px-4 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map(r => (
                <tr key={r.pause_reason} className="bg-card hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 w-[38%]">
                    <div className="font-semibold text-foreground">{r.pause_reason}</div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-status-paused"
                        style={{ width: `${Math.max(2, (r.minutes / maxMinutes) * 100)}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono font-semibold text-status-paused">{r.hours.toFixed(1)}h</td>
                  <td className="px-4 py-3 font-mono text-foreground">{r.occurrences}</td>
                  <td className="px-4 py-3 font-mono text-muted-foreground">{r.machines_hit}</td>
                  <td className="px-4 py-3 font-mono text-muted-foreground">{r.pct_of_total}%</td>
                  <td className="px-4 py-3 font-mono text-muted-foreground">{r.running_pct}%</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-muted-foreground py-10">
                    No downtime recorded in this period.
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

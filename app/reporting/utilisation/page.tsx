import { getMachineUtilisationReport } from '@/lib/actions/reporting'
import { ReportingShell } from '../_components/ReportingShell'
import { DateRangePicker } from '../_components/DateRangePicker'
import { ExportCsvButton } from '../_components/ExportCsvButton'
import { QueryParamSelect } from '../_components/QueryParamSelect'
import { resolveRange, rangeSuffix } from '@/lib/reporting/range'

export const dynamic = 'force-dynamic'

type PageProps = {
  searchParams: Promise<{ from?: string; to?: string; preset?: string; capacity?: string }>
}

const CAPACITY_OPTIONS = [
  { value: '480', label: 'Single shift (8h)' },
  { value: '960', label: 'Double days (16h)' },
  { value: '1440', label: '24 hours' },
]

export default async function UtilisationReportPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const range = resolveRange(sp)
  const capacity = Number(sp.capacity ?? 480) || 480

  const rows = await getMachineUtilisationReport(range, capacity)

  // Roll the per-day rows up per machine for the headline table.
  type Agg = {
    machine_code: string
    machine_description: string | null
    days: number
    run: number
    setup: number
    unmanned: number
    paused: number
    break_: number
  }
  const byMachine = new Map<string, Agg>()
  for (const r of rows) {
    const a =
      byMachine.get(r.machine_id) ??
      {
        machine_code: r.machine_code,
        machine_description: r.machine_description,
        days: 0,
        run: 0,
        setup: 0,
        unmanned: 0,
        paused: 0,
        break_: 0,
      }
    a.days += 1
    a.run += r.run_minutes
    a.setup += r.setup_minutes
    a.unmanned += r.unmanned_minutes
    a.paused += r.paused_minutes
    a.break_ += r.break_minutes
    byMachine.set(r.machine_id, a)
  }

  const machines = [...byMachine.entries()]
    .map(([id, a]) => {
      const productive = a.run + a.unmanned
      const availableMinutes = a.days * capacity
      return {
        id,
        machine_code: a.machine_code,
        description: a.machine_description ?? '',
        days_active: a.days,
        run_hours: Math.round((a.run / 60) * 10) / 10,
        setup_hours: Math.round((a.setup / 60) * 10) / 10,
        unmanned_hours: Math.round((a.unmanned / 60) * 10) / 10,
        paused_hours: Math.round((a.paused / 60) * 10) / 10,
        break_hours: Math.round((a.break_ / 60) * 10) / 10,
        utilisation_pct: availableMinutes > 0 ? Math.round((productive / availableMinutes) * 1000) / 10 : 0,
        setup_ratio_pct:
          productive + a.setup > 0 ? Math.round((a.setup / (productive + a.setup)) * 1000) / 10 : 0,
      }
    })
    .sort((a, b) => a.machine_code.localeCompare(b.machine_code, undefined, { numeric: true }))

  const fleetUtilisation =
    machines.length > 0
      ? Math.round((machines.reduce((s, m) => s + m.utilisation_pct, 0) / machines.length) * 10) / 10
      : 0

  return (
    <ReportingShell>
      <div className="px-8 py-6 border-b border-border space-y-4">
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">Utilisation</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Productive machine time in <span className="text-foreground font-medium">{range.label}</span> against available
            capacity. Utilisation counts running and unmanned time; setup is shown separately so changeover load is visible.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <DateRangePicker range={range} />
            <QueryParamSelect
              param="capacity"
              value={String(capacity)}
              options={CAPACITY_OPTIONS}
              label="Capacity per day"
            />
          </div>
          <ExportCsvButton
            rows={machines as any}
            columns={[
              { key: 'machine_code', header: 'Machine' },
              { key: 'description', header: 'Description' },
              { key: 'days_active', header: 'Days With Activity' },
              { key: 'run_hours', header: 'Run Hours' },
              { key: 'setup_hours', header: 'Setup Hours' },
              { key: 'unmanned_hours', header: 'Unmanned Hours' },
              { key: 'paused_hours', header: 'Paused Hours' },
              { key: 'utilisation_pct', header: 'Utilisation %' },
              { key: 'setup_ratio_pct', header: 'Setup Ratio %' },
            ]}
            filename={`utilisation_${rangeSuffix(range)}`}
          />
        </div>
      </div>

      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-card rounded-xl border border-border p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Machines Active</p>
            <p className="text-3xl font-bold text-foreground mt-1">{machines.length}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Avg Utilisation</p>
            <p className="text-3xl font-bold text-status-running mt-1">{fleetUtilisation}%</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Run Hours</p>
            <p className="text-3xl font-bold text-foreground mt-1">
              {machines.reduce((s, m) => s + m.run_hours + m.unmanned_hours, 0).toFixed(1)}h
            </p>
          </div>
          <div className="bg-card rounded-xl border border-border p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Setup Hours</p>
            <p className="text-3xl font-bold text-foreground mt-1">
              {machines.reduce((s, m) => s + m.setup_hours, 0).toFixed(1)}h
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                {['Machine', 'Days', 'Run', 'Unmanned', 'Setup', 'Paused', 'Utilisation', 'Setup Ratio'].map(h => (
                  <th key={h} className="text-left text-xs font-semibold uppercase tracking-widest text-muted-foreground px-4 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {machines.map(m => (
                <tr key={m.id} className="bg-card hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-foreground">{m.machine_code}</div>
                    {m.description && <div className="text-xs text-muted-foreground">{m.description}</div>}
                  </td>
                  <td className="px-4 py-3 font-mono text-muted-foreground">{m.days_active}</td>
                  <td className="px-4 py-3 font-mono text-status-running">{m.run_hours.toFixed(1)}h</td>
                  <td className="px-4 py-3 font-mono text-muted-foreground">{m.unmanned_hours.toFixed(1)}h</td>
                  <td className="px-4 py-3 font-mono text-blue-400">{m.setup_hours.toFixed(1)}h</td>
                  <td className="px-4 py-3 font-mono text-status-paused">{m.paused_hours.toFixed(1)}h</td>
                  <td className="px-4 py-3 w-[16%]">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-foreground w-12">{m.utilisation_pct}%</span>
                      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-status-running"
                          style={{ width: `${Math.min(100, m.utilisation_pct)}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-muted-foreground">{m.setup_ratio_pct}%</td>
                </tr>
              ))}
              {machines.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-muted-foreground py-10">
                    No machine activity recorded in this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-muted-foreground">
          Utilisation is measured against {capacity} minutes per machine per day with recorded activity. There is no capacity
          calendar in the schema yet, so days with no activity at all are not counted as lost capacity — add a machine
          calendar if you want true availability rather than relative utilisation.
        </p>
      </div>
    </ReportingShell>
  )
}

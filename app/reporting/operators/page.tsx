import { getOperatorTimeReport } from '@/lib/actions/reporting'
import { ReportingShell } from '../_components/ReportingShell'
import { User, TrendingUp } from 'lucide-react'

export const dynamic = 'force-dynamic'

function EfficiencyBadge({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-muted-foreground text-xs">N/A</span>
  const cls = pct >= 90 ? 'bg-status-running/20 text-status-running' : pct >= 70 ? 'bg-status-paused/20 text-status-paused' : 'bg-destructive/20 text-destructive'
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded ${cls}`}>{pct}%</span>
}

export default async function OperatorsReportPage() {
  const operators = await getOperatorTimeReport()

  const totalHours = operators.reduce((s, o) => s + o.hours_worked, 0)

  return (
    <ReportingShell>
      <div className="px-8 py-6 border-b border-border">
        <h1 className="text-xl font-bold text-foreground tracking-tight">Operator Time</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Hours actually worked (pauses excluded), hours produced and efficiency per operator</p>
      </div>

      <div className="p-8 space-y-6">
        {/* Summary stat */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="bg-card rounded-xl border border-border p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Total Operators</p>
            <p className="text-3xl font-bold text-foreground mt-1">{operators.length}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Total Hours Worked</p>
            <p className="text-3xl font-bold text-foreground mt-1">{totalHours.toFixed(1)}h</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Avg Efficiency</p>
            <p className="text-3xl font-bold text-foreground mt-1 text-muted-foreground">N/A</p>
            <p className="text-xs text-muted-foreground mt-1">Requires ERP data</p>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                {['Operator', 'Role', 'Sessions', 'Hours Worked', 'Hours On-Clock', 'Hours Produced', 'Efficiency'].map(h => (
                  <th key={h} className="text-left text-xs font-semibold uppercase tracking-widest text-muted-foreground px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {operators.map(op => {
                const efficiency = op.hours_produced != null && op.hours_worked > 0
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
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-semibold text-status-running">{op.hours_worked.toFixed(1)}h</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-mono">{op.hours_elapsed.toFixed(1)}h</td>
                    <td className="px-4 py-3 text-muted-foreground font-mono">
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
                <tr><td colSpan={7} className="text-center text-muted-foreground py-10">No active operators found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </ReportingShell>
  )
}

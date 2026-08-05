import { getOperatorDailyReport } from '@/lib/actions/reporting'
import { ReportingShell } from '../_components/ReportingShell'
import { DailyWorkClient } from './DailyWorkClient'

export const dynamic = 'force-dynamic'

export default async function DailyWorkReportPage() {
  const people = await getOperatorDailyReport()

  const totalHours = people.reduce((s, p) => s + p.total_hours, 0)
  const peopleWithWork = people.filter(p => p.days.length > 0).length

  return (
    <ReportingShell>
      <div className="px-8 py-6 border-b border-border">
        <h1 className="text-xl font-bold text-foreground tracking-tight">Daily Work</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Day-by-day breakdown of hours actually worked per person &mdash; and exactly which machine and MO each hour was spent on. Pauses are excluded.
        </p>
      </div>

      <div className="p-8 space-y-6">
        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="bg-card rounded-xl border border-border p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">People</p>
            <p className="text-3xl font-bold text-foreground mt-1">{people.length}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Active (with work)</p>
            <p className="text-3xl font-bold text-foreground mt-1">{peopleWithWork}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Total Hours Worked</p>
            <p className="text-3xl font-bold text-status-running mt-1">{totalHours.toFixed(1)}h</p>
          </div>
        </div>

        <DailyWorkClient people={people} />
      </div>
    </ReportingShell>
  )
}

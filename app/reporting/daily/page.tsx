import { getOperatorDailyReport } from '@/lib/actions/reporting'
import { ReportingShell } from '../_components/ReportingShell'
import { DailyWorkClient } from './DailyWorkClient'

export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function pick(value: string | string[] | undefined) {
  const v = Array.isArray(value) ? value[0] : value
  return v && DATE_RE.test(v) ? v : ''
}

export default async function DailyWorkReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string | string[]; to?: string | string[] }>
}) {
  const sp = await searchParams
  const from = pick(sp.from)
  const to = pick(sp.to)

  const people = await getOperatorDailyReport({ from: from || undefined, to: to || undefined })

  const totalHours = people.reduce((s, p) => s + p.total_hours, 0)
  const peopleWithWork = people.filter(p => p.days.length > 0).length

  return (
    <ReportingShell>
      <div className="px-8 py-6 border-b border-border">
        <h1 className="text-xl font-bold text-foreground tracking-tight">Daily Work</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Most recently completed work first. Filter by date to see what each operator completed in that period, including the machine and MO. Pauses are excluded.
        </p>
      </div>

      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="bg-card rounded-xl border border-border p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">People</p>
            <p className="text-3xl font-bold text-foreground mt-1">{people.length}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Worked in period</p>
            <p className="text-3xl font-bold text-foreground mt-1">{peopleWithWork}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Total Hours Worked</p>
            <p className="text-3xl font-bold text-status-running mt-1">{totalHours.toFixed(1)}h</p>
          </div>
        </div>

        <DailyWorkClient key={`${from}|${to}`} people={people} from={from} to={to} />
      </div>
    </ReportingShell>
  )
}

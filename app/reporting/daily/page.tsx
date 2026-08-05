import { getOperatorDailyReport } from '@/lib/actions/reporting'
import { ReportingShell } from '../_components/ReportingShell'
import { DailyWorkClient } from './DailyWorkClient'
import { DateRangePicker } from '../_components/DateRangePicker'
import { ExportCsvButton } from '../_components/ExportCsvButton'
import { resolveRange, rangeSuffix } from '@/lib/reporting/range'

export const dynamic = 'force-dynamic'

type PageProps = {
  searchParams: Promise<{ from?: string; to?: string; preset?: string }>
}

export default async function DailyWorkReportPage({ searchParams }: PageProps) {
  const range = resolveRange(await searchParams)
  const people = await getOperatorDailyReport(range)

  const totalHours = people.reduce((s, p) => s + p.total_hours, 0)
  const peopleWithWork = people.filter(p => p.days.length > 0).length

  // Flattened one-row-per-entry export: person / day / machine / MO / hours.
  const flat = people.flatMap(p =>
    p.days.flatMap(d =>
      d.entries.map(e => ({
        operator: p.display_name,
        role: p.role,
        date: d.date,
        machine: e.machine_code,
        machine_description: e.description ?? '',
        mo_number: e.mo_number,
        session_type: e.session_type,
        hours: e.hours,
      })),
    ),
  )

  return (
    <ReportingShell>
      <div className="px-8 py-6 border-b border-border space-y-4">
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">Daily Work</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Day-by-day hours actually worked per person for <span className="text-foreground font-medium">{range.label}</span>,
            and exactly which machine and MO each hour was spent on. Pauses and breaks excluded; work spanning midnight is
            split across both days.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <DateRangePicker range={range} />
          <ExportCsvButton
            rows={flat}
            columns={[
              { key: 'operator', header: 'Operator' },
              { key: 'role', header: 'Role' },
              { key: 'date', header: 'Date' },
              { key: 'machine', header: 'Machine' },
              { key: 'machine_description', header: 'Machine Description' },
              { key: 'mo_number', header: 'MO' },
              { key: 'session_type', header: 'Type' },
              { key: 'hours', header: 'Hours Worked' },
            ]}
            filename={`daily-work_${rangeSuffix(range)}`}
          />
        </div>
      </div>

      <div className="p-8 space-y-6">
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

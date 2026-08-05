import { getMachineStatusReport } from '@/lib/actions/reporting'
import { ReportingShell } from './_components/ReportingShell'
import { MachineStatusGrid } from './_components/MachineStatusGrid'
import { AutoRefresh } from './_components/AutoRefresh'

export const dynamic = 'force-dynamic'

export default async function ReportingMachinesPage() {
  const machines = await getMachineStatusReport()
  const activeSessions = machines.filter(m => m.session !== null).length

  return (
    <ReportingShell>
      <AutoRefresh intervalMs={30000} />
      <div className="px-8 py-6 border-b border-border flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">Machine Status</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Live view of all machines — click a machine to see its history
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-status-running animate-pulse" />
            <span className="text-muted-foreground">{activeSessions} active</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-muted-foreground/40" />
            <span className="text-muted-foreground">{machines.length - activeSessions} idle</span>
          </div>
        </div>
      </div>
      <div className="p-8">
        <MachineStatusGrid machines={machines as any} />
      </div>
    </ReportingShell>
  )
}

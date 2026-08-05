import { getMachineActivityLog, getAllMachines } from '@/lib/actions/admin'
import { getMachineCurrentStatus } from '@/lib/actions/reporting'
import { ReportingShell } from '../../_components/ReportingShell'
import { ActivityLogClient } from './ActivityLogClient'
import { MachineStatusCard } from '../../_components/MachineStatusCard'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export const dynamic = 'force-dynamic'

type PageProps = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ from?: string; to?: string; mo?: string; userId?: string }>
}

export default async function MachineHistoryPage({ params, searchParams }: PageProps) {
  const { id } = await params
  const { from, to, mo, userId } = await searchParams

  const [{ events, users }, machines, liveStatus] = await Promise.all([
    getMachineActivityLog(id, { from, to, mo, userId }),
    getAllMachines(),
    getMachineCurrentStatus(id),
  ])

  const machine = (machines as any[]).find(m => m.id === id)

  return (
    <ReportingShell>
      {/* Page header */}
      <div className="px-8 py-6 border-b border-border flex items-center gap-4 print:hidden">
        <Link
          href="/reporting"
          className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Back to machines"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">
            {machine?.machine_code ?? 'Machine'}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {machine?.description ?? ''}
          </p>
        </div>
      </div>

      {/* Live status card */}
      {liveStatus && (
        <MachineStatusCard
          machine={liveStatus.machine}
          session={liveStatus.session as any}
        />
      )}

      {/* Activity log section header */}
      <div className="px-8 pt-6 pb-2 print:hidden">
        <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Activity Log</h2>
        <p className="text-xs text-muted-foreground mt-0.5">All events for this machine, newest first</p>
      </div>

      {/* Print header — only visible when printing */}
      <div className="hidden print:block px-8 py-6 border-b border-gray-300">
        <h1 className="text-2xl font-bold text-black">
          {machine?.machine_code ?? 'Machine'} — Activity Log
        </h1>
        <p className="text-sm text-gray-600 mt-1">{machine?.description ?? ''}</p>
        {(from || to || mo || userId) && (
          <p className="text-xs text-gray-500 mt-1">
            Filters: {[
              from && `From: ${from}`,
              to   && `To: ${to}`,
              mo   && `MO: ${mo}`,
              userId && `User: ${users.find(u => u.id === userId)?.display_name}`,
            ].filter(Boolean).join(' · ')}
          </p>
        )}
        <p className="text-xs text-gray-400 mt-1">Printed: {new Date().toLocaleString('en-GB')}</p>
      </div>

      <ActivityLogClient
        events={events}
        users={users}
        machineId={id}
        initialFilters={{ from, to, mo, userId }}
      />
    </ReportingShell>
  )
}

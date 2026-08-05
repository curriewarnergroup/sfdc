import { getMachineLiveStates } from '@/lib/actions/reporting'
import { ReportingShell } from './_components/ReportingShell'
import { MachineStatusGrid } from './_components/MachineStatusGrid'
import { AutoRefresh } from './_components/AutoRefresh'
import {
  MachineStateFilter,
  MACHINE_STATES,
  DEFAULT_STATES,
  parseStates,
  type MachineState,
} from './_components/MachineStateFilter'

export const dynamic = 'force-dynamic'

type PageProps = {
  searchParams: Promise<{ state?: string }>
}

// Machines being worked on come first; idle sinks to the bottom. Within a
// group, longest time in state first — so a three-hour stoppage sits above
// a ten-minute one without anyone having to sort a column.
const GROUP_RANK: Record<MachineState, number> = {
  STOPPED: 0,
  RUNNING: 0,
  IN_SETUP: 0,
  UNMANNED: 0,
  AWAITING_QC: 1,
  IDLE: 2,
}

export default async function ReportingMachinesPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const machines = await getMachineLiveStates()

  const counts = Object.fromEntries(
    MACHINE_STATES.map(s => [s.key, machines.filter(m => m.state === s.key).length]),
  ) as Record<string, number>

  // No ?state= at all means the URL has not been set yet. The filter
  // component reinstates a saved default on the client if there is one;
  // until then, show everything but idle.
  const requested = parseStates(sp.state)
  const selected: MachineState[] = sp.state === undefined
    ? DEFAULT_STATES
    : requested.length > 0
      ? requested
      : (MACHINE_STATES.map(s => s.key) as MachineState[])

  const visible = machines
    .filter(m => selected.includes(m.state))
    .sort((a, b) => {
      const rank = GROUP_RANK[a.state] - GROUP_RANK[b.state]
      if (rank !== 0) return rank
      const am = a.minutes_in_state ?? -1
      const bm = b.minutes_in_state ?? -1
      if (bm !== am) return bm - am
      return a.machine_code.localeCompare(b.machine_code, undefined, { numeric: true })
    })

  const inPlay = machines.filter(m => m.state !== 'IDLE').length
  const longestStop = machines
    .filter(m => m.state === 'STOPPED')
    .sort((a, b) => (b.minutes_in_state ?? 0) - (a.minutes_in_state ?? 0))[0]
  const blocked = counts.AWAITING_QC ?? 0

  return (
    <ReportingShell>
      <AutoRefresh intervalMs={30000} />

      <div className="px-8 py-6 border-b border-border space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">Shop Floor</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {inPlay} of {machines.length} machines in play — longest in state first. Click a machine for its history.
            </p>
          </div>
          <div className="text-right shrink-0 print:hidden">
            {longestStop ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Longest stoppage</p>
                <p className="text-sm font-semibold text-status-paused mt-0.5">
                  {longestStop.machine_code} · {Math.round(longestStop.minutes_in_state ?? 0)}m
                </p>
                {longestStop.pause_reason_label && (
                  <p className="text-xs text-muted-foreground">{longestStop.pause_reason_label}</p>
                )}
              </>
            ) : (
              <>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Stoppages</p>
                <p className="text-sm font-semibold text-status-running mt-0.5">None</p>
              </>
            )}
          </div>
        </div>

        {/* The filter bar doubles as the summary — counts are live whether
            or not a state is selected. */}
        <MachineStateFilter selected={selected} counts={counts} />

        {blocked > 0 && !selected.includes('AWAITING_QC') && (
          <p className="text-xs text-amber-400">
            {blocked} machine{blocked === 1 ? '' : 's'} waiting on a first-off and hidden by your current filter.
          </p>
        )}
      </div>

      <div className="p-8">
        <MachineStatusGrid machines={visible as any} />
      </div>
    </ReportingShell>
  )
}

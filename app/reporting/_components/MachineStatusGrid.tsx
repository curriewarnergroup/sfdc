'use client'

import Link from 'next/link'
import { Cpu, User, Clock, ShieldQuestion } from 'lucide-react'
import { MACHINE_STATES, type MachineState } from './MachineStateFilter'

export type MachineRow = {
  machine_id: string
  machine_code: string
  description: string | null
  state: MachineState
  state_since: string | null
  minutes_in_state: number | null
  last_activity_at: string | null
  session_id: string | null
  session_type: string | null
  mo_number: string | null
  session_started_at: string | null
  qty_to_make: number | null
  qty_made: number | null
  qty_scrapped: number | null
  operator_name: string | null
  operator_role: string | null
  pause_reason_label: string | null
  awaiting_qc_mo: string | null
}

function stateMeta(state: MachineState) {
  return MACHINE_STATES.find(s => s.key === state) ?? MACHINE_STATES[MACHINE_STATES.length - 1]
}

function duration(mins: number | null) {
  if (mins == null) return '—'
  const m = Math.max(0, Math.round(mins))
  const h = Math.floor(m / 60)
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`
}

// A stoppage gets louder the longer it runs. Nothing escalates for running
// machines — a long cycle is not a problem, and colouring it like one is
// how a dashboard trains people to ignore it.
function durationTone(state: MachineState, mins: number | null) {
  if (mins == null) return 'text-muted-foreground'
  if (state === 'STOPPED') {
    if (mins >= 120) return 'text-destructive font-semibold'
    if (mins >= 30) return 'text-status-paused font-semibold'
    return 'text-status-paused'
  }
  if (state === 'AWAITING_QC' && mins >= 20) return 'text-amber-400 font-semibold'
  return 'text-foreground'
}

function QtyBar({ made, total, scrapped }: { made: number | null; total: number | null; scrapped?: number | null }) {
  if (!total) return <span className="text-muted-foreground text-xs">N/A</span>
  const pct = Math.min(100, Math.round(((made ?? 0) / total) * 100))
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-foreground font-mono">{made ?? 0} / {total}</span>
        <span className="text-muted-foreground">{pct}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      {scrapped != null && scrapped > 0 && (
        <p className="text-[11px] text-destructive">Scrap: {scrapped}</p>
      )}
    </div>
  )
}

export function MachineStatusGrid({ machines }: { machines: MachineRow[] }) {
  if (machines.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-16">
        No machines match the selected states.
      </p>
    )
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 border-b border-border">
          <tr>
            {['Machine', 'State', 'For', 'Operator', 'MO Number', 'On Job', 'Progress', ''].map(h => (
              <th key={h} className="text-left text-xs font-semibold uppercase tracking-widest text-muted-foreground px-4 py-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {machines.map(m => {
            const meta = stateMeta(m.state)
            const jobMinutes = m.session_started_at
              ? (Date.now() - new Date(m.session_started_at).getTime()) / 60000
              : null
            return (
              <tr key={m.machine_id} className="bg-card hover:bg-muted/30 transition-colors">
                {/* Machine */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <Cpu className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{m.machine_code}</p>
                      {m.description && <p className="text-xs text-muted-foreground">{m.description}</p>}
                    </div>
                  </div>
                </td>

                {/* State */}
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1">
                    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded border w-fit ${meta.chip}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                      {meta.label}
                    </span>
                    {m.state === 'STOPPED' && m.pause_reason_label && (
                      <span className="text-[11px] text-muted-foreground truncate max-w-[150px]">
                        {m.pause_reason_label}
                      </span>
                    )}
                    {m.state === 'AWAITING_QC' && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <ShieldQuestion className="w-3 h-3" />
                        First-off outstanding
                      </span>
                    )}
                  </div>
                </td>

                {/* Time in current state */}
                <td className={`px-4 py-3 font-mono ${durationTone(m.state, m.minutes_in_state)}`}>
                  {duration(m.minutes_in_state)}
                </td>

                {/* Operator */}
                <td className="px-4 py-3">
                  {m.operator_name ? (
                    <div className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="text-foreground">{m.operator_name}</span>
                      {m.operator_role && (
                        <span className="text-xs text-muted-foreground">({m.operator_role})</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>

                {/* MO */}
                <td className="px-4 py-3">
                  {m.mo_number || m.awaiting_qc_mo ? (
                    <span className="font-mono font-semibold text-foreground">
                      {m.mo_number ?? m.awaiting_qc_mo}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>

                {/* Total time on the job, distinct from time in state */}
                <td className="px-4 py-3">
                  {jobMinutes != null ? (
                    <div className="flex items-center gap-1.5 text-muted-foreground font-mono">
                      <Clock className="w-3.5 h-3.5" />
                      {duration(jobMinutes)}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>

                {/* Progress */}
                <td className="px-4 py-3 min-w-[140px]">
                  {m.session_id ? (
                    <QtyBar made={m.qty_made} total={m.qty_to_make} scrapped={m.qty_scrapped} />
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </td>

                {/* Link */}
                <td className="px-4 py-3">
                  <Link
                    href={`/reporting/machines/${m.machine_id}`}
                    className="text-xs font-semibold text-primary hover:underline whitespace-nowrap"
                  >
                    View history
                  </Link>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

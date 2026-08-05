'use client'

import { useState, Fragment } from 'react'
import Link from 'next/link'
import { Cpu, User, Clock, Wrench, ChevronDown, ChevronRight, Pause } from 'lucide-react'

type Current = {
  session_type: string
  status: string
  mo_number: string
  started_at: string
  operator: string | null
} | null

type PauseBreakdown = { label: string; minutes: number }

type SetupRow = {
  id: string
  machine_code: string
  description: string | null
  total_setup_minutes: number
  net_setup_minutes: number
  paused_setup_minutes: number
  pause_breakdown: PauseBreakdown[]
  setup_count: number
  last_setup: string | null
  in_setup: boolean
  current: Current
}

function fmtDuration(mins: number) {
  if (mins <= 0) return '0m'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function elapsed(startedAt: string) {
  const ms = Date.now() - new Date(startedAt).getTime()
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function fmtDate(dt: string | null) {
  if (!dt) return '—'
  return new Date(dt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function statusLabel(row: SetupRow): { label: string; cls: string } {
  if (row.in_setup) {
    if (row.current?.status === 'PAUSED') return { label: 'Setup Paused', cls: 'bg-status-paused/20 text-status-paused' }
    return { label: 'In Setup', cls: 'bg-blue-500/20 text-blue-400' }
  }
  if (row.current) {
    if (row.current.status === 'PAUSED') return { label: 'Paused', cls: 'bg-status-paused/20 text-status-paused' }
    return { label: 'Running', cls: 'bg-status-running/20 text-status-running' }
  }
  return { label: 'Idle', cls: 'bg-status-idle/20 text-status-idle' }
}

export function SetupTimeGrid({ machines }: { machines: SetupRow[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  if (machines.length === 0) {
    return <p className="text-center text-muted-foreground py-16">No machines found.</p>
  }

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Machines currently in setup float to the top, then by total setup time desc
  const sorted = [...machines].sort((a, b) => {
    if (a.in_setup !== b.in_setup) return a.in_setup ? -1 : 1
    return b.total_setup_minutes - a.total_setup_minutes
  })

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 border-b border-border">
          <tr>
            {['Machine', 'Status', 'Current Setup', 'Total Time', 'Working', 'Paused', 'Setups', 'Last Setup', ''].map(h => (
              <th key={h} className="text-left text-xs font-semibold uppercase tracking-widest text-muted-foreground px-4 py-3">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sorted.map(m => {
            const { label, cls } = statusLabel(m)
            const isExpanded = expanded.has(m.id)
            const hasPauses = m.pause_breakdown.length > 0
            return (
              <Fragment key={m.id}>
                <tr
                  className={`transition-colors ${m.in_setup ? 'bg-blue-500/5 hover:bg-blue-500/10' : 'bg-card hover:bg-muted/30'}`}
                >
                  {/* Machine */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${m.in_setup ? 'bg-blue-500/20' : 'bg-muted'}`}>
                        {m.in_setup
                          ? <Wrench className="w-3.5 h-3.5 text-blue-400" />
                          : <Cpu className="w-3.5 h-3.5 text-muted-foreground" />}
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">{m.machine_code}</p>
                        {m.description && <p className="text-xs text-muted-foreground">{m.description}</p>}
                      </div>
                    </div>
                  </td>
                  {/* Status */}
                  <td className="px-4 py-3">
                    <span className={`text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded w-fit inline-block ${cls}`}>
                      {label}
                    </span>
                  </td>
                  {/* Current setup detail */}
                  <td className="px-4 py-3">
                    {m.in_setup && m.current ? (
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span className="text-foreground">{m.current.operator ?? 'Unknown'}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="font-mono font-semibold text-foreground">{m.current.mo_number}</span>
                          <span className="flex items-center gap-1 font-mono">
                            <Clock className="w-3 h-3" />{elapsed(m.current.started_at)}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  {/* Total time (incl pauses) */}
                  <td className="px-4 py-3">
                    <span className="font-mono font-semibold text-foreground">{fmtDuration(m.total_setup_minutes)}</span>
                  </td>
                  {/* Working time (pauses excluded) */}
                  <td className="px-4 py-3">
                    <span className="font-mono font-semibold text-status-running">{fmtDuration(m.net_setup_minutes)}</span>
                  </td>
                  {/* Paused — click to drill into reasons */}
                  <td className="px-4 py-3">
                    {hasPauses ? (
                      <button
                        onClick={() => toggle(m.id)}
                        className="flex items-center gap-1.5 font-mono font-semibold text-status-paused hover:underline"
                        aria-expanded={isExpanded}
                        aria-label={`Show pause reasons for ${m.machine_code}`}
                      >
                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        {fmtDuration(m.paused_setup_minutes)}
                      </button>
                    ) : (
                      <span className="font-mono text-muted-foreground">0m</span>
                    )}
                  </td>
                  {/* Setup count */}
                  <td className="px-4 py-3 font-mono text-foreground">{m.setup_count}</td>
                  {/* Last setup */}
                  <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{fmtDate(m.last_setup)}</td>
                  {/* Drill-down */}
                  <td className="px-4 py-3">
                    <Link
                      href={`/reporting/machines/${m.id}`}
                      className="text-xs font-semibold text-primary hover:underline whitespace-nowrap"
                    >
                      View actions
                    </Link>
                  </td>
                </tr>
                {/* Expanded pause-reason breakdown */}
                {isExpanded && hasPauses && (
                  <tr className="bg-muted/30">
                    <td colSpan={9} className="px-4 py-3">
                      <div className="pl-9">
                        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                          <Pause className="w-3.5 h-3.5" /> Setup pause breakdown by reason
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {m.pause_breakdown.map(r => (
                            <div key={r.label} className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-1.5">
                              <span className="text-sm text-foreground">{r.label}</span>
                              <span className="font-mono text-sm font-semibold text-status-paused">{fmtDuration(r.minutes)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

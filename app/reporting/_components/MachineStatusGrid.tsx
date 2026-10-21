'use client'

import Link from 'next/link'
import { Cpu, User, Clock } from 'lucide-react'

type Session = {
  id: string
  session_type: string
  status: string
  mo_number: string
  started_at: string
  qty_to_make: number | null
  qty_made: number | null
  qty_scrapped: number | null
  user: { display_name: string; role: string } | null
  pause_reason_label: string | null
  activity_started_at: string
  activity_minutes: number
}

type MachineRow = {
  id: string
  machine_code: string
  description: string | null
  is_active: boolean
  session: Session | null
}

function statusLabel(session: Session | null): { label: string; cls: string } {
  if (!session) return { label: 'Idle', cls: 'bg-status-idle/20 text-status-idle' }
  if (session.status === 'PAUSED') return { label: 'Paused', cls: 'bg-status-paused/20 text-status-paused' }
  if (session.session_type === 'SETUP') return { label: 'Setup', cls: 'bg-blue-500/20 text-blue-400' }
  return { label: 'Running', cls: 'bg-status-running/20 text-status-running' }
}

function activityText(session: Session): string {
  if (session.status === 'PAUSED') {
    return session.pause_reason_label ? `Paused: ${session.pause_reason_label}` : 'Paused'
  }
  if (session.session_type === 'SETUP') return 'Setting up'
  if (session.session_type === 'UNMANNED') return 'Unmanned run'
  return 'Running job'
}

function fmtMinutes(mins: number) {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function sinceTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London',
  })
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
    return <p className="text-center text-muted-foreground py-16">No machines found.</p>
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 border-b border-border">
          <tr>
            {['Machine', 'Status', 'Current Activity', 'Operator', 'MO Number', 'Time in Activity', 'Progress', ''].map(h => (
              <th key={h} className="text-left text-xs font-semibold uppercase tracking-widest text-muted-foreground px-4 py-3">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {machines.map(m => {
            const { label, cls } = statusLabel(m.session)
            return (
              <tr key={m.id} className="bg-card hover:bg-muted/30 transition-colors">
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
                {/* Status */}
                <td className="px-4 py-3">
                  <span className={`text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded w-fit inline-block ${cls}`}>
                    {label}
                  </span>
                </td>
                {/* Current activity */}
                <td className="px-4 py-3">
                  {m.session
                    ? <span className="text-foreground">{activityText(m.session)}</span>
                    : <span className="text-muted-foreground">—</span>}
                </td>
                {/* Operator */}
                <td className="px-4 py-3">
                  {m.session ? (
                    <div className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="text-foreground">{m.session.user?.display_name ?? 'Unknown'}</span>
                      <span className="text-xs text-muted-foreground">({m.session.user?.role})</span>
                    </div>
                  ) : <span className="text-muted-foreground">—</span>}
                </td>
                {/* MO Number */}
                <td className="px-4 py-3">
                  {m.session
                    ? <span className="font-mono font-semibold text-foreground">{m.session.mo_number}</span>
                    : <span className="text-muted-foreground">—</span>}
                </td>
                {/* Time in current activity */}
                <td className="px-4 py-3">
                  {m.session ? (
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1.5 text-foreground font-mono font-semibold">
                        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                        {fmtMinutes(m.session.activity_minutes)}
                      </div>
                      <span className="text-[11px] text-muted-foreground pl-5">
                        since {sinceTime(m.session.activity_started_at)}
                      </span>
                    </div>
                  ) : <span className="text-muted-foreground">—</span>}
                </td>
                {/* Progress */}
                <td className="px-4 py-3 min-w-[140px]">
                  {m.session
                    ? <QtyBar made={m.session.qty_made} total={m.session.qty_to_make} scrapped={m.session.qty_scrapped} />
                    : <span className="text-muted-foreground text-xs">—</span>}
                </td>
                {/* Link */}
                <td className="px-4 py-3">
                  <Link
                    href={`/reporting/machines/${m.id}`}
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

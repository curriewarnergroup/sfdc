'use client'

import { Cpu, User, Clock, Shield, Tag, Hash, AlertTriangle } from 'lucide-react'
import { LiveDuration } from './LiveDuration'

type LiveSession = {
  id: string
  session_type: string
  status: string
  mo_number: string
  started_at: string
  qty_to_make: number | null
  qty_made: number | null
  qty_scrapped: number | null
  part_number: string | null
  pause_reason_label: string | null
  user: { id: string; display_name: string; role: string } | null
  authoriser: { id: string; display_name: string } | null
}

type Machine = {
  id: string
  machine_code: string
  description: string | null
  is_active: boolean
  unmanned_threshold_minutes?: number | null
}

function StatusPill({ session }: { session: LiveSession | null }) {
  if (!session) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full bg-muted text-muted-foreground">
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
        Idle
      </span>
    )
  }
  if (session.status === 'PAUSED') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full bg-status-paused/20 text-status-paused">
        <span className="w-1.5 h-1.5 rounded-full bg-status-paused" />
        Paused
      </span>
    )
  }
  if (session.session_type === 'SETUP') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full bg-blue-500/20 text-blue-400">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
        Setup
      </span>
    )
  }
  if (session.session_type === 'UNMANNED') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full bg-amber-500/20 text-amber-400">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
        Unmanned Run
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full bg-status-running/20 text-status-running">
      <span className="w-1.5 h-1.5 rounded-full bg-status-running animate-pulse" />
      Running
    </span>
  )
}

function Stat({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5 p-4 rounded-xl bg-muted/30 border border-border min-w-0">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[11px] font-semibold uppercase tracking-widest">{label}</span>
      </div>
      <div className={`text-sm font-bold text-foreground truncate ${mono ? 'font-mono' : ''}`}>
        {value}
      </div>
    </div>
  )
}

function ProgressBar({ made, total, scrapped }: { made: number | null; total: number | null; scrapped: number | null }) {
  if (!total) return null
  const pct = Math.min(100, Math.round(((made ?? 0) / total) * 100))
  return (
    <div className="flex flex-col gap-2 p-4 rounded-xl bg-muted/30 border border-border">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Hash className="w-3.5 h-3.5 shrink-0" />
        <span className="text-[11px] font-semibold uppercase tracking-widest">Progress</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm font-bold font-mono text-foreground whitespace-nowrap">
          {made ?? 0} / {total}
        </span>
        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs text-muted-foreground font-mono w-8 text-right">{pct}%</span>
      </div>
      {(scrapped ?? 0) > 0 && (
        <p className="text-[11px] text-destructive font-semibold">{scrapped} scrap</p>
      )}
    </div>
  )
}

export function MachineStatusCard({
  machine,
  session,
}: {
  machine: Machine
  session: LiveSession | null
}) {
  return (
    <div className="flex flex-col gap-4 p-6 border-b border-border bg-card/50 print:hidden">

      {/* Header row */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
            <Cpu className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Current Status</p>
            <StatusPill session={session} />
          </div>
        </div>

        {/* Pause reason if paused */}
        {session?.status === 'PAUSED' && session.pause_reason_label && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-status-paused/10 border border-status-paused/30 text-status-paused text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="font-semibold">{session.pause_reason_label}</span>
          </div>
        )}
      </div>

      {/* No session — idle state */}
      {!session && (
        <p className="text-sm text-muted-foreground">No active session. Machine is idle.</p>
      )}

      {/* Active session stats grid */}
      {session && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          <Stat
            icon={<Hash className="w-3.5 h-3.5 shrink-0" />}
            label="MO Number"
            value={session.mo_number}
            mono
          />

          {session.part_number && (
            <Stat
              icon={<Tag className="w-3.5 h-3.5 shrink-0" />}
              label="Part Number"
              value={session.part_number}
              mono
            />
          )}

          <Stat
            icon={<Clock className="w-3.5 h-3.5 shrink-0" />}
            label="Uptime"
            value={<LiveDuration since={session.started_at} />}
            mono
          />

          {session.session_type === 'UNMANNED' ? (
            <Stat
              icon={<Shield className="w-3.5 h-3.5 shrink-0" />}
              label="Authorised By"
              value={session.authoriser?.display_name ?? '—'}
            />
          ) : (
            <Stat
              icon={<User className="w-3.5 h-3.5 shrink-0" />}
              label="Operator"
              value={
                <span>
                  {session.user?.display_name ?? '—'}
                  {session.user?.role && (
                    <span className="ml-1.5 text-[11px] text-muted-foreground font-normal font-sans">
                      {session.user.role}
                    </span>
                  )}
                </span>
              }
            />
          )}

          {/* Progress bar spans wider on larger screens */}
          {(session.qty_to_make != null) && (
            <div className="col-span-2 md:col-span-2">
              <ProgressBar
                made={session.qty_made}
                total={session.qty_to_make}
                scrapped={session.qty_scrapped}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import type { Session } from '@/lib/types'

// ── Elapsed time helpers ───────────────────────────────────────────────────

function useElapsedTick(interval = 10_000) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), interval)
    return () => clearInterval(id)
  }, [interval])
  return tick
}

function formatElapsed(startedAt: string): string {
  const ms = Date.now() - new Date(startedAt).getTime()
  if (ms < 0) return '0m'
  const totalMins = Math.floor(ms / 60_000)
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

// ── Status badge ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const config =
    status === 'ACTIVE'
      ? { cls: 'bg-status-running/15 text-status-running border-status-running/30', label: 'Active' }
      : { cls: 'bg-status-paused/15 text-status-paused border-status-paused/30', label: 'Paused' }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-widest border ${config.cls}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          status === 'ACTIVE' ? 'bg-status-running animate-pulse' : 'bg-status-paused'
        }`}
        aria-hidden="true"
      />
      {config.label}
    </span>
  )
}

// ── Props ──────────────────────────────────────────────────────────────────

interface ActiveSessionListProps {
  sessions: Session[]
  onSelect: (session: Session) => void
  selectedId: string | null
}

// ── Component ──────────────────────────────────────────────────────────────

export function ActiveSessionList({
  sessions,
  onSelect,
  selectedId,
}: ActiveSessionListProps) {
  const tick = useElapsedTick()
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  // Client-side filter by MO number
  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase()
    if (!q) return sessions
    return sessions.filter((s) => s.mo_number.includes(q))
  }, [sessions, search, tick]) // tick triggers re-render for elapsed time

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* ── Controls row ── */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-0">
          <span
            aria-hidden="true"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value.toUpperCase())}
            placeholder="Filter by MO number…"
            autoComplete="off"
            className="w-full h-11 pl-9 pr-4 rounded-xl bg-secondary border border-border text-foreground text-sm font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary transition-colors"
          />
        </div>
      </div>

      {/* ── Session count ── */}
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {filtered.length === 0
          ? 'No active sessions at this station.'
          : `${filtered.length} session${filtered.length !== 1 ? 's' : ''} — tap a row to select`}
      </p>

      {/* ── Session rows ── */}
      <ul className="flex flex-col gap-2" role="list" aria-label="Active setup sessions">
        {filtered.map((session) => {
          const isSelected = session.id === selectedId
          const operatorName =
            session.user?.display_name ?? session.user?.user_code ?? session.user_id
          const machineName =
            session.machine?.description ?? session.machine?.machine_code ?? '—'

          return (
            <li key={session.id}>
              <button
                type="button"
                onClick={() => onSelect(session)}
                aria-pressed={isSelected}
                className={[
                  'w-full text-left rounded-2xl border-2 px-5 py-4 transition-all duration-150 active:scale-[0.99]',
                  isSelected
                    ? 'border-primary/60 bg-primary/10'
                    : 'border-border bg-card hover:border-primary/30 hover:bg-card/80',
                ].join(' ')}
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  {/* Left: key identifiers */}
                  <div className="flex flex-col gap-1.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base font-bold font-mono text-foreground">
                        {session.mo_number}
                      </span>
                      <StatusBadge status={session.status} />
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      <span title="Machine">
                        <span className="font-semibold text-foreground/70">Machine:</span>{' '}
                        {machineName}
                      </span>
                      <span className="text-border" aria-hidden="true">·</span>
                      <span title="Started by">
                        <span className="font-semibold text-foreground/70">Operator:</span>{' '}
                        {operatorName}
                      </span>
                    </div>
                  </div>

                  {/* Right: time info */}
                  <div className="flex flex-col items-end gap-1 shrink-0 text-right">
                    <span
                      className="text-xl font-bold font-mono tabular-nums text-foreground"
                      aria-label={`Elapsed: ${formatElapsed(session.started_at)}`}
                    >
                      {formatElapsed(session.started_at)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Started {formatTime(session.started_at)}
                    </span>
                  </div>
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

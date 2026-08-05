'use client'

import { useState, useCallback } from 'react'
import type { Device, Session, PauseReason } from '@/lib/types'
import { getSetupSessionsForStation, recordTakeoverEvent } from '@/lib/actions/sessions'
import { ActiveSessionList } from './components/ActiveSessionList'
import { TakeoverModal } from './components/TakeoverModal'
import { SessionActions } from './components/SessionActions'

// ── Top-level page state machine ───────────────────────────────────────────
type PagePhase =
  | { kind: 'list' }
  | { kind: 'takeover'; session: Session }
  | { kind: 'actions'; session: Session; actorUserCode: string }

interface SetupManageClientProps {
  device: Device
  initialSessions: Session[]
  pauseReasons: PauseReason[]
}

export function SetupManageClient({
  device,
  initialSessions,
  pauseReasons,
}: SetupManageClientProps) {
  const [sessions, setSessions] = useState<Session[]>(initialSessions)
  const [phase, setPhase] = useState<PagePhase>({ kind: 'list' })

  // ── Refresh session list (this station only) ─────────────────────────────
  const refreshSessions = useCallback(async () => {
    const data = await getSetupSessionsForStation({
      deviceId: device.id,
      allStations: false,
    })
    setSessions(data)
  }, [device.id])

  // ── Session selected → open TakeoverModal ────────────────────────────────
  function handleSelectSession(session: Session) {
    setPhase({ kind: 'takeover', session })
  }

  // ── Takeover resolved ────────────────────────────────────────────────────
  async function handleTakeoverResolved(actorUserCode: string, confirmed: boolean) {
    if (phase.kind !== 'takeover') return
    const { session } = phase

    // Record the takeover event server-side (fire-and-forget; don't block UI)
    const isSameUser =
      session.user?.user_code?.toUpperCase() === actorUserCode.toUpperCase()

    if (!isSameUser) {
      // Only record if this was actually a different user
      recordTakeoverEvent({
        sessionId: session.id,
        actorUserCode,
        deviceId: device.id,
        confirmed,
        originalUserId: session.user_id,
      }).catch(() => {/* non-blocking */})
    }

    if (!confirmed) {
      // User declined — return to list
      setPhase({ kind: 'list' })
      return
    }

    setPhase({ kind: 'actions', session, actorUserCode })
  }

  // ── Action completed → refresh list ─────────────────────────────────────
  async function handleActionDone() {
    setPhase({ kind: 'list' })
    await refreshSessions()
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col items-center min-h-full px-5 py-7 gap-6 max-w-2xl mx-auto w-full">

      {/* Page header */}
      <div className="w-full">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-2 h-8 rounded-full bg-status-paused" aria-hidden="true" />
          <h1 className="text-xl font-bold text-foreground uppercase tracking-widest">
            Active Sessions
          </h1>
        </div>
        <p className="text-sm text-muted-foreground pl-5">
          Select a session to pause, resume, or finish.
        </p>
      </div>

      {/* Session list */}
      {phase.kind === 'list' && (
        <ActiveSessionList
          sessions={sessions}
          onSelect={handleSelectSession}
          selectedId={null}
        />
      )}

      {/* Actions panel — shown after takeover confirmed */}
      {phase.kind === 'actions' && (
        <div className="w-full flex flex-col gap-5">
          {/* Selected session summary card */}
          <SessionSummaryCard session={phase.session} />
          <SessionActions
            session={phase.session}
            actorUserCode={phase.actorUserCode}
            deviceId={device.id}
            pauseReasons={pauseReasons}
            onDone={handleActionDone}
          />
          <button
            type="button"
            onClick={() => setPhase({ kind: 'list' })}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2 self-center"
          >
            Back to list
          </button>
        </div>
      )}

      {/* Takeover modal — renders as overlay */}
      {phase.kind === 'takeover' && (
        <TakeoverModal
          session={phase.session}
          onResolved={handleTakeoverResolved}
          onCancel={() => setPhase({ kind: 'list' })}
        />
      )}
    </div>
  )
}

// ── Session summary card ─────────────────────────────────────────────────

function SessionSummaryCard({ session }: { session: Session }) {
  const statusCls =
    session.status === 'ACTIVE'
      ? 'text-status-running border-status-running/30 bg-status-running/10'
      : 'text-status-paused border-status-paused/30 bg-status-paused/10'

  return (
    <div className={`rounded-2xl border-2 px-5 py-4 ${statusCls}`}>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <span className="text-lg font-bold font-mono">{session.mo_number}</span>
          <span className="text-xs opacity-70">
            {session.machine?.description ?? session.machine?.machine_code ?? '—'} ·{' '}
            {session.user?.display_name ?? session.user?.user_code ?? '—'}
          </span>
        </div>
        <span className="text-xs font-bold uppercase tracking-widest opacity-80">
          {session.status}
        </span>
      </div>
    </div>
  )
}

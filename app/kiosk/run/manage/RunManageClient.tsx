'use client'

import { useState, useCallback } from 'react'
import type { Device, Session, PauseReason } from '@/lib/types'
import { getRunSessionsForStation, recordTakeoverEvent } from '@/lib/actions/sessions'
import { ActiveSessionList } from '@/app/kiosk/setup/manage/components/ActiveSessionList'
import { TakeoverModal } from '@/app/kiosk/setup/manage/components/TakeoverModal'
import { RunSessionActions } from './components/RunSessionActions'

type PagePhase =
  | { kind: 'list' }
  | { kind: 'takeover'; session: Session }
  | { kind: 'actions'; session: Session; actorUserCode: string }

interface RunManageClientProps {
  device: Device
  initialSessions: Session[]
  pauseReasons: PauseReason[]
}

export function RunManageClient({
  device,
  initialSessions,
  pauseReasons,
}: RunManageClientProps) {
  const [sessions, setSessions] = useState<Session[]>(initialSessions)
  const [phase, setPhase] = useState<PagePhase>({ kind: 'list' })

  const refreshSessions = useCallback(async () => {
    const data = await getRunSessionsForStation({
      deviceId: device.id,
      allStations: false,
    })
    setSessions(data)
  }, [device.id])

  function handleSelectSession(session: Session) {
    setPhase({ kind: 'takeover', session })
  }

  async function handleTakeoverResolved(actorUserCode: string, confirmed: boolean) {
    if (phase.kind !== 'takeover') return
    const { session } = phase

    const isSameUser =
      session.user?.user_code?.toUpperCase() === actorUserCode.toUpperCase()

    if (!isSameUser) {
      recordTakeoverEvent({
        sessionId: session.id,
        actorUserCode,
        deviceId: device.id,
        confirmed,
        originalUserId: session.user_id,
      }).catch(() => {})
    }

    if (!confirmed) {
      setPhase({ kind: 'list' })
      return
    }

    setPhase({ kind: 'actions', session, actorUserCode })
  }

  async function handleActionDone() {
    setPhase({ kind: 'list' })
    await refreshSessions()
  }

  return (
    <div className="flex flex-col items-center min-h-full px-5 py-7 gap-6 max-w-2xl mx-auto w-full">

      {/* Page header */}
      <div className="w-full">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-2 h-8 rounded-full bg-status-running" aria-hidden="true" />
          <h1 className="text-xl font-bold text-foreground uppercase tracking-widest">
            Run — Pause / Finish
          </h1>
        </div>
        <p className="text-sm text-muted-foreground pl-5">
          Select a run session to pause, resume, or finish.
        </p>
      </div>

      {phase.kind === 'list' && (
        <ActiveSessionList
          sessions={sessions}
          onSelect={handleSelectSession}
          selectedId={null}
        />
      )}

      {phase.kind === 'actions' && (
        <div className="w-full flex flex-col gap-5">
          <SessionSummaryCard session={phase.session} />
          <RunSessionActions
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

'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { pauseSession, resumeSession, finishSession, redeemQcCode } from '@/lib/actions/sessions'
import type { Session, PauseReason } from '@/lib/types'
import { StatusBadge } from './StatusBadge'
import { LiveClock } from './LiveClock'

interface ActiveSessionViewProps {
  session: Session
  pauseReasons: PauseReason[]
  deviceId: string
}

type Panel = 'none' | 'pause' | 'finish' | 'qc'

export function ActiveSessionView({ session, pauseReasons, deviceId }: ActiveSessionViewProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [panel, setPanel] = useState<Panel>('none')
  const [actorCode, setActorCode] = useState('')
  const [selectedReason, setSelectedReason] = useState('')
  const [notes, setNotes] = useState('')
  const [qcCode, setQcCode] = useState('')
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null)

  const isRunning = session.status === 'ACTIVE'
  const isPaused = session.status === 'PAUSED'
  const user = (session as any).user
  const machine = (session as any).machine

  function reset() {
    setActorCode('')
    setSelectedReason('')
    setNotes('')
    setQcCode('')
    setFeedback(null)
    setPanel('none')
  }

  function handlePause(e: React.FormEvent) {
    e.preventDefault()
    setFeedback(null)
    startTransition(async () => {
      const result = await pauseSession({
        sessionId: session.id,
        actorUserCode: actorCode,
        pauseReasonId: selectedReason,
        deviceId,
      })
      if (result.ok) {
        reset()
        router.refresh()
      } else {
        setFeedback({ ok: false, message: result.error ?? 'Error' })
      }
    })
  }

  function handleResume(e: React.FormEvent) {
    e.preventDefault()
    setFeedback(null)
    startTransition(async () => {
      const result = await resumeSession({ sessionId: session.id, actorUserCode: actorCode, deviceId })
      if (result.ok) {
        reset()
        router.refresh()
      } else {
        setFeedback({ ok: false, message: result.error ?? 'Error' })
      }
    })
  }

  function handleFinish(e: React.FormEvent) {
    e.preventDefault()
    setFeedback(null)
    startTransition(async () => {
      const result = await finishSession({
        sessionId: session.id,
        actorUserCode: actorCode,
        deviceId,
        notes,
      })
      if (result.ok) {
        reset()
        router.refresh()
      } else {
        setFeedback({ ok: false, message: result.error ?? 'Error' })
      }
    })
  }

  function handleQcRedeem(e: React.FormEvent) {
    e.preventDefault()
    setFeedback(null)
    startTransition(async () => {
      const result = await redeemQcCode({
        plainCode: qcCode,
        sessionId: session.id,
        actorUserCode: actorCode,
        deviceId,
      })
      if (result.ok) {
        setFeedback({
          ok: true,
          message: `QC ${result.data?.codeType}: ${result.data?.result}`,
        })
        setQcCode('')
        setTimeout(() => {
          reset()
          router.refresh()
        }, 2500)
      } else {
        setFeedback({ ok: false, message: result.error ?? 'Error' })
      }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Session info card */}
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
              {session.session_type} Session
            </p>
            <p className="text-2xl font-bold text-foreground font-mono">{session.mo_number}</p>
          </div>
          <StatusBadge status={session.status} />
        </div>

        <div className="grid grid-cols-2 gap-4 mb-5">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Machine</p>
            <p className="font-bold text-foreground">{machine?.machine_code ?? '—'}</p>
            {machine?.description && <p className="text-xs text-muted-foreground">{machine.description}</p>}
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Operator</p>
            <p className="font-bold text-foreground">{user?.display_name ?? '—'}</p>
            <p className="text-xs text-muted-foreground font-mono">{user?.user_code}</p>
          </div>
        </div>

        <div className="flex flex-col items-center py-3 border-t border-border">
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Elapsed Time</p>
          <LiveClock startedAt={session.started_at} />
        </div>
      </div>

      {/* Action buttons */}
      {panel === 'none' && (
        <div className="grid grid-cols-2 gap-3">
          {isRunning && (
            <button
              onClick={() => setPanel('pause')}
              className="h-16 rounded-xl bg-status-paused/20 border border-status-paused/40 text-status-paused font-bold text-base uppercase tracking-widest hover:bg-status-paused/30 transition-colors"
            >
              Pause
            </button>
          )}
          {isPaused && (
            <button
              onClick={() => setPanel('resume')}
              className="h-16 rounded-xl bg-status-running/20 border border-status-running/40 text-status-running font-bold text-base uppercase tracking-widest hover:bg-status-running/30 transition-colors"
            >
              Resume
            </button>
          )}
          <button
            onClick={() => setPanel('qc')}
            className="h-16 rounded-xl bg-primary/20 border border-primary/40 text-primary font-bold text-base uppercase tracking-widest hover:bg-primary/30 transition-colors"
          >
            QC Code
          </button>
          <button
            onClick={() => setPanel('finish')}
            className="h-16 rounded-xl bg-status-error/20 border border-status-error/40 text-status-error font-bold text-base uppercase tracking-widest hover:bg-status-error/30 transition-colors col-span-full"
          >
            Finish Session
          </button>
        </div>
      )}

      {/* Pause panel */}
      {panel === 'pause' && (
        <form onSubmit={handlePause} className="bg-card rounded-xl border border-border p-5 space-y-4">
          <h3 className="font-bold text-base uppercase tracking-widest text-status-paused">Pause Session</h3>
          <PanelCodeInput value={actorCode} onChange={setActorCode} />
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              Pause Reason
            </label>
            <div className="grid grid-cols-2 gap-2">
              {pauseReasons.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedReason(r.id)}
                  className={`h-12 rounded-lg text-sm font-semibold transition-colors ${
                    selectedReason === r.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <FeedbackBanner feedback={feedback} />
          <PanelActions onCancel={reset} disabled={pending || !actorCode || !selectedReason} label="Pause" />
        </form>
      )}

      {/* Resume panel */}
      {panel === 'resume' && (
        <form onSubmit={handleResume} className="bg-card rounded-xl border border-border p-5 space-y-4">
          <h3 className="font-bold text-base uppercase tracking-widest text-status-running">Resume Session</h3>
          <PanelCodeInput value={actorCode} onChange={setActorCode} />
          <FeedbackBanner feedback={feedback} />
          <PanelActions onCancel={reset} disabled={pending || !actorCode} label="Resume" />
        </form>
      )}

      {/* Finish panel */}
      {panel === 'finish' && (
        <form onSubmit={handleFinish} className="bg-card rounded-xl border border-border p-5 space-y-4">
          <h3 className="font-bold text-base uppercase tracking-widest text-status-error">Finish Session</h3>
          <PanelCodeInput value={actorCode} onChange={setActorCode} />
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-4 py-3 rounded-lg bg-background border border-border text-foreground text-base focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>
          <FeedbackBanner feedback={feedback} />
          <PanelActions onCancel={reset} disabled={pending || !actorCode} label="Finish" destructive />
        </form>
      )}

      {/* QC Code panel */}
      {panel === 'qc' && (
        <form onSubmit={handleQcRedeem} className="bg-card rounded-xl border border-border p-5 space-y-4">
          <h3 className="font-bold text-base uppercase tracking-widest text-primary">Redeem QC Code</h3>
          <PanelCodeInput value={actorCode} onChange={setActorCode} label="Your Operator Code" />
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              QC Code
            </label>
            <input
              type="text"
              autoComplete="off"
              autoCapitalize="characters"
              value={qcCode}
              onChange={(e) => setQcCode(e.target.value.toUpperCase())}
              placeholder="8-char code from QC"
              required
              className="w-full h-14 px-4 rounded-lg bg-background border border-border text-foreground text-xl placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono tracking-widest"
            />
          </div>
          <FeedbackBanner feedback={feedback} />
          <PanelActions onCancel={reset} disabled={pending || !actorCode || !qcCode} label="Redeem" />
        </form>
      )}
    </div>
  )
}

// ── Shared sub-components ───────────────────────────────────────────────

function PanelCodeInput({
  value,
  onChange,
  label = 'Your Operator Code',
}: {
  value: string
  onChange: (v: string) => void
  label?: string
}) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
        {label}
      </label>
      <input
        type="text"
        autoComplete="off"
        autoCapitalize="characters"
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        placeholder="e.g. OP001"
        required
        className="w-full h-14 px-4 rounded-lg bg-background border border-border text-foreground text-lg placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
      />
    </div>
  )
}

function FeedbackBanner({ feedback }: { feedback: { ok: boolean; message: string } | null }) {
  if (!feedback) return null
  return (
    <p
      className={`text-sm rounded-lg px-4 py-3 border ${
        feedback.ok
          ? 'text-status-running bg-status-running/10 border-status-running/30'
          : 'text-destructive-foreground bg-destructive/20 border-destructive/30'
      }`}
    >
      {feedback.message}
    </p>
  )
}

function PanelActions({
  onCancel,
  disabled,
  label,
  destructive,
}: {
  onCancel: () => void
  disabled: boolean
  label: string
  destructive?: boolean
}) {
  return (
    <div className="flex gap-3 pt-1">
      <button
        type="button"
        onClick={onCancel}
        className="flex-1 h-12 rounded-lg bg-secondary text-secondary-foreground font-semibold hover:bg-secondary/80 transition-colors"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={disabled}
        className={`flex-1 h-12 rounded-lg font-bold uppercase tracking-widest disabled:opacity-40 transition-opacity ${
          destructive
            ? 'bg-destructive text-white'
            : 'bg-primary text-primary-foreground'
        }`}
      >
        {label}
      </button>
    </div>
  )
}

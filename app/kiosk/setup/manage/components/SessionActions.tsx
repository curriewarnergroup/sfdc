'use client'

import { useState, useTransition, useRef } from 'react'
import type { Session, PauseReason } from '@/lib/types'
import {
  pauseSession,
  resumeSession,
  finishSetupSession,
  cancelSetupSession,
  signOffJob,
} from '@/lib/actions/sessions'
import { ScanInput, type ScanInputHandle } from '@/components/kiosk/ScanInput'
import { BigButton } from '@/components/kiosk/BigButton'
import { ReasonPicker } from './ReasonPicker'

type ActionView = 'choose' | 'pause' | 'finish' | 'cancel' | 'sign-off' | 'success'

interface SessionActionsProps {
  session: Session
  actorUserCode: string
  deviceId: string
  pauseReasons: PauseReason[]
  onDone: () => void   // called after any successful action
}

/**
 * SessionActions — shown after the operator has scanned in and confirmed.
 * Presents Pause / Finish (FIRST_OFF code required) / Resume (if paused).
 */
export function SessionActions({
  session,
  actorUserCode,
  deviceId,
  pauseReasons,
  onDone,
}: SessionActionsProps) {
  const [view, setView] = useState<ActionView>('choose')
  const [successMsg, setSuccessMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [selectedReasonId, setSelectedReasonId] = useState<string | null>(null)
  const [qcCode, setQcCode] = useState('')
  const [supervisorCode, setSupervisorCode] = useState('')
  const [pending, startTransition] = useTransition()
  const qcRef = useRef<ScanInputHandle>(null)
  const supervisorRef = useRef<ScanInputHandle>(null)
  const [signOffCode, setSignOffCode] = useState('')
  const signOffRef = useRef<ScanInputHandle>(null)

  const isPaused = session.status === 'PAUSED'

  function clearError() {
    setErrorMsg('')
  }

  // ── SIGN OFF JOB (setter handover) ───────────────────────────────────────
  function handleSignOff() {
    if (!signOffCode.trim()) {
      setErrorMsg('Please scan or enter your PIN.')
      return
    }
    clearError()
    startTransition(async () => {
      const res = await signOffJob({
        sessionId: session.id,
        actorUserCode: signOffCode.trim(),
        deviceId,
      })
      if (res.ok) {
        // Setup stays live on this machine — hard-navigate home for a fresh load
        // (avoids the transition deadlock caused by router.push + refresh).
        window.location.assign('/kiosk')
      } else {
        setErrorMsg(res.error ?? 'Failed to sign off the job.')
      }
    })
  }

  // ── PAUSE ──────────────────────────────────────────────────────────────
  function handlePause() {
    if (!selectedReasonId) {
      setErrorMsg('Please select a pause reason before continuing.')
      return
    }
    clearError()
    startTransition(async () => {
      const res = await pauseSession({
        sessionId: session.id,
        actorUserCode,
        pauseReasonId: selectedReasonId,
        deviceId,
      })
      if (res.ok) {
        // Straight back to the kiosk home (hard nav for a guaranteed fresh load).
        window.location.assign('/kiosk')
      } else {
        setErrorMsg(res.error ?? 'Failed to pause session.')
      }
    })
  }

  // ── RESUME ─────────────────────────────────────────────────────────────
  function handleResume() {
    clearError()
    startTransition(async () => {
      const res = await resumeSession({
        sessionId: session.id,
        actorUserCode,
        deviceId,
      })
      if (res.ok) {
        setSuccessMsg('Session resumed successfully.')
        setView('success')
      } else {
        setErrorMsg(res.error ?? 'Failed to resume session.')
      }
    })
  }

  // ── FINISH ─────────────────────────────────────────────────────────────
  function handleFinish() {
    if (!qcCode.trim()) {
      setErrorMsg('Please scan or enter the First-Off QC code.')
      return
    }
    clearError()
    startTransition(async () => {
      const res = await finishSetupSession({
        sessionId: session.id,
        actorUserCode,
        deviceId,
        qcCode: qcCode.trim(),
      })
      if (res.ok) {
        setSuccessMsg('Setup complete. First-off approved.')
        setView('success')
      } else {
        setErrorMsg(res.error ?? 'Failed to finish session.')
      }
    })
  }

  // ── CANCEL SETUP (supervisor / admin only) ──────────────────────────────
  function handleCancel() {
    if (!supervisorCode.trim()) {
      setErrorMsg('Please scan a supervisor or admin code.')
      return
    }
    clearError()
    startTransition(async () => {
      const res = await cancelSetupSession({
        sessionId: session.id,
        supervisorCode: supervisorCode.trim(),
        deviceId,
      })
      if (res.ok) {
        setSuccessMsg('Setup cancelled. The machine is free for a new setup.')
        setView('success')
      } else {
        setErrorMsg(res.error ?? 'Failed to cancel setup.')
      }
    })
  }

  // ── Success ────────────────────────────────────────────────────────────
  if (view === 'success') {
    return (
      <div className="flex flex-col items-center gap-6 py-4">
        <div className="w-14 h-14 rounded-full bg-status-running/20 flex items-center justify-center">
          <svg className="w-7 h-7 text-status-running" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <div className="text-center">
          <h2 className="text-lg font-bold text-status-running uppercase tracking-widest mb-1">Done</h2>
          <p className="text-sm text-muted-foreground">{successMsg}</p>
        </div>
        <BigButton variant="secondary" onClick={onDone} className="w-full">
          Back to List
        </BigButton>
      </div>
    )
  }

  // ── Shared error banner ────────────────────────────────────────────────
  const ErrorBanner = errorMsg ? (
    <div
      role="alert"
      aria-live="assertive"
      className="flex items-start gap-3 px-4 py-3 rounded-xl bg-status-error/10 border border-status-error/30 text-status-error text-sm font-semibold"
    >
      <svg className="w-4 h-4 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
      {errorMsg}
    </div>
  ) : null

  // ── Pause view ─────────────────────────────────────────────────────────
  if (view === 'pause') {
    return (
      <div className="flex flex-col gap-5">
        <SectionHeader
          title="Pause Session"
          onBack={() => { setView('choose'); clearError() }}
        />
        <p className="text-sm text-muted-foreground">Select a reason for pausing:</p>
        <ReasonPicker
          reasons={pauseReasons}
          selected={selectedReasonId}
          onSelect={(id) => { setSelectedReasonId(id); clearError() }}
          disabled={pending}
        />
        {ErrorBanner}
        <BigButton
          variant="warning"
          loading={pending}
          disabled={!selectedReasonId}
          onClick={handlePause}
          className="w-full"
        >
          Confirm Pause
        </BigButton>
      </div>
    )
  }

  // ── Finish view ────────────────────────────────────────────────────────
  if (view === 'finish') {
    return (
      <div className="flex flex-col gap-5">
        <SectionHeader
          title="Finish Setup"
          onBack={() => { setView('choose'); clearError() }}
        />
        <p className="text-sm text-muted-foreground">
          Scan or enter the <strong className="text-foreground">First-Off QC code</strong> from
          the QC console to complete setup.
        </p>
        <ScanInput
          ref={qcRef}
          label="First-Off QC Code"
          value={qcCode}
          onChange={setQcCode}
          onConfirm={handleFinish}
          placeholder="Scan or type code…"
          autoFocus
          disabled={pending}
          hint="8-character code issued by QC — expires in 30 min"
        />
        {ErrorBanner}
        <BigButton
          variant="success"
          loading={pending}
          disabled={!qcCode.trim()}
          onClick={handleFinish}
          className="w-full"
        >
          Finish Setup
        </BigButton>
      </div>
    )
  }

  // ── Sign Off Job view (setter handover) ──────────────────────────────────
  if (view === 'sign-off') {
    return (
      <div className="flex flex-col gap-5">
        <SectionHeader
          title="Sign Off Job"
          onBack={() => { setView('choose'); clearError(); setSignOffCode('') }}
        />
        <div className="px-4 py-3 rounded-xl bg-secondary border border-border text-xs text-muted-foreground">
          This signs you off the setup but keeps it live on this machine. The next
          setter can sign on from the home screen to continue.
        </div>
        <ScanInput
          ref={signOffRef}
          label="Your PIN"
          value={signOffCode}
          onChange={setSignOffCode}
          onConfirm={handleSignOff}
          placeholder="Scan badge or enter PIN…"
          autoFocus
          disabled={pending}
        />
        {ErrorBanner}
        <BigButton
          variant="warning"
          loading={pending}
          disabled={!signOffCode.trim()}
          onClick={handleSignOff}
          className="w-full"
        >
          Confirm Sign Off
        </BigButton>
      </div>
    )
  }

  // ── Cancel view (supervisor / admin) ────────────────────────────────────
  if (view === 'cancel') {
    return (
      <div className="flex flex-col gap-5">
        <SectionHeader
          title="Cancel Setup"
          onBack={() => { setView('choose'); clearError(); setSupervisorCode('') }}
        />
        <div className="px-4 py-3 rounded-xl bg-status-error/10 border border-status-error/30 text-xs text-status-error font-semibold">
          This abandons the setup without a First-Off. A SUPERVISOR or ADMIN code
          is required. The machine will be freed for a new setup.
        </div>
        <ScanInput
          ref={supervisorRef}
          label="Supervisor / Admin Code"
          value={supervisorCode}
          onChange={setSupervisorCode}
          onConfirm={handleCancel}
          placeholder="Scan supervisor badge…"
          autoFocus
          disabled={pending}
          hint="Must be SUPERVISOR or ADMIN role"
        />
        {ErrorBanner}
        <BigButton
          variant="danger"
          loading={pending}
          disabled={!supervisorCode.trim()}
          onClick={handleCancel}
          className="w-full"
        >
          Confirm Cancel Setup
        </BigButton>
      </div>
    )
  }

  // ── Choose view (default) ──────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      <div className="px-4 py-3 rounded-xl bg-secondary border border-border text-xs text-muted-foreground">
        Acting as: <span className="font-bold font-mono text-foreground">{actorUserCode}</span>
        {' '}on MO{' '}
        <span className="font-bold font-mono text-foreground">{session.mo_number}</span>
      </div>

      {ErrorBanner}

      {/* Resume — only for PAUSED sessions */}
      {isPaused && (
        <BigButton
          variant="success"
          loading={pending}
          onClick={handleResume}
          sublabel="Return this session to Active"
          className="w-full"
          icon={
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          }
        >
          Resume
        </BigButton>
      )}

      {/* Pause — only for ACTIVE sessions */}
      {!isPaused && (
        <BigButton
          variant="warning"
          onClick={() => { clearError(); setView('pause') }}
          sublabel="Choose a reason on next screen"
          className="w-full"
          icon={
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          }
        >
          Pause
        </BigButton>
      )}

      {/* Sign Off Job — setter handover, keeps the setup live */}
      <BigButton
        variant="secondary"
        onClick={() => { clearError(); setSignOffCode(''); setView('sign-off') }}
        sublabel="Hand over to the next setter"
        className="w-full"
        icon={
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        }
      >
        Sign Off Job
      </BigButton>

      {/* Finish — requires FIRST_OFF code */}
      <BigButton
        variant="danger"
        onClick={() => { clearError(); setView('finish') }}
        sublabel="Requires First-Off QC code"
        className="w-full"
        icon={
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        }
      >
        Finish Setup
      </BigButton>

      {/* Cancel Setup — supervisor / admin code required */}
      <button
        type="button"
        onClick={() => { clearError(); setSupervisorCode(''); setView('cancel') }}
        className="mt-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground hover:text-status-error transition-colors"
      >
        Cancel Setup (Supervisor)
      </button>
    </div>
  )
}

// ── SectionHeader ──────────────────────────────────────────────────────────

function SectionHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onBack}
        className="w-8 h-8 flex items-center justify-center rounded-lg bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Back"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 12H5" />
          <path d="M12 19l-7-7 7-7" />
        </svg>
      </button>
      <h3 className="text-base font-bold uppercase tracking-widest text-foreground">{title}</h3>
    </div>
  )
}

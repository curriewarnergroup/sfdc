'use client'

import { useState, useTransition, useRef } from 'react'
import type { Session, PauseReason } from '@/lib/types'
import { pauseSession, resumeSession, finishRunSession, authoriseUnmannedRun, convertToMannedRun, supervisorPauseUnmannedSession, supervisorResumeUnmannedSession, signOffJob } from '@/lib/actions/sessions'
import { ScanInput, type ScanInputHandle } from '@/components/kiosk/ScanInput'
import { BigButton } from '@/components/kiosk/BigButton'
import { ReasonPicker } from '@/app/kiosk/setup/manage/components/ReasonPicker'

type ActionView = 'choose' | 'pause' | 'finish' | 'go-unmanned' | 'go-manned' | 'supervisor-pause' | 'supervisor-resume' | 'sign-off' | 'success'

interface RunSessionActionsProps {
  session: Session
  actorUserCode: string
  deviceId: string
  pauseReasons: PauseReason[]
  onDone: () => void
}

export function RunSessionActions({
  session,
  actorUserCode,
  deviceId,
  pauseReasons,
  onDone,
}: RunSessionActionsProps) {
  const [view, setView] = useState<ActionView>('choose')
  const [successMsg, setSuccessMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [selectedReasonId, setSelectedReasonId] = useState<string | null>(null)
  const [qcCode, setQcCode] = useState('')
  const [pending, startTransition] = useTransition()
  const qcRef = useRef<ScanInputHandle>(null)

  const isPaused = session.status === 'PAUSED'
  const isUnmanned = session.session_type === 'UNMANNED'
  const [supervisorCode, setSupervisorCode] = useState('')
  const supervisorRef = useRef<ScanInputHandle>(null)
  const [signOffCode, setSignOffCode] = useState('')
  const signOffRef = useRef<ScanInputHandle>(null)

  function clearError() { setErrorMsg('') }

  // ── SIGN OFF JOB (operator/setter handover) ──────────────────────────────
  function handleSignOff() {
    if (!signOffCode.trim()) { setErrorMsg('Please scan or enter your PIN.'); return }
    clearError()
    startTransition(async () => {
      const res = await signOffJob({
        sessionId: session.id,
        actorUserCode: signOffCode.trim(),
        deviceId,
      })
      if (res.ok) {
        // Job stays live on this machine — hard-navigate home for a fresh load
        // (avoids the transition deadlock caused by router.push + refresh).
        window.location.assign('/kiosk')
      } else {
        setErrorMsg(res.error ?? 'Failed to sign off the job.')
      }
    })
  }

  // ── GO UNMANNED ─────────────────────────────────────────────────────────
  function handleGoUnmanned() {
    if (!supervisorCode.trim()) { setErrorMsg('Please scan a supervisor or admin code.'); return }
    clearError()
    startTransition(async () => {
      const res = await authoriseUnmannedRun({
        deviceId,
        supervisorCode: supervisorCode.trim(),
        machineId: session.machine?.id ?? '',
        moNumber: session.mo_number ?? '',
      })
      if (res.ok) {
        setSuccessMsg(`Run converted to unmanned. Authorised by ${supervisorCode.trim()}.`)
        setView('success')
      } else {
        setErrorMsg(res.error ?? 'Failed to convert to unmanned.')
      }
    })
  }

  // ── GO MANNED ──────────────────────────────────────────────────────────
  function handleGoManned() {
    clearError()
    startTransition(async () => {
      const res = await convertToMannedRun({ sessionId: session.id, actorUserCode, deviceId })
      if (res.ok) {
        setSuccessMsg('Run converted back to manned. Operator scan required to continue.')
        setView('success')
      } else {
        setErrorMsg(res.error ?? 'Failed to convert to manned.')
      }
    })
  }

  // ── SUPERVISOR PAUSE (unmanned) ────────────────────────────────────────
  function handleSupervisorPause() {
    if (!supervisorCode.trim()) { setErrorMsg('Please scan a supervisor or admin code.'); return }
    if (!selectedReasonId) { setErrorMsg('Please select a pause reason.'); return }
    clearError()
    startTransition(async () => {
      const res = await supervisorPauseUnmannedSession({
        sessionId: session.id,
        supervisorCode: supervisorCode.trim(),
        pauseReasonId: selectedReasonId,
        deviceId,
      })
      if (res.ok) {
        setSuccessMsg('Unmanned run paused by supervisor.')
        setView('success')
      } else {
        setErrorMsg(res.error ?? 'Failed to pause.')
      }
    })
  }

  // ── SUPERVISOR RESUME (unmanned) ───────────────────────────────────────
  function handleSupervisorResume() {
    if (!supervisorCode.trim()) { setErrorMsg('Please scan a supervisor or admin code.'); return }
    clearError()
    startTransition(async () => {
      const res = await supervisorResumeUnmannedSession({
        sessionId: session.id,
        supervisorCode: supervisorCode.trim(),
        deviceId,
      })
      if (res.ok) {
        setSuccessMsg('Unmanned run resumed.')
        setView('success')
      } else {
        setErrorMsg(res.error ?? 'Failed to resume.')
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
      const res = await resumeSession({ sessionId: session.id, actorUserCode, deviceId })
      if (res.ok) {
        setSuccessMsg('Run resumed successfully.')
        setView('success')
      } else {
        setErrorMsg(res.error ?? 'Failed to resume session.')
      }
    })
  }

  // ── FINISH (LAST_OFF) ──────────────────────────────────────────────────
  function handleFinish() {
    if (!qcCode.trim()) {
      setErrorMsg('Please scan or enter the Last-Off QC code.')
      return
    }
    clearError()
    startTransition(async () => {
      const res = await finishRunSession({
        sessionId: session.id,
        actorUserCode,
        deviceId,
        qcCode: qcCode.trim(),
      })
      if (res.ok) {
        setSuccessMsg('Run complete. Last-off recorded.')
        setView('success')
      } else {
        setErrorMsg(res.error ?? 'Failed to finish run.')
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

  // ── Supervisor Pause view (unmanned) ──────────────────────────────────
  if (view === 'supervisor-pause') {
    return (
      <div className="flex flex-col gap-5">
        <SectionHeader title="Supervisor Pause" onBack={() => { setView('choose'); clearError(); setSupervisorCode(''); setSelectedReasonId(null) }} />
        <div className="px-4 py-3 rounded-xl bg-amber-400/10 border border-amber-400/30 text-xs text-amber-300">
          A supervisor or admin code is required to pause an unmanned run.
        </div>
        <ScanInput
          ref={supervisorRef}
          label="Supervisor / Admin Code"
          value={supervisorCode}
          onChange={setSupervisorCode}
          onConfirm={handleSupervisorPause}
          placeholder="Scan supervisor badge…"
          autoFocus
          disabled={pending}
          hint="Must be SUPERVISOR or ADMIN role"
        />
        <p className="text-sm text-muted-foreground">Select a pause reason:</p>
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
          disabled={!supervisorCode.trim() || !selectedReasonId}
          onClick={handleSupervisorPause}
          className="w-full"
        >
          Confirm Pause
        </BigButton>
      </div>
    )
  }

  // ── Supervisor Resume view (unmanned paused) ───────────────────────────
  if (view === 'supervisor-resume') {
    return (
      <div className="flex flex-col gap-5">
        <SectionHeader title="Supervisor Resume" onBack={() => { setView('choose'); clearError(); setSupervisorCode('') }} />
        <div className="px-4 py-3 rounded-xl bg-muted/40 border border-border text-xs text-muted-foreground">
          A supervisor or admin code is required to resume this unmanned run.
        </div>
        <ScanInput
          ref={supervisorRef}
          label="Supervisor / Admin Code"
          value={supervisorCode}
          onChange={setSupervisorCode}
          onConfirm={handleSupervisorResume}
          placeholder="Scan supervisor badge…"
          autoFocus
          disabled={pending}
          hint="Must be SUPERVISOR or ADMIN role"
        />
        {ErrorBanner}
        <BigButton
          variant="success"
          loading={pending}
          disabled={!supervisorCode.trim()}
          onClick={handleSupervisorResume}
          className="w-full"
        >
          Confirm Resume
        </BigButton>
      </div>
    )
  }

  // ── Go Unmanned view ───────────────────────────────────────────────────
  if (view === 'go-unmanned') {
    return (
      <div className="flex flex-col gap-5">
        <SectionHeader title="Go Unmanned" onBack={() => { setView('choose'); clearError() }} />
        <div className="px-4 py-3 rounded-xl bg-blue-400/10 border border-blue-400/30 text-xs text-blue-300">
          Converts this run to unmanned. A supervisor or admin must authorise. The session stays open — no new session is created.
        </div>
        <ScanInput
          ref={supervisorRef}
          label="Supervisor / Admin Code"
          value={supervisorCode}
          onChange={setSupervisorCode}
          onConfirm={handleGoUnmanned}
          placeholder="Scan supervisor badge…"
          autoFocus
          disabled={pending}
          hint="Must be SUPERVISOR or ADMIN role"
        />
        {ErrorBanner}
        <BigButton
          variant="secondary"
          loading={pending}
          disabled={!supervisorCode.trim()}
          onClick={handleGoUnmanned}
          className="w-full"
          icon={
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          }
        >
          Confirm Go Unmanned
        </BigButton>
      </div>
    )
  }

  // ── Go Manned view ─────────────────────────────────────────────────────
  if (view === 'go-manned') {
    return (
      <div className="flex flex-col gap-5">
        <SectionHeader title="Go Manned" onBack={() => { setView('choose'); clearError() }} />
        <div className="px-4 py-3 rounded-xl bg-muted/40 border border-border text-xs text-muted-foreground">
          Converts this run back to manned. The session stays open — the next operator to scan in will take over.
        </div>
        {ErrorBanner}
        <BigButton
          variant="success"
          loading={pending}
          onClick={handleGoManned}
          className="w-full"
          icon={
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
            </svg>
          }
        >
          Confirm Go Manned
        </BigButton>
      </div>
    )
  }

  // ── Sign Off Job view (handover) ─────────────────────────────────────────
  if (view === 'sign-off') {
    return (
      <div className="flex flex-col gap-5">
        <SectionHeader title="Sign Off Job" onBack={() => { setView('choose'); clearError(); setSignOffCode('') }} />
        <div className="px-4 py-3 rounded-xl bg-secondary border border-border text-xs text-muted-foreground">
          This signs you off the job but keeps it live on this machine. The next
          operator can sign on from the home screen to continue running it.
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

  // ── Pause view ─────────────────────────────────────────────────────────
  if (view === 'pause') {
    return (
      <div className="flex flex-col gap-5">
        <SectionHeader title="Pause Run" onBack={() => { setView('choose'); clearError() }} />
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
        <SectionHeader title="Finish Run" onBack={() => { setView('choose'); clearError() }} />
        <p className="text-sm text-muted-foreground">
          Scan or enter the{' '}
          <strong className="text-foreground">Last-Off QC code</strong> issued by
          QC to close this run.
        </p>
        <ScanInput
          ref={qcRef}
          label="Last-Off QC Code"
          value={qcCode}
          onChange={setQcCode}
          onConfirm={handleFinish}
          placeholder="Scan or type code…"
          autoFocus
          disabled={pending}
          hint="8-character code issued by QC — expires in 30 min, bound to this MO + machine"
        />
        {ErrorBanner}
        <BigButton
          variant="success"
          loading={pending}
          disabled={!qcCode.trim()}
          onClick={handleFinish}
          className="w-full"
        >
          Finish Run
        </BigButton>
      </div>
    )
  }

  // ── Choose view ────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      <div className="px-4 py-3 rounded-xl bg-secondary border border-border text-xs text-muted-foreground">
        Acting as:{' '}
        <span className="font-bold font-mono text-foreground">{actorUserCode}</span>
        {' '}on MO{' '}
        <span className="font-bold font-mono text-foreground">{session.mo_number}</span>
      </div>

      {ErrorBanner}

      {/* Resume — paused manned session */}
      {isPaused && !isUnmanned && (
        <BigButton
          variant="success"
          loading={pending}
          onClick={handleResume}
          sublabel="Return this run to Active"
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

      {/* Supervisor Resume — paused unmanned session */}
      {isPaused && isUnmanned && (
        <BigButton
          variant="success"
          onClick={() => { clearError(); setSupervisorCode(''); setView('supervisor-resume') }}
          sublabel="Supervisor code required"
          className="w-full"
          icon={
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          }
        >
          Resume (Supervisor)
        </BigButton>
      )}

      {/* Pause — active manned session */}
      {!isPaused && !isUnmanned && (
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

      {/* Supervisor Pause — active unmanned session */}
      {!isPaused && isUnmanned && (
        <BigButton
          variant="warning"
          onClick={() => { clearError(); setSupervisorCode(''); setSelectedReasonId(null); setView('supervisor-pause') }}
          sublabel="Supervisor code required"
          className="w-full"
          icon={
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          }
        >
          Pause (Supervisor)
        </BigButton>
      )}

      {/* Sign Off Job — operator/setter handover, keeps the job live */}
      {!isUnmanned && (
        <BigButton
          variant="secondary"
          onClick={() => { clearError(); setSignOffCode(''); setView('sign-off') }}
          sublabel="Hand over to the next operator"
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
      )}

      {/* Go Unmanned — only for manned active sessions */}
      {!isUnmanned && !isPaused && (
        <BigButton
          variant="secondary"
          onClick={() => { clearError(); setSupervisorCode(''); setView('go-unmanned') }}
          sublabel="Supervisor authorisation required"
          className="w-full"
          icon={
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          }
        >
          Go Unmanned
        </BigButton>
      )}

      {/* Go Manned — only for unmanned sessions */}
      {isUnmanned && (
        <BigButton
          variant="success"
          onClick={() => { clearError(); setView('go-manned') }}
          sublabel="Convert back to operator-manned run"
          className="w-full"
          icon={
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
            </svg>
          }
        >
          Go Manned
        </BigButton>
      )}

      {/* Finish — requires LAST_OFF code */}
      <BigButton
        variant="danger"
        onClick={() => { clearError(); setView('finish') }}
        sublabel="Requires Last-Off QC code"
        className="w-full"
        icon={
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="9" y1="9" x2="15" y2="15" />
            <line x1="15" y1="9" x2="9" y2="15" />
          </svg>
        }
      >
        Finish Run
      </BigButton>
    </div>
  )
}

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

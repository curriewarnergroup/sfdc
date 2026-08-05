'use client'

import { useState, useTransition, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { startSession, authoriseUnmannedRun } from '@/lib/actions/sessions'
import { ScanInput, type ScanInputHandle } from '@/components/kiosk/ScanInput'
import { BigButton } from '@/components/kiosk/BigButton'
import type { Device } from '@/lib/types'

interface RunStartClientProps {
  device: Device
}

type Step = 'form' | 'unmanned' | 'success' | 'error'

export function RunStartClient({ device }: RunStartClientProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [userId, setUserId] = useState('')
  const [moNumber, setMoNumber] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [step, setStep] = useState<Step>('form')
  const [confirmedSession, setConfirmedSession] = useState<{
    moNumber: string
    machineCode: string
    userId: string
  } | null>(null)

  const moRef = useRef<ScanInputHandle>(null)
  const unmannedMoRef = useRef<ScanInputHandle>(null)

  // First-off supervisor override state
  const [overrideCode, setOverrideCode] = useState('')

  // Unmanned run state
  const [unmannedSuperCode, setUnmannedSuperCode] = useState('')
  const [unmannedMo, setUnmannedMo] = useState('')
  // If there's already an active session on this machine, we convert it — store the existing MO
  const [existingActiveMo, setExistingActiveMo] = useState<string | null>(null)

  const canSubmit = userId.trim().length > 0 && moNumber.trim().length > 0
  const canSubmitUnmanned = unmannedSuperCode.trim().length > 0 && (existingActiveMo || unmannedMo.trim().length > 0)
  const noMachine = !device.machine_id
  const isFirstOffBlocked = errorMsg.toLowerCase().includes('first-off')

  const handleCommence = useCallback(() => {
    if (!canSubmit || noMachine) return
    setErrorMsg('')

    startTransition(async () => {
      const result = await startSession({
        deviceId: device.id,
        userCode: userId.trim(),
        machineId: device.machine_id!,
        moNumber: moNumber.trim(),
        sessionType: 'RUN',
      })

      if (result.ok) {
        setConfirmedSession({
          moNumber: moNumber.trim(),
          machineCode: device.machine?.machine_code ?? device.machine_id!,
          userId: userId.trim(),
        })
        setStep('success')
      } else {
        setErrorMsg(result.error ?? 'Failed to start run session.')
        setStep('error')
      }
    })
  }, [canSubmit, noMachine, device, userId, moNumber])

  const handleOverrideStart = useCallback(() => {
    if (!canSubmit || noMachine || !overrideCode.trim()) return
    setErrorMsg('')

    startTransition(async () => {
      const result = await startSession({
        deviceId: device.id,
        userCode: userId.trim(),
        machineId: device.machine_id!,
        moNumber: moNumber.trim(),
        sessionType: 'RUN',
        supervisorOverrideCode: overrideCode.trim(),
      })

      if (result.ok) {
        setConfirmedSession({
          moNumber: moNumber.trim(),
          machineCode: device.machine?.machine_code ?? device.machine_id!,
          userId: userId.trim(),
        })
        setStep('success')
      } else {
        setErrorMsg(result.error ?? 'Failed to start run session.')
        setStep('error')
      }
    })
  }, [canSubmit, noMachine, device, userId, moNumber, overrideCode])

  const handleUnmanned = useCallback(() => {
    if (!canSubmitUnmanned || noMachine) return
    setErrorMsg('')
    const moToUse = existingActiveMo ?? unmannedMo.trim()
    startTransition(async () => {
      const result = await authoriseUnmannedRun({
        deviceId: device.id,
        supervisorCode: unmannedSuperCode.trim(),
        machineId: device.machine_id!,
        moNumber: moToUse,
      })
      if (result.ok) {
        setConfirmedSession({
          moNumber: moToUse,
          machineCode: device.machine?.machine_code ?? device.machine_id!,
          userId: unmannedSuperCode.trim(),
        })
        setStep('success')
      } else {
        setErrorMsg(result.error ?? 'Failed to start unmanned run.')
        setStep('unmanned')
      }
    })
  }, [canSubmitUnmanned, noMachine, device, unmannedSuperCode, unmannedMo, existingActiveMo])

  function handleReset() {
    setUserId('')
    setMoNumber('')
    setOverrideCode('')
    setUnmannedSuperCode('')
    setUnmannedMo('')
    setErrorMsg('')
    setStep('form')
    setConfirmedSession(null)
  }

  // ── Success screen ──────────────────────────────────────────────────────
  if (step === 'success' && confirmedSession) {
    return (
      <div className="flex flex-col items-center justify-center min-h-full px-6 py-10 gap-8 max-w-xl mx-auto w-full">
        <div role="status" aria-live="assertive" className="w-full flex flex-col items-center gap-5 px-6 py-8 rounded-2xl bg-status-running/10 border-2 border-status-running/40 text-center">
          <div className="w-16 h-16 rounded-full bg-status-running/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-status-running" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-status-running uppercase tracking-widest mb-1">Run Started</h2>
            <p className="text-muted-foreground text-sm">Production run is now active and being tracked.</p>
          </div>
          <div className="w-full grid grid-cols-3 divide-x divide-border rounded-xl bg-secondary overflow-hidden text-left">
            <SummaryCell label="Operator" value={confirmedSession.userId} />
            <SummaryCell label="MO Number" value={confirmedSession.moNumber} />
            <SummaryCell label="Machine" value={confirmedSession.machineCode} />
          </div>
        </div>
        <BigButton variant="secondary" onClick={() => router.push('/kiosk')} className="w-full">
          Back to Home
        </BigButton>
      </div>
    )
  }

  // ── Unmanned Run form ───────────────────────────────────────────────────
  if (step === 'unmanned') {
    return (
      <div className="flex flex-col items-center min-h-full px-6 py-8 gap-6 max-w-xl mx-auto w-full">
        <div className="w-full">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-2 h-8 rounded-full bg-blue-400" aria-hidden="true" />
            <h1 className="text-xl font-bold text-foreground uppercase tracking-widest">Unmanned Run</h1>
          </div>
          <p className="text-sm text-muted-foreground pl-5">
            Requires SUPERVISOR or ADMIN authorisation. No First-Off check required.
          </p>
        </div>

        {/* Context banner */}
        {existingActiveMo ? (
          <div className="w-full flex items-start gap-3 px-4 py-3 rounded-xl bg-blue-400/10 border border-blue-400/30 text-xs text-blue-300">
            <svg className="w-4 h-4 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span>
              This will convert the active run on <strong className="text-blue-200 font-mono">{existingActiveMo}</strong> to unmanned. No new session is created.
            </span>
          </div>
        ) : (
          <div className="w-full flex items-start gap-3 px-4 py-3 rounded-xl bg-blue-400/10 border border-blue-400/30 text-xs text-blue-300">
            <svg className="w-4 h-4 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span>A supervisor or admin must scan their badge to authorise this unmanned run.</span>
          </div>
        )}

        {/* Machine + current MO if converting */}
        <div className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-secondary border border-border">
          <svg className="w-4 h-4 text-primary shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" />
          </svg>
          <div className="flex-1 flex items-center justify-between">
            <div>
              <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Machine</span>
              <p className="text-sm font-bold text-foreground font-mono">
                {device.machine?.machine_code ?? device.machine_id}
              </p>
            </div>
            {existingActiveMo && (
              <div className="text-right">
                <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Active MO</span>
                <p className="text-sm font-bold text-blue-400 font-mono">{existingActiveMo}</p>
              </div>
            )}
          </div>
        </div>

        <div className="w-full flex flex-col gap-5">
          <ScanInput
            label="1 — Supervisor / Admin Code"
            value={unmannedSuperCode}
            onChange={setUnmannedSuperCode}
            onConfirm={() => { if (!existingActiveMo) unmannedMoRef.current?.focus(); else if (canSubmitUnmanned) handleUnmanned() }}
            placeholder="Scan supervisor badge…"
            autoFocus
            disabled={pending}
            hint="Must be SUPERVISOR or ADMIN role"
          />
          {!existingActiveMo && (
            <ScanInput
              ref={unmannedMoRef}
              label="2 — MO Number"
              value={unmannedMo}
              onChange={setUnmannedMo}
              onConfirm={() => { if (canSubmitUnmanned) handleUnmanned() }}
              placeholder="Scan job ticket or type MO…"
              disabled={pending}
              hint="e.g. MO-2401"
            />
          )}
        </div>

        {errorMsg && (
          <div role="alert" aria-live="assertive" className="w-full flex items-start gap-3 px-5 py-4 rounded-xl bg-status-error/10 border border-status-error/30 text-status-error text-sm font-semibold">
            <svg className="w-5 h-5 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
            <p>{errorMsg}</p>
          </div>
        )}

        <BigButton
          variant="secondary"
          disabled={!canSubmitUnmanned}
          loading={pending}
          onClick={handleUnmanned}
          className="w-full"
          icon={
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          }
        >
          Authorise Unmanned Run
        </BigButton>

        <button type="button" onClick={() => { setStep('form'); setErrorMsg('') }} disabled={pending} className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2 disabled:opacity-40">
          Back to Run Start
        </button>
      </div>
    )
  }

  // ── No machine warning ──────────────────────────────────────────────────
  if (noMachine) {
    return (
      <div className="flex flex-col items-center justify-center min-h-full px-6 py-10 gap-6 max-w-xl mx-auto w-full text-center">
        <div className="w-16 h-16 rounded-full bg-status-error/20 flex items-center justify-center">
          <svg className="w-8 h-8 text-status-error" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground uppercase tracking-widest mb-2">No Machine Assigned</h2>
          <p className="text-sm text-muted-foreground">This kiosk ({device.station_name}) has no machine assigned. Ask an admin to assign a machine in the Admin Console.</p>
        </div>
        <BigButton variant="secondary" onClick={() => router.push('/kiosk')} className="w-full max-w-xs">
          Back to Home
        </BigButton>
      </div>
    )
  }

  // ── Form screen ─────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col items-center min-h-full px-6 py-8 gap-6 max-w-xl mx-auto w-full">

      {/* Page title */}
      <div className="w-full">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-2 h-8 rounded-full bg-status-running" aria-hidden="true" />
          <h1 className="text-xl font-bold text-foreground uppercase tracking-widest">Run Start</h1>
        </div>
        <p className="text-sm text-muted-foreground pl-5">
          First-Off approval must be complete before a run can start.
        </p>
      </div>

      {/* Gate notice */}
      <div className="w-full flex items-start gap-3 px-4 py-3 rounded-xl bg-secondary border border-border text-xs text-muted-foreground">
        <svg className="w-4 h-4 shrink-0 mt-0.5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <span>
          A <strong className="text-foreground">Setup First-Off</strong> code must be approved for the MO and machine before a run can begin.
        </span>
      </div>

      {/* Machine indicator */}
      <div className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-secondary border border-border">
        <svg className="w-4 h-4 text-primary shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" />
        </svg>
        <div>
          <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Machine</span>
          <p className="text-sm font-bold text-foreground font-mono">
            {device.machine?.machine_code ?? device.machine_id}
            {device.machine?.description && <span className="font-normal text-muted-foreground ml-2">{device.machine.description}</span>}
          </p>
        </div>
      </div>

      {/* Scan fields */}
      <div className="w-full flex flex-col gap-5">
        <ScanInput
          label="1 — Operator ID"
          value={userId}
          onChange={setUserId}
          onConfirm={() => moRef.current?.focus()}
          placeholder="Scan badge or type code…"
          autoFocus
          disabled={pending}
          hint="e.g. OP001 — scan your badge barcode"
        />
        <ScanInput
          ref={moRef}
          label="2 — MO Number"
          value={moNumber}
          onChange={setMoNumber}
          onConfirm={() => { if (canSubmit) handleCommence() }}
          placeholder="Scan job ticket or type MO…"
          disabled={pending}
          hint="e.g. MO-2401 — scan the job traveller barcode"
        />
      </div>

      {/* Error banner */}
      {step === 'error' && errorMsg && (
        <div role="alert" aria-live="assertive" className="w-full flex flex-col gap-3 px-5 py-4 rounded-xl bg-status-error/10 border border-status-error/30 text-status-error">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
            <p className="text-sm font-semibold leading-snug">{errorMsg}</p>
          </div>
          {isFirstOffBlocked && (
            <>
              <button type="button" onClick={() => router.push('/kiosk/setup/manage')} className="self-start text-xs font-semibold underline underline-offset-2 hover:no-underline">
                Go to Setup Manage &rarr;
              </button>
              <div className="mt-2 pt-3 border-t border-status-error/20 flex flex-col gap-3">
                <p className="text-xs font-semibold text-foreground">
                  Or start without First-Off — a SUPERVISOR or ADMIN must authorise:
                </p>
                <ScanInput
                  label="Supervisor / Admin Code"
                  value={overrideCode}
                  onChange={setOverrideCode}
                  onConfirm={handleOverrideStart}
                  placeholder="Scan supervisor badge…"
                  disabled={pending}
                  hint="Must be SUPERVISOR or ADMIN role"
                />
                <BigButton
                  variant="warning"
                  disabled={!overrideCode.trim()}
                  loading={pending}
                  onClick={handleOverrideStart}
                  className="w-full"
                >
                  Start Run With Override
                </BigButton>
              </div>
            </>
          )}
          {!isFirstOffBlocked && errorMsg.toLowerCase().includes('active session') && (
            <button type="button" onClick={() => router.push('/kiosk/run/manage')} className="self-start text-xs font-semibold underline underline-offset-2 hover:no-underline">
              Go to Run Manage &rarr;
            </button>
          )}
        </div>
      )}

      {/* Progress pill bar */}
      <div className="w-full flex items-center gap-3 py-3 px-4 rounded-xl bg-secondary border border-border" aria-label="Form completion status">
        <FieldPill done={!!userId} label="Operator" />
        <div className="w-px h-4 bg-border" aria-hidden="true" />
        <FieldPill done={!!moNumber} label="MO" />
        <div className="w-px h-4 bg-border" aria-hidden="true" />
        <FieldPill done label="Machine" />
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground tabular-nums font-mono">
          {[userId, moNumber].filter(Boolean).length + 1}/3
        </span>
      </div>

      <BigButton
        variant="success"
        disabled={!canSubmit}
        loading={pending}
        onClick={handleCommence}
        className="w-full"
        aria-label="Commence run session"
        icon={
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        }
      >
        Commence Run
      </BigButton>

      {(userId || moNumber) && (
        <button type="button" onClick={handleReset} disabled={pending} className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2 disabled:opacity-40">
          Clear all fields
        </button>
      )}

      <div className="w-full border-t border-border pt-4 flex flex-col items-center gap-2">
        <p className="text-xs text-muted-foreground">Running without an operator?</p>
        <button
          type="button"
          onClick={() => {
            setErrorMsg('')
            // Pre-populate MO from the manned form if already entered
            if (moNumber.trim()) {
              setExistingActiveMo(null)
              setUnmannedMo(moNumber.trim().toUpperCase())
            }
            setStep('unmanned')
          }}
          disabled={pending}
          className="flex items-center gap-2 text-sm font-semibold text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-40"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          Start Unmanned Run
        </button>
      </div>
    </div>
  )
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3">
      <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">{label}</span>
      <span className="text-base font-bold font-mono text-foreground">{value}</span>
    </div>
  )
}

function FieldPill({ done, label }: { done: boolean; label: string }) {
  return (
    <span className={`flex items-center gap-1.5 text-xs font-semibold ${done ? 'text-status-running' : 'text-muted-foreground'}`}>
      <span className={`w-2 h-2 rounded-full ${done ? 'bg-status-running' : 'bg-border'}`} aria-hidden="true" />
      {label}
    </span>
  )
}

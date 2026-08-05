'use client'

import { useState, useTransition, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { startSession } from '@/lib/actions/sessions'
import { ScanInput, type ScanInputHandle } from '@/components/kiosk/ScanInput'
import { BigButton } from '@/components/kiosk/BigButton'
import type { Device } from '@/lib/types'

interface SetupStartClientProps {
  device: Device
}

type Step = 'form' | 'success' | 'error'

export function SetupStartClient({ device }: SetupStartClientProps) {
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

  const canSubmit = userId.trim().length > 0 && moNumber.trim().length > 0

  // No machine assigned to this device
  const noMachine = !device.machine_id

  const handleCommence = useCallback(() => {
    if (!canSubmit || noMachine) return
    setErrorMsg('')

    startTransition(async () => {
      const result = await startSession({
        deviceId: device.id,
        userCode: userId.trim(),
        machineId: device.machine_id!,
        moNumber: moNumber.trim(),
        sessionType: 'SETUP',
      })

      if (result.ok) {
        setConfirmedSession({
          moNumber: moNumber.trim(),
          machineCode: device.machine?.machine_code ?? device.machine_id!,
          userId: userId.trim(),
        })
        setStep('success')
      } else {
        setErrorMsg(result.error ?? 'Failed to start session.')
        setStep('error')
      }
    })
  }, [canSubmit, noMachine, device, userId, moNumber])

  function handleReset() {
    setUserId('')
    setMoNumber('')
    setErrorMsg('')
    setStep('form')
    setConfirmedSession(null)
  }

  // ── Success screen ──────────────────────────────────────────────────────
  if (step === 'success' && confirmedSession) {
    return (
      <div className="flex flex-col items-center justify-center min-h-full px-6 py-10 gap-8 max-w-xl mx-auto w-full">
        <div
          role="status"
          aria-live="assertive"
          className="w-full flex flex-col items-center gap-5 px-6 py-8 rounded-2xl bg-status-running/10 border-2 border-status-running/40 text-center"
        >
          <div className="w-16 h-16 rounded-full bg-status-running/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-status-running" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-status-running uppercase tracking-widest mb-1">Setup Started</h2>
            <p className="text-muted-foreground text-sm">Session is now active and being tracked.</p>
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
          <h1 className="text-xl font-bold text-foreground uppercase tracking-widest">Setup Start</h1>
        </div>
        <p className="text-sm text-muted-foreground pl-5">
          Scan each field, then press <kbd className="font-mono text-xs bg-secondary px-1.5 py-0.5 rounded border border-border">Enter</kbd> to advance.
        </p>
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
          {errorMsg.toLowerCase().includes('active session') && (
            <button type="button" onClick={() => router.push('/kiosk')} className="self-start text-xs font-semibold underline underline-offset-2 hover:no-underline">
              Go to Pause / Finish &rarr;
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
        aria-label="Commence setup session"
      >
        Commence Setup
      </BigButton>

      {(userId || moNumber) && (
        <button type="button" onClick={handleReset} disabled={pending} className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2 disabled:opacity-40">
          Clear all fields
        </button>
      )}
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

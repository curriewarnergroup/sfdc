'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import type { Session } from '@/lib/types'
import { ScanInput, type ScanInputHandle } from '@/components/kiosk/ScanInput'
import { BigButton } from '@/components/kiosk/BigButton'

export type TakeoverState =
  | { phase: 'scan' }
  | { phase: 'confirm'; scannedUserId: string; scannedUserName: string }
  | { phase: 'done'; actorUserCode: string; confirmed: boolean }

interface TakeoverModalProps {
  session: Session
  onResolved: (actorUserCode: string, confirmed: boolean) => void
  onCancel: () => void
}

export function TakeoverModal({ session, onResolved, onCancel }: TakeoverModalProps) {
  const [userCode, setUserCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [phase, setPhase] = useState<'scan' | 'confirm'>('scan')
  const [scannedName, setScannedName] = useState('')

  const inputRef = useRef<ScanInputHandle>(null)

  // Auto-focus scan field when modal mounts or returns to scan phase
  useEffect(() => {
    if (phase === 'scan') {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [phase])

  const sessionOperatorName =
    session.user?.display_name ?? session.user?.user_code ?? session.user_id

  const handleScanConfirm = useCallback(async () => {
    const code = userCode.trim()
    if (!code) return
    setError('')
    setLoading(true)

    try {
      // Look up the user via a fetch to a server action helper
      const res = await fetch(`/api/kiosk/lookup-user?code=${encodeURIComponent(code)}`)
      const json = await res.json()

      if (!json.found) {
        setError('User code not found. Scan your badge again.')
        setLoading(false)
        return
      }

      const name: string = json.displayName
      const isSameUser =
        session.user?.user_code?.toUpperCase() === code.toUpperCase() ||
        session.user_id === json.userId

      if (isSameUser) {
        // Same user — no takeover needed, proceed directly
        onResolved(code, true)
        return
      }

      // Different user — show confirmation modal
      setScannedName(name)
      setPhase('confirm')
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [userCode, session, onResolved])

  // ── Confirm phase ──────────────────────────────────────────────────────
  if (phase === 'confirm') {
    return (
      <ModalShell onCancel={onCancel}>
        <div className="flex flex-col items-center gap-6 py-2">
          {/* Warning icon */}
          <div className="w-14 h-14 rounded-full bg-status-paused/20 flex items-center justify-center">
            <svg className="w-7 h-7 text-status-paused" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>

          <div className="text-center">
            <h2 className="text-lg font-bold text-foreground mb-2">Different Operator</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              This job was started by{' '}
              <strong className="text-foreground">{sessionOperatorName}</strong>.{' '}
              You are scanning as{' '}
              <strong className="text-foreground">{scannedName}</strong>.
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Are you sure this is your job?
            </p>
          </div>

          <div className="flex flex-col gap-3 w-full">
            <BigButton
              variant="warning"
              onClick={() => onResolved(userCode.trim(), true)}
            >
              Yes, continue
            </BigButton>
            <BigButton
              variant="secondary"
              onClick={() => {
                onResolved(userCode.trim(), false)
              }}
            >
              No, cancel
            </BigButton>
          </div>
        </div>
      </ModalShell>
    )
  }

  // ── Scan phase ─────────────────────────────────────────────────────────
  return (
    <ModalShell onCancel={onCancel}>
      <div className="flex flex-col gap-6">
        <div className="text-center">
          <h2 className="text-lg font-bold text-foreground mb-1">Confirm Your Identity</h2>
          <p className="text-sm text-muted-foreground">
            Scan your badge to access this job.
          </p>
        </div>

        <ScanInput
          ref={inputRef}
          label="Your Operator ID"
          value={userCode}
          onChange={setUserCode}
          onConfirm={handleScanConfirm}
          placeholder="Scan badge or type code…"
          autoFocus
          disabled={loading}
          hint="Scan your badge barcode or type your user code"
        />

        {error && (
          <div role="alert" className="flex items-start gap-3 px-4 py-3 rounded-xl bg-status-error/10 border border-status-error/30 text-status-error text-sm font-semibold">
            <svg className="w-4 h-4 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {error}
          </div>
        )}

        <BigButton
          variant="primary"
          loading={loading}
          disabled={!userCode.trim()}
          onClick={handleScanConfirm}
        >
          Confirm
        </BigButton>
      </div>
    </ModalShell>
  )
}

// ── Modal shell (backdrop + panel) ────────────────────────────────────────

function ModalShell({
  children,
  onCancel,
}: {
  children: React.ReactNode
  onCancel: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden="true"
      />
      {/* Panel */}
      <div className="relative z-10 w-full max-w-sm bg-card border-2 border-border rounded-3xl p-7 shadow-2xl">
        {/* Close button */}
        <button
          type="button"
          onClick={onCancel}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          aria-label="Close"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        {children}
      </div>
    </div>
  )
}

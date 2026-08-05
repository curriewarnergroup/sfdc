'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ScanInput } from '@/components/kiosk/ScanInput'
import {
  getShiftOverrunStatus,
  authoriseShiftOverrun,
  autoLogoutShiftOverrun,
  type ShiftOverrunStatus,
} from '@/lib/actions/shift-overrun'

const POLL_MS = 20000 // check shift status every 20s

export function ShiftOverrunWatcher({ deviceId }: { deviceId: string }) {
  const router = useRouter()
  const [active, setActive] = useState<ShiftOverrunStatus | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // Local countdown seconds, seeded from the server and ticked down each second.
  const [seconds, setSeconds] = useState(0)
  const loggingOut = useRef(false)

  // Poll the server for any session past its operator's shift end.
  const poll = useCallback(async () => {
    if (loggingOut.current) return
    const statuses = await getShiftOverrunStatus(deviceId)
    const expired = statuses.find((s) => s.state === 'expired')
    const prompt = statuses.find((s) => s.state === 'prompt')

    if (expired) {
      loggingOut.current = true
      await autoLogoutShiftOverrun({ sessionId: expired.sessionId, deviceId })
      router.push('/kiosk/login')
      router.refresh()
      return
    }
    if (prompt) {
      setActive((cur) => {
        // Keep the existing modal (and its countdown) if it's the same session.
        if (cur && cur.sessionId === prompt.sessionId) return cur
        setSeconds(prompt.secondsToLogout)
        return prompt
      })
    } else {
      setActive(null)
    }
  }, [deviceId, router])

  useEffect(() => {
    poll()
    const id = setInterval(poll, POLL_MS)
    return () => clearInterval(id)
  }, [poll])

  // Second-by-second countdown while the prompt is showing. When it reaches
  // zero we auto-logout immediately rather than waiting for the next poll.
  useEffect(() => {
    if (!active) return
    if (seconds <= 0) {
      if (loggingOut.current) return
      loggingOut.current = true
      autoLogoutShiftOverrun({ sessionId: active.sessionId, deviceId }).then(() => {
        router.push('/kiosk/login')
        router.refresh()
      })
      return
    }
    const id = setTimeout(() => setSeconds((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [active, seconds, deviceId, router])

  async function confirmStillHere() {
    if (!active || busy) return
    setError('')
    setBusy(true)
    const res = await authoriseShiftOverrun({
      sessionId: active.sessionId,
      operatorCode: pin.trim(),
      deviceId,
    })
    setBusy(false)
    if (res.ok) {
      setPin('')
      setActive(null)
      router.refresh()
    } else {
      setError(res.error ?? 'Could not confirm.')
      setPin('')
    }
  }

  if (!active) return null

  const mins = Math.floor(seconds / 60)
  const secs = (seconds % 60).toString().padStart(2, '0')

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm p-6"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="overrun-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-status-paused/40 bg-card p-8 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-status-paused/15 text-status-paused">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
            </svg>
          </div>
          <h2 id="overrun-title" className="text-lg font-bold tracking-tight text-foreground">
            Are you still at this machine?
          </h2>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          Your shift has ended, {active.operatorName}. Enter your PIN to confirm you&apos;re still
          working on{' '}
          <span className="font-semibold text-foreground">{active.machineCode || 'this machine'}</span>{' '}
          and keep the job running. If you don&apos;t respond you&apos;ll be signed out and this
          extra time won&apos;t count towards your hours.
        </p>

        <div
          className={`mt-4 rounded-lg px-4 py-3 text-center font-mono text-2xl font-bold tabular-nums ${
            seconds <= 30 ? 'bg-status-down/15 text-status-down' : 'bg-status-paused/15 text-status-paused'
          }`}
          aria-live="polite"
        >
          {mins}:{secs}
          <span className="ml-2 align-middle text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            until sign-out
          </span>
        </div>

        <div className="mt-5">
          <ScanInput
            label="Your PIN"
            value={pin}
            onChange={setPin}
            onConfirm={confirmStillHere}
            placeholder="Enter your PIN"
            enableCamera={false}
            autoFocus
          />
          {error && <p className="mt-2 text-sm font-medium text-status-down">{error}</p>}
        </div>

        <button
          type="button"
          onClick={confirmStillHere}
          disabled={busy || !pin.trim()}
          className="mt-5 h-14 w-full rounded-xl bg-status-running text-background text-base font-bold uppercase tracking-widest transition-colors hover:bg-status-running/90 disabled:opacity-40"
        >
          {busy ? 'Confirming…' : "Yes, I'm still here"}
        </button>
      </div>
    </div>
  )
}

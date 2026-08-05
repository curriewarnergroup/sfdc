'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ScanInput } from '@/components/kiosk/ScanInput'
import { BigButton } from '@/components/kiosk/BigButton'
import { resumeSession } from '@/lib/actions/sessions'
import type { Device, Session } from '@/lib/types'

function PlayIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  )
}

/**
 * ResumePanel — shown on the kiosk home whenever a session is PAUSED.
 * Replaces the full action grid with a single, unmistakable "Start Back Up"
 * flow: the operator enters their PIN and the paused job resumes immediately,
 * skipping the whole job-selection process.
 */
export function ResumePanel({
  device,
  session,
}: {
  device: Device
  session: Session
}) {
  const router = useRouter()
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  const typeLabel = session.session_type === 'SETUP' ? 'Setup' : 'Run'
  const machineCode = (session as any).machine?.machine_code ?? device.station_name

  function handleResume() {
    if (!pin.trim()) {
      setError('Please scan or enter your PIN.')
      return
    }
    setError('')
    startTransition(async () => {
      const res = await resumeSession({
        sessionId: session.id,
        actorUserCode: pin.trim(),
        deviceId: device.id,
        // Whoever signs on takes over the job (supports operator/setter swaps).
        reassignOperator: true,
      })
      if (res.ok) {
        setPin('')
        router.refresh()
      } else {
        setError(res.error ?? 'Could not start back up.')
      }
    })
  }

  return (
    <div className="flex-1 flex items-center justify-center px-6 py-8">
      <div className="w-full max-w-md flex flex-col items-center gap-6 rounded-3xl border-2 border-white/30 bg-white/10 backdrop-blur-sm p-8 text-center">
        {/* Paused job summary */}
        <div className="flex flex-col items-center gap-1">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 text-white text-xs font-black uppercase tracking-[0.2em]">
            <span className="w-2 h-2 rounded-full bg-white" />
            {typeLabel} In Progress
          </span>
          <p className="mt-4 text-base font-semibold text-white/90">
            Enter PIN to sign on and continue
          </p>
          <p className="mt-3 font-mono text-3xl font-black text-white">{session.mo_number}</p>
          <p className="text-sm text-white/70">{typeLabel} · {machineCode}</p>
        </div>

        {/* PIN entry */}
        <div className="w-full text-left">
          <ScanInput
            label="Enter your PIN to sign on and continue"
            value={pin}
            onChange={setPin}
            onConfirm={handleResume}
            placeholder="Scan badge or type PIN…"
            autoFocus
            disabled={pending}
          />
        </div>

        {error && (
          <p className="w-full px-4 py-3 rounded-xl bg-red-900/40 border border-white/30 text-sm text-white font-semibold" role="alert">
            {error}
          </p>
        )}

        {/* Start back up */}
        <BigButton
          variant="success"
          icon={<PlayIcon />}
          loading={pending}
          disabled={!pin.trim()}
          onClick={handleResume}
          aria-label={`Sign on and continue ${session.mo_number}`}
          className="w-full bg-white text-green-700 border-white hover:bg-green-50"
        >
          Sign On &amp; Continue
        </BigButton>
      </div>
    </div>
  )
}

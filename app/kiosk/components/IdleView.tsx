'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { startSession } from '@/lib/actions/sessions'
import type { Machine, Device } from '@/lib/types'

interface IdleViewProps {
  device: Device
  machines: Machine[]
}

export function IdleView({ device, machines }: IdleViewProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [userCode, setUserCode] = useState('')
  const [machineId, setMachineId] = useState('')
  const [moNumber, setMoNumber] = useState('')
  const [sessionType, setSessionType] = useState<'SETUP' | 'RUN'>('SETUP')
  const [error, setError] = useState('')

  function handleStart(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    startTransition(async () => {
      const result = await startSession({
        deviceId: device.id,
        userCode,
        machineId,
        moNumber,
        sessionType,
      })
      if (result.ok) {
        router.refresh()
      } else {
        setError(result.error ?? 'Failed to start session.')
      }
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-card rounded-xl border border-border p-6">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-5">
          Start New Session
        </h2>

        <form onSubmit={handleStart} className="space-y-4">
          {/* Session type toggle */}
          <div className="flex gap-3">
            {(['SETUP', 'RUN'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setSessionType(t)}
                className={`flex-1 h-12 rounded-lg font-bold text-sm uppercase tracking-widest transition-colors ${
                  sessionType === t
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* User code */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              Operator Code
            </label>
            <input
              type="text"
              autoComplete="off"
              autoCapitalize="characters"
              value={userCode}
              onChange={(e) => setUserCode(e.target.value.toUpperCase())}
              placeholder="e.g. OP001"
              required
              className="w-full h-14 px-4 rounded-lg bg-background border border-border text-foreground text-lg placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
            />
          </div>

          {/* Machine select */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              Machine
            </label>
            <select
              value={machineId}
              onChange={(e) => setMachineId(e.target.value)}
              required
              className="w-full h-14 px-4 rounded-lg bg-background border border-border text-foreground text-base focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Select machine…</option>
              {machines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.machine_code}{m.description ? ` — ${m.description}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* MO number */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              MO Number
            </label>
            <input
              type="text"
              autoComplete="off"
              autoCapitalize="characters"
              value={moNumber}
              onChange={(e) => setMoNumber(e.target.value.toUpperCase())}
              placeholder="e.g. MO-2401"
              required
              className="w-full h-14 px-4 rounded-lg bg-background border border-border text-foreground text-lg placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive-foreground bg-destructive/20 border border-destructive/30 rounded-lg px-4 py-3">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending || !userCode || !machineId || !moNumber}
            className="w-full h-16 rounded-xl bg-status-running text-white font-bold text-xl uppercase tracking-widest disabled:opacity-40 transition-opacity"
          >
            {pending ? 'Starting…' : 'Start Session'}
          </button>
        </form>
      </div>
    </div>
  )
}

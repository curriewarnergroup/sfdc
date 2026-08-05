'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { loginDevice } from '@/lib/actions/device-auth'

export default function DeviceLoginPage() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [stationName, setStationName] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    startTransition(async () => {
      const result = await loginDevice(stationName, pin)
      if (result.ok) {
        router.push('/kiosk')
      } else {
        setError(result.error ?? 'Login failed.')
        setPin('')
      }
    })
  }

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        {/* Logo / Header */}
        <div className="mb-10 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-primary mb-4">
            <svg
              className="w-8 h-8 text-primary-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">ShopTrack</h1>
          <p className="text-muted-foreground text-sm mt-1">Kiosk Device Login</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="station" className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              Station Name
            </label>
            <input
              id="station"
              type="text"
              autoComplete="off"
              autoCapitalize="words"
              value={stationName}
              onChange={(e) => setStationName(e.target.value)}
              placeholder="Kiosk-01"
              required
              className="w-full h-14 px-4 rounded-lg bg-card border border-border text-foreground text-lg placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label htmlFor="pin" className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              Device PIN
            </label>
            <input
              id="pin"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••"
              required
              className="w-full h-14 px-4 rounded-lg bg-card border border-border text-foreground text-lg placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring tracking-widest"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive-foreground bg-destructive/20 border border-destructive/30 rounded-lg px-4 py-3">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending || !stationName || !pin}
            className="w-full h-14 rounded-lg bg-primary text-primary-foreground font-bold text-lg transition-opacity disabled:opacity-40"
          >
            {pending ? 'Authenticating…' : 'Unlock Kiosk'}
          </button>
        </form>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Demo: Station <span className="font-mono text-foreground">Kiosk-01</span> &nbsp;|&nbsp; PIN{' '}
          <span className="font-mono text-foreground">1234</span>
        </p>
      </div>
    </main>
  )
}

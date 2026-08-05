'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { loginDevice } from '@/lib/actions/device-auth'
import { BigButton } from '@/components/kiosk/BigButton'

export default function KioskLoginPage() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [stationName, setStationName] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [stationInUse, setStationInUse] = useState<string | null>(null)

  const stationRef = useRef<HTMLInputElement>(null)
  const pinRef = useRef<HTMLInputElement>(null)

  // Auto-focus station name on mount
  useEffect(() => {
    stationRef.current?.focus()
  }, [])

  function handleStationKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      pinRef.current?.focus()
    }
  }

  function handlePinKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (stationName && pin) submit()
    }
  }

  function submit(force = false) {
    setError('')
    setStationInUse(null)
    startTransition(async () => {
      const result = await loginDevice(stationName.trim(), pin, force)
      if (result.ok) {
        router.push('/kiosk')
        router.refresh()
      } else {
        const err = result.error ?? 'Login failed.'
        if (err.startsWith('STATION_IN_USE:')) {
          // Keep the PIN so the operator can confirm takeover in one tap.
          setStationInUse(err.replace('STATION_IN_USE:', ''))
        } else {
          setError(err)
          setPin('')
          pinRef.current?.focus()
        }
      }
    })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    submit()
  }

  return (
    <main className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-4">
      <div className="w-full max-w-sm flex flex-col gap-5 md:gap-8">

        {/* Brand */}
        <div className="flex flex-col items-center gap-2 md:gap-4 text-center">
          <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/ChatGPT%20Image%20Mar%203%2C%202026%2C%2003_41_27%20PM-hC3ntkzEMOxRGfNw6IhG03wBc5EfyC.png" alt="C&W ShopTrack" className="h-28 md:h-44 w-auto object-contain" />
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-foreground">Kiosk Device Login</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 md:gap-5" noValidate>
          {/* Station name */}
          <div className="flex flex-col gap-2">
            <label
              htmlFor="station-name"
              className="text-xs font-semibold uppercase tracking-widest text-muted-foreground"
            >
              Station Name
            </label>
            <input
              ref={stationRef}
              id="station-name"
              type="text"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              value={stationName}
              onChange={(e) => setStationName(e.target.value)}
              onKeyDown={handleStationKeyDown}
              placeholder="Kiosk-01"
              required
              disabled={pending}
              className="h-12 md:h-16 px-5 rounded-xl bg-card border-2 border-border text-foreground text-lg md:text-xl placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary transition-colors font-mono disabled:opacity-40"
            />
          </div>

          {/* PIN */}
          <div className="flex flex-col gap-2">
            <label
              htmlFor="device-pin"
              className="text-xs font-semibold uppercase tracking-widest text-muted-foreground"
            >
              Device PIN
            </label>
            <input
              ref={pinRef}
              id="device-pin"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={handlePinKeyDown}
              placeholder="••••"
              required
              disabled={pending}
              className="h-12 md:h-16 px-5 rounded-xl bg-card border-2 border-border text-foreground text-xl md:text-2xl placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary transition-colors tracking-[0.5em] disabled:opacity-40"
            />
          </div>

          {/* Station in use error */}
          {stationInUse && (
            <div
              role="alert"
              className="flex flex-col gap-2 px-4 py-4 rounded-xl bg-amber-500/10 border border-amber-500/40 text-amber-400"
            >
              <div className="flex items-center gap-2 font-bold text-sm">
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                {stationInUse} is currently in use
              </div>
              <p className="text-xs text-amber-300/80 leading-relaxed">
                This station is signed in on another device. You can take over with your PIN &mdash;
                the current job stays exactly where it is, only the other device is signed out.
              </p>
              <button
                type="button"
                onClick={() => submit(true)}
                disabled={pending || !pin}
                className="mt-1 h-11 rounded-xl bg-amber-500 text-background font-bold text-sm uppercase tracking-widest hover:bg-amber-400 transition-colors disabled:opacity-40"
              >
                {pending ? 'Taking over…' : 'Take Over This Station'}
              </button>
            </div>
          )}

          {/* General error */}
          {error && (
            <div
              role="alert"
              className="flex items-center gap-3 px-4 py-3 rounded-xl bg-status-error/10 border border-status-error/30 text-status-error text-sm font-medium"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}

          <BigButton
            type="submit"
            variant="primary"
            disabled={!stationName || !pin}
            loading={pending}
          >
            {pending ? 'Authenticating…' : 'Unlock Kiosk'}
          </BigButton>
        </form>

        {/* Demo hint */}
        <p className="text-center text-xs text-muted-foreground">
          Demo &mdash; Station{' '}
          <code className="font-mono text-foreground bg-secondary px-1.5 py-0.5 rounded">Kiosk-01</code>
          {' '}PIN{' '}
          <code className="font-mono text-foreground bg-secondary px-1.5 py-0.5 rounded">1234</code>
        </p>
      </div>
    </main>
  )
}

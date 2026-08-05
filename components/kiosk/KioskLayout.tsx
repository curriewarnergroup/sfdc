'use client'

import { useEffect, useState } from 'react'

interface KioskLayoutProps {
  stationName: string
  children: React.ReactNode
  /** Optional action element(s) rendered on the right side of the header */
  headerActions?: React.ReactNode
}

function FooterClock() {
  const [time, setTime] = useState('')
  const [date, setDate] = useState('')

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      setTime(
        now.toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
      )
      setDate(
        now.toLocaleDateString('en-GB', {
          weekday: 'short',
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })
      )
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="flex items-center gap-3 font-mono tabular-nums" aria-live="off" aria-label="Current time">
      <span className="text-foreground text-sm font-semibold">{time}</span>
      <span className="text-muted-foreground text-xs">{date}</span>
    </div>
  )
}

/**
 * KioskLayout — shared chrome for all kiosk screens.
 *
 * Header: ShopTrack logo + station name + optional actions
 * Footer: persistent station name + live wall clock (display only)
 */
export function KioskLayout({ stationName, children, headerActions }: KioskLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* ── Header ── */}
      <header className="flex-none flex items-center justify-between px-5 py-3 bg-card border-b border-border">
        <div className="flex items-center gap-3">
          {/* Logo mark */}
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <svg
              className="w-5 h-5 text-primary-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18"
              />
            </svg>
          </div>
          <div className="leading-tight">
            <p className="text-xs font-bold text-foreground tracking-wide">ShopTrack</p>
            <p className="text-xs text-primary font-mono font-semibold">{stationName}</p>
          </div>
        </div>

        {/* Right-side header actions */}
        {headerActions && (
          <div className="flex items-center gap-2">{headerActions}</div>
        )}
      </header>

      {/* ── Page content ── */}
      <main className="flex-1 overflow-y-auto">{children}</main>

      {/* ── Footer ── */}
      <footer className="flex-none flex items-center justify-between px-5 py-2.5 bg-card border-t border-border">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground uppercase tracking-widest font-semibold">Station</span>
          <span className="text-foreground font-mono font-semibold">{stationName}</span>
        </div>
        <FooterClock />
      </footer>
    </div>
  )
}

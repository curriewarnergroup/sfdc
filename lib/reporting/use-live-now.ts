'use client'

// ============================================================
// Live clock
// ------------------------------------------------------------
// One interval for the whole page, not one per timer. With twenty machines
// on screen, each with a state timer and a job timer, forty setIntervals
// would drift against each other and show different seconds on the same
// row. A single tick broadcast to every subscriber keeps them in step.
//
// Also pauses while the tab is hidden — there is no point re-rendering a
// dashboard nobody is looking at — and catches up immediately on return.
// ============================================================

import { useEffect, useState } from 'react'

type Subscriber = (now: number) => void

const subscribers = new Set<Subscriber>()
let timer: ReturnType<typeof setInterval> | null = null
let visibilityBound = false

function broadcast() {
  const now = Date.now()
  for (const fn of subscribers) fn(now)
}

function start() {
  if (timer !== null) return
  if (typeof document !== 'undefined' && document.hidden) return
  timer = setInterval(broadcast, 1000)
}

function stop() {
  if (timer === null) return
  clearInterval(timer)
  timer = null
}

function bindVisibility() {
  if (visibilityBound || typeof document === 'undefined') return
  visibilityBound = true
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stop()
    } else if (subscribers.size > 0) {
      broadcast() // catch up before resuming the cadence
      start()
    }
  })
}

/**
 * Current time in ms, updated once a second.
 * Returns null on the server and on the very first client render, so callers
 * can fall back to a server-rendered value and avoid a hydration mismatch.
 */
export function useNow(): number | null {
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    setNow(Date.now())
    const fn: Subscriber = t => setNow(t)
    subscribers.add(fn)
    bindVisibility()
    start()
    return () => {
      subscribers.delete(fn)
      if (subscribers.size === 0) stop()
    }
  }, [])

  return now
}

/**
 * Minutes elapsed since an ISO timestamp, ticking live.
 * Falls back to the server-computed value until the clock is running.
 */
export function useElapsedMinutes(
  since: string | null | undefined,
  fallbackMinutes: number | null = null,
): number | null {
  const now = useNow()
  if (!since) return fallbackMinutes
  if (now === null) return fallbackMinutes
  return (now - new Date(since).getTime()) / 60000
}

/** 2h 14m · 40m 07s · 12s */
export function formatDuration(minutes: number | null | undefined, withSeconds = true): string {
  if (minutes == null) return '—'
  const totalSeconds = Math.max(0, Math.floor(minutes * 60))
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60

  // Past an hour, seconds are noise — the minute figure is what matters.
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  if (!withSeconds) return `${m}m`
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`
  return `${s}s`
}

'use client'

import { useElapsedMinutes, formatDuration } from '@/lib/reporting/use-live-now'

/**
 * A duration that counts up while you watch it.
 *
 * `since` is the ISO timestamp it counts from. `fallbackMinutes` is the
 * server-computed value, rendered on the server and for the first client
 * paint so there is no hydration mismatch — the live value takes over on
 * the next tick.
 *
 * `className` can be a function of the live minutes, so colour escalation
 * (a stoppage going amber then red) tracks the ticking value rather than
 * whatever it was when the page was rendered.
 */
export function LiveDuration({
  since,
  fallbackMinutes = null,
  withSeconds = true,
  className,
  prefix,
}: {
  since: string | null | undefined
  fallbackMinutes?: number | null
  withSeconds?: boolean
  className?: string | ((minutes: number | null) => string)
  prefix?: React.ReactNode
}) {
  const minutes = useElapsedMinutes(since, fallbackMinutes)
  const cls = typeof className === 'function' ? className(minutes) : (className ?? '')

  return (
    <span className={`tabular-nums ${cls}`} suppressHydrationWarning>
      {prefix}
      {formatDuration(minutes, withSeconds)}
    </span>
  )
}

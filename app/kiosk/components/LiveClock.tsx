'use client'

import { useEffect, useState } from 'react'

function elapsed(startedAt: string): string {
  const secs = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':')
}

export function LiveClock({ startedAt }: { startedAt: string }) {
  const [display, setDisplay] = useState(elapsed(startedAt))

  useEffect(() => {
    setDisplay(elapsed(startedAt))
    const id = setInterval(() => setDisplay(elapsed(startedAt)), 1000)
    return () => clearInterval(id)
  }, [startedAt])

  return (
    <span className="font-mono text-5xl font-bold tabular-nums tracking-tight text-foreground">
      {display}
    </span>
  )
}

export function WallClock() {
  const [time, setTime] = useState('')
  useEffect(() => {
    const tick = () =>
      setTime(
        new Date().toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
      )
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])
  return <span className="font-mono text-sm text-muted-foreground tabular-nums">{time}</span>
}

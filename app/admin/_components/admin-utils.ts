// Pure utility functions — no 'use client', safe to import in Server Components

export function elapsedStr(startedAt: string): string {
  const ms = Date.now() - new Date(startedAt).getTime()
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString([], {
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
  })
}

'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { PRESETS, type ReportRange } from '@/lib/reporting/range'

export function DateRangePicker({ range }: { range: ReportRange }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()

  function push(next: URLSearchParams) {
    startTransition(() => router.push(`${pathname}?${next.toString()}`))
  }

  function selectPreset(key: string) {
    const next = new URLSearchParams(params.toString())
    next.set('preset', key)
    next.delete('from')
    next.delete('to')
    push(next)
  }

  function setCustom(which: 'from' | 'to', value: string) {
    if (!value) return
    const next = new URLSearchParams(params.toString())
    next.set('from', which === 'from' ? value : range.from)
    next.set('to', which === 'to' ? value : range.to)
    next.delete('preset')
    push(next)
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 print:hidden ${pending ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-center gap-1">
        {PRESETS.map(p => {
          const active = range.preset === p.key
          return (
            <button
              key={p.key}
              onClick={() => selectPreset(p.key)}
              className={`text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${
                active
                  ? 'bg-primary/10 text-primary border-primary/40'
                  : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              {p.label}
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-1.5 pl-2 border-l border-border">
        <input
          type="date"
          value={range.from}
          max={range.to}
          onChange={e => setCustom('from', e.target.value)}
          aria-label="From date"
          className="h-8 rounded-lg border border-border bg-card px-2 text-xs text-foreground"
        />
        <span className="text-xs text-muted-foreground">to</span>
        <input
          type="date"
          value={range.to}
          min={range.from}
          onChange={e => setCustom('to', e.target.value)}
          aria-label="To date"
          className="h-8 rounded-lg border border-border bg-card px-2 text-xs text-foreground"
        />
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { User, ChevronDown, ChevronRight, Cpu, Wrench, Clock } from 'lucide-react'

type Entry = {
  machine_code: string
  description: string | null
  mo_number: string
  session_type: string
  hours: number
}

type Day = {
  date: string
  hours: number
  entries: Entry[]
}

type Person = {
  id: string
  display_name: string
  role: string
  total_hours: number
  days: Day[]
}

function fmtHours(h: number) {
  if (h <= 0) return '0h'
  const hrs = Math.floor(h)
  const mins = Math.round((h - hrs) * 60)
  if (hrs > 0 && mins > 0) return `${hrs}h ${mins}m`
  if (hrs > 0) return `${hrs}h`
  return `${mins}m`
}

function fmtDay(key: string) {
  // key is YYYY-MM-DD
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function DailyWorkClient({ people }: { people: Person[] }) {
  // Expand the first person with recorded work by default.
  const firstWithWork = people.find(p => p.days.length > 0)?.id
  const [expanded, setExpanded] = useState<Set<string>>(
    new Set(firstWithWork ? [firstWithWork] : []),
  )

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (people.length === 0) {
    return <p className="text-center text-muted-foreground py-16">No people found.</p>
  }

  return (
    <div className="space-y-3">
      {people.map(p => {
        const isOpen = expanded.has(p.id)
        const hasWork = p.days.length > 0
        return (
          <div key={p.id} className="rounded-xl border border-border overflow-hidden bg-card">
            {/* Person header */}
            <button
              onClick={() => hasWork && toggle(p.id)}
              disabled={!hasWork}
              className={`w-full flex items-center gap-3 px-5 py-4 text-left transition-colors ${hasWork ? 'hover:bg-muted/40' : 'opacity-60 cursor-default'}`}
              aria-expanded={isOpen}
            >
              {hasWork ? (
                isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                       : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              ) : (
                <span className="w-4 h-4 shrink-0" />
              )}
              <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                <User className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground">{p.display_name}</p>
                <span className="text-[11px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                  {p.role}
                </span>
              </div>
              <div className="text-right shrink-0">
                <p className="text-2xl font-bold text-foreground font-mono">{fmtHours(p.total_hours)}</p>
                <p className="text-xs text-muted-foreground">{p.days.length} day{p.days.length === 1 ? '' : 's'} worked</p>
              </div>
            </button>

            {/* Daily breakdown */}
            {isOpen && hasWork && (
              <div className="border-t border-border divide-y divide-border">
                {p.days.map(day => (
                  <div key={day.date} className="px-5 py-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        {fmtDay(day.date)}
                      </p>
                      <span className="font-mono font-semibold text-status-running">{fmtHours(day.hours)}</span>
                    </div>
                    <div className="pl-6 flex flex-col gap-1.5">
                      {day.entries.map((e, i) => (
                        <div key={i} className="flex items-center gap-3 text-sm">
                          <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${e.session_type === 'SETUP' ? 'bg-blue-500/20' : 'bg-muted'}`}>
                            {e.session_type === 'SETUP'
                              ? <Wrench className="w-3 h-3 text-blue-400" />
                              : <Cpu className="w-3 h-3 text-muted-foreground" />}
                          </div>
                          <span className="font-semibold text-foreground w-24 shrink-0">{e.machine_code}</span>
                          <span className="font-mono text-muted-foreground w-28 shrink-0">{e.mo_number}</span>
                          <span className="text-[11px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            {e.session_type}
                          </span>
                          <span className="flex-1" />
                          <span className="font-mono text-foreground">{fmtHours(e.hours)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

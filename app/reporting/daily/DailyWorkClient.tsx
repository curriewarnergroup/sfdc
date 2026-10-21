'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { User, ChevronDown, ChevronRight, Cpu, Wrench, Clock, X } from 'lucide-react'

type Entry = {
  machine_code: string
  description: string | null
  mo_number: string
  session_type: string
  hours: number
  last_worked_at: string
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
  last_worked_at: string | null
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
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function fmtLast(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London',
  })
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London',
  })
}

function DateRangeFilter({ from, to }: { from: string; to: string }) {
  const router = useRouter()
  const [fromVal, setFromVal] = useState(from)
  const [toVal, setToVal] = useState(to)

  function apply(nextFrom: string, nextTo: string) {
    const params = new URLSearchParams()
    if (nextFrom) params.set('from', nextFrom)
    if (nextTo) params.set('to', nextTo)
    const qs = params.toString()
    router.push(qs ? `/reporting/daily?${qs}` : '/reporting/daily')
  }

  function clear() {
    setFromVal('')
    setToVal('')
    apply('', '')
  }

  const hasFilter = Boolean(from || to)

  return (
    <form
      onSubmit={e => {
        e.preventDefault()
        apply(fromVal, toVal)
      }}
      className="flex flex-wrap items-end gap-3 bg-card border border-border rounded-xl p-4"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="daily-from" className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">From</label>
        <input
          id="daily-from"
          type="date"
          value={fromVal}
          max={toVal || undefined}
          onChange={e => setFromVal(e.target.value)}
          className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="daily-to" className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">To</label>
        <input
          id="daily-to"
          type="date"
          value={toVal}
          min={fromVal || undefined}
          onChange={e => setToVal(e.target.value)}
          className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
        />
      </div>
      <button
        type="submit"
        className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
      >
        Apply
      </button>
      {hasFilter && (
        <button
          type="button"
          onClick={clear}
          className="h-9 px-3 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted inline-flex items-center gap-1.5 transition-colors"
        >
          <X className="w-3.5 h-3.5" /> Clear
        </button>
      )}
    </form>
  )
}

export function DailyWorkClient({ people, from, to }: { people: Person[]; from: string; to: string }) {
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

  return (
    <div className="space-y-4">
      <DateRangeFilter from={from} to={to} />

      {people.length === 0 && (
        <p className="text-center text-muted-foreground py-16">No people found.</p>
      )}

      <div className="space-y-3">
        {people.map(p => {
          const isOpen = expanded.has(p.id)
          const hasWork = p.days.length > 0
          return (
            <div key={p.id} className="rounded-xl border border-border overflow-hidden bg-card">
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
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      {p.role}
                    </span>
                    {p.last_worked_at ? (
                      <span className="text-xs text-muted-foreground">Last work {fmtLast(p.last_worked_at)}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">No work in this period</span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-2xl font-bold text-foreground font-mono">{fmtHours(p.total_hours)}</p>
                  <p className="text-xs text-muted-foreground">{p.days.length} day{p.days.length === 1 ? '' : 's'} worked</p>
                </div>
              </button>

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
                            <span className="text-xs text-muted-foreground">until {fmtTime(e.last_worked_at)}</span>
                            <span className="font-mono text-foreground w-16 text-right">{fmtHours(e.hours)}</span>
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
    </div>
  )
}

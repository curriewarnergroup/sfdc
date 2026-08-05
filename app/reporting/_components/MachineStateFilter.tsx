'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { Check, RotateCcw } from 'lucide-react'

export const MACHINE_STATES = [
  { key: 'RUNNING',     label: 'Running',     dot: 'bg-status-running',  chip: 'border-status-running/40 bg-status-running/10 text-status-running' },
  { key: 'IN_SETUP',    label: 'Setup',       dot: 'bg-blue-400',        chip: 'border-blue-400/40 bg-blue-400/10 text-blue-400' },
  { key: 'UNMANNED',    label: 'Unmanned',    dot: 'bg-purple-400',      chip: 'border-purple-400/40 bg-purple-400/10 text-purple-400' },
  { key: 'STOPPED',     label: 'Stopped',     dot: 'bg-status-paused',   chip: 'border-status-paused/40 bg-status-paused/10 text-status-paused' },
  { key: 'AWAITING_QC', label: 'Awaiting QC', dot: 'bg-amber-400',       chip: 'border-amber-400/40 bg-amber-400/10 text-amber-400' },
  { key: 'IDLE',        label: 'Idle',        dot: 'bg-muted-foreground/50', chip: 'border-border bg-muted text-muted-foreground' },
] as const

export type MachineState = (typeof MACHINE_STATES)[number]['key']

// Everything except IDLE — "machines being worked on", which is the view
// you want on the wall.
export const DEFAULT_STATES: MachineState[] = ['RUNNING', 'IN_SETUP', 'UNMANNED', 'STOPPED', 'AWAITING_QC']

const STORAGE_KEY = 'shoptrack.machineStates'

export function parseStates(raw: string | undefined | null): MachineState[] {
  if (!raw) return []
  const valid = new Set(MACHINE_STATES.map(s => s.key as string))
  return raw.split(',').map(s => s.trim().toUpperCase()).filter(s => valid.has(s)) as MachineState[]
}

export function MachineStateFilter({
  selected,
  counts,
}: {
  selected: MachineState[]
  counts: Record<string, number>
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()
  const [savedDefault, setSavedDefault] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)

  const hasParam = params.get('state') !== null

  // On first load with no explicit selection, fall back to the saved view.
  useEffect(() => {
    const stored = typeof window === 'undefined' ? null : window.localStorage.getItem(STORAGE_KEY)
    setSavedDefault(stored)
    if (!hasParam && stored) {
      const next = new URLSearchParams(params.toString())
      next.set('state', stored)
      router.replace(`${pathname}?${next.toString()}`)
    }
    // Intentionally runs once — this is a landing default, not a live sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function apply(states: MachineState[]) {
    const next = new URLSearchParams(params.toString())
    // An empty selection would show nothing, which is never what anyone
    // means — treat it as "show everything" instead.
    if (states.length === 0) next.delete('state')
    else next.set('state', states.join(','))
    startTransition(() => router.push(`${pathname}?${next.toString()}`))
  }

  function toggle(key: MachineState) {
    apply(selected.includes(key) ? selected.filter(s => s !== key) : [...selected, key])
  }

  function saveDefault() {
    const value = selected.join(',')
    window.localStorage.setItem(STORAGE_KEY, value)
    setSavedDefault(value)
    setJustSaved(true)
    setTimeout(() => setJustSaved(false), 2000)
  }

  function clearDefault() {
    window.localStorage.removeItem(STORAGE_KEY)
    setSavedDefault(null)
    const next = new URLSearchParams(params.toString())
    next.delete('state')
    startTransition(() => router.push(`${pathname}?${next.toString()}`))
  }

  const current = selected.join(',')
  const isDefault = savedDefault !== null && savedDefault === current

  return (
    <div className={`flex flex-wrap items-center gap-2 print:hidden ${pending ? 'opacity-60' : ''}`}>
      {MACHINE_STATES.map(s => {
        const on = selected.includes(s.key)
        const count = counts[s.key] ?? 0
        return (
          <button
            key={s.key}
            onClick={() => toggle(s.key)}
            aria-pressed={on}
            className={`inline-flex items-center gap-2 h-8 px-3 rounded-lg border text-xs font-medium transition-colors ${
              on ? s.chip : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
            } ${count === 0 ? 'opacity-50' : ''}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
            {s.label}
            <span className="font-mono tabular-nums">{count}</span>
          </button>
        )
      })}

      <div className="flex items-center gap-1 pl-2 border-l border-border">
        <button
          onClick={saveDefault}
          disabled={isDefault || selected.length === 0}
          className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="Remember this selection as your default view"
        >
          <Check className="w-3.5 h-3.5" />
          {justSaved ? 'Saved' : isDefault ? 'Default' : 'Save as default'}
        </button>
        {savedDefault !== null && (
          <button
            onClick={clearDefault}
            className="inline-flex items-center h-8 px-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Clear saved default"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

'use client'

import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { saveMoCycleTime, type JobTimeRow } from '@/lib/actions/reporting'
import { Printer, Check, X, Pencil } from 'lucide-react'

type Machine = { id: string; machine_code: string }

function durationStr(mins: number) {
  if (!mins) return '—'
  const h = Math.floor(mins / 60)
  const m = Math.round(mins % 60)
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

/** Efficiency colour bands: at/above standard is good, well below is a problem. */
function effTone(pct: number) {
  if (pct >= 95) return 'text-emerald-400 print:text-emerald-700'
  if (pct >= 80) return 'text-amber-400 print:text-amber-700'
  return 'text-red-400 print:text-red-700'
}

function CycleCell({ row }: { row: JobTimeRow }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [secs, setSecs] = useState(row.cycle_seconds?.toString() ?? '')
  const [qty, setQty] = useState(row.quantity?.toString() ?? '')
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function save() {
    setErr(null)
    const s = secs.trim() === '' ? null : Number(secs)
    const q = qty.trim() === '' ? null : Number(qty)
    // Both blank clears the standard; otherwise both are required.
    if ((s == null) !== (q == null)) {
      setErr('Enter both cycle time and quantity')
      return
    }
    if (s != null && (!(s > 0) || !Number.isInteger(q!) || q! <= 0)) {
      setErr('Must be greater than zero')
      return
    }
    start(async () => {
      const res = await saveMoCycleTime(row.mo_number, s, q)
      if (!res.ok) { setErr(res.error); return }
      setEditing(false)
      router.refresh()
    })
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-1.5 print:hidden">
        <div className="flex items-center gap-1.5">
          <input
            autoFocus
            value={secs}
            onChange={e => setSecs(e.target.value)}
            onKeyDown={e => {
              if (e.nativeEvent.isComposing || e.keyCode === 229) return
              if (e.key === 'Enter') save()
              if (e.key === 'Escape') setEditing(false)
            }}
            placeholder="secs"
            inputMode="decimal"
            aria-label={`Cycle time in seconds for ${row.mo_number}`}
            className="w-16 bg-background border border-border rounded px-2 py-1 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <span className="text-muted-foreground text-xs">&times;</span>
          <input
            value={qty}
            onChange={e => setQty(e.target.value)}
            onKeyDown={e => {
              if (e.nativeEvent.isComposing || e.keyCode === 229) return
              if (e.key === 'Enter') save()
              if (e.key === 'Escape') setEditing(false)
            }}
            placeholder="qty"
            inputMode="numeric"
            aria-label={`Quantity for ${row.mo_number}`}
            className="w-16 bg-background border border-border rounded px-2 py-1 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            onClick={save}
            disabled={pending}
            aria-label="Save cycle time"
            className="p-1 rounded text-emerald-400 hover:bg-accent disabled:opacity-50"
          >
            <Check className="w-4 h-4" />
          </button>
          <button
            onClick={() => { setEditing(false); setErr(null) }}
            aria-label="Cancel"
            className="p-1 rounded text-muted-foreground hover:bg-accent"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {err && <span className="text-[10px] text-red-400">{err}</span>}
      </div>
    )
  }

  if (row.cycle_seconds == null) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="text-xs text-muted-foreground hover:text-foreground underline decoration-dotted print:no-underline"
      >
        Set cycle time
      </button>
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="group flex flex-col items-start gap-0.5 text-left"
    >
      <span className="font-mono text-xs text-foreground flex items-center gap-1">
        {row.cycle_seconds}s &times; {row.quantity}
        <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 print:hidden" />
      </span>
      <span className="text-[10px] text-muted-foreground">
        {durationStr(row.expected_mins ?? 0)} expected
      </span>
    </button>
  )
}

export function JobTimesClient({
  rows,
  machines,
  filters,
}: {
  rows: JobTimeRow[]
  machines: Machine[]
  filters: { from?: string; to?: string; mo?: string; machineId?: string }
}) {
  const router = useRouter()
  const params = useSearchParams()

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(key, value)
    else next.delete(key)
    router.push(`/reporting/jobs?${next.toString()}`)
  }

  const hasFilters = !!(filters.from || filters.to || filters.mo || filters.machineId)

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-card rounded-xl border border-border p-4 print:hidden">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="from" className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">From</label>
            <input
              id="from" type="date" defaultValue={filters.from ?? ''}
              onChange={e => setParam('from', e.target.value)}
              className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="to" className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">To</label>
            <input
              id="to" type="date" defaultValue={filters.to ?? ''}
              onChange={e => setParam('to', e.target.value)}
              className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="mo" className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">MO Number</label>
            <input
              id="mo" type="text" placeholder="Search job…" defaultValue={filters.mo ?? ''}
              onKeyDown={e => {
                if (e.nativeEvent.isComposing || e.keyCode === 229) return
                if (e.key === 'Enter') setParam('mo', (e.target as HTMLInputElement).value)
              }}
              onBlur={e => setParam('mo', e.target.value)}
              className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-foreground w-44 focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="machine" className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Machine</label>
            <select
              id="machine" defaultValue={filters.machineId ?? ''}
              onChange={e => setParam('machineId', e.target.value)}
              className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">All machines</option>
              {machines.map(m => <option key={m.id} value={m.id}>{m.machine_code}</option>)}
            </select>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {hasFilters && (
              <button
                onClick={() => router.push('/reporting/jobs')}
                className="px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-accent"
              >
                Clear
              </button>
            )}
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-accent"
            >
              <Printer className="w-4 h-4" /> Print
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {['Job', 'Machine', 'Setup Time', 'Run Time', 'Qty Made', 'Cycle Time', 'Efficiency', 'Last Activity'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                    No jobs found for these filters.
                  </td>
                </tr>
              )}
              {rows.map(r => (
                <tr key={r.mo_number} className="border-b border-border last:border-0 hover:bg-accent/40">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-foreground">{r.mo_number}</span>
                      {r.is_live && (
                        <span className="w-1.5 h-1.5 rounded-full bg-status-running animate-pulse" title="Currently live" />
                      )}
                    </div>
                    {r.operators.length > 0 && (
                      <span className="text-[10px] text-muted-foreground">{r.operators.join(', ')}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                    {r.machine_codes.join(', ') || '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="font-mono text-xs text-foreground">{durationStr(r.setup_net_mins)}</span>
                    <span className="block text-[10px] text-muted-foreground">
                      {r.setup_count} setup{r.setup_count === 1 ? '' : 's'} · {durationStr(r.setup_mins)} elapsed
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="font-mono text-xs text-foreground">{durationStr(r.run_net_mins)}</span>
                    <span className="block text-[10px] text-muted-foreground">
                      {r.run_count} run{r.run_count === 1 ? '' : 's'}
                      {r.run_paused_mins > 0 ? ` · ${durationStr(r.run_paused_mins)} paused` : ''}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-foreground">
                    {r.qty_made || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <CycleCell row={r} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {r.efficiency_pct == null ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <span className={`font-mono text-sm font-bold ${effTone(r.efficiency_pct)}`}>
                          {r.efficiency_pct}%
                        </span>
                        <div className="h-1 w-20 rounded-full bg-muted overflow-hidden print:hidden">
                          <div
                            className={`h-full rounded-full ${
                              r.efficiency_pct >= 95 ? 'bg-emerald-400'
                                : r.efficiency_pct >= 80 ? 'bg-amber-400' : 'bg-red-400'
                            }`}
                            style={{ width: `${Math.min(100, r.efficiency_pct)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {fmtDate(r.last_activity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

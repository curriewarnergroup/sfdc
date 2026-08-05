'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Printer, Search, X } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Legend,
} from 'recharts'

// ---- Helpers ----

function fmtDate(dt: string) {
  return new Date(dt).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function durationStr(mins: number | null, start?: string, end?: string | null) {
  if (mins !== null) {
    if (mins >= 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`
    return `${mins}m`
  }
  if (!start || !end) return '—'
  const m = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000)
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`
  return `${m}m`
}

// ---- Types ----

type ActivityEvent =
  | ({ _type: 'SESSION'; _time: string } & Record<string, any>)
  | ({ _type: 'STOPPAGE'; _time: string } & Record<string, any>)
  | ({ _type: 'QC'; _time: string } & Record<string, any>)
  | ({ _type: 'CHECK_RESULT'; _time: string } & Record<string, any>)

type User = { id: string; display_name: string }

// ---- Event type badge ----

function EventTypeBadge({ event }: { event: ActivityEvent }) {
  if (event._type === 'SESSION') {
    const isSetup = event.session_type === 'SETUP'
    return (
      <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded print:border print:bg-transparent ${
        isSetup ? 'bg-blue-500/20 text-blue-400 print:text-blue-700 print:border-blue-300' : 'bg-emerald-500/20 text-emerald-400 print:text-emerald-700 print:border-emerald-300'
      }`}>
        {event.session_type}
      </span>
    )
  }
  if (event._type === 'STOPPAGE') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded bg-orange-500/20 text-orange-400 print:border print:border-orange-300 print:text-orange-700 print:bg-transparent">
        Stoppage
      </span>
    )
  }
  if (event._type === 'CHECK_RESULT') {
    return (
      <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded print:border print:bg-transparent ${
        event.result === 'PASS'
          ? 'bg-emerald-500/20 text-emerald-400 print:text-emerald-700 print:border-emerald-300'
          : event.result === 'FAIL'
          ? 'bg-red-500/20 text-red-400 print:text-red-700 print:border-red-300'
          : 'bg-muted text-muted-foreground'
      }`}>
        QC Check
      </span>
    )
  }
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded print:border print:bg-transparent ${
      event.code_type === 'FIRST_OFF'
        ? 'bg-purple-500/20 text-purple-400 print:text-purple-700 print:border-purple-300'
        : 'bg-cyan-500/20 text-cyan-400 print:text-cyan-700 print:border-cyan-300'
    }`}>
      {event.code_type?.replace('_', ' ')}
    </span>
  )
}

// ---- Event detail cell ----

function EventDetail({ event }: { event: ActivityEvent }) {
  if (event._type === 'SESSION') {
    const status = event.status as string
    const statusColour =
      status === 'ACTIVE'      ? 'text-emerald-400 print:text-emerald-700' :
      status === 'PAUSED'      ? 'text-orange-400 print:text-orange-700' :
      status === 'AUTO_CLOSED' ? 'text-red-400 print:text-red-700' :
      'text-muted-foreground print:text-gray-500'
    return (
      <div className="flex flex-col gap-0.5">
        <span className={`text-[11px] font-semibold uppercase tracking-wide ${statusColour}`}>
          {status.replace('_', ' ')}
        </span>
        {(event.qty_made != null || event.qty_to_make != null) && (
          <span className="text-xs text-muted-foreground print:text-gray-500 font-mono">
            {event.qty_made ?? '—'} / {event.qty_to_make ?? '—'} made
            {event.qty_scrapped > 0 && <span className="text-destructive print:text-red-600"> · {event.qty_scrapped} scrap</span>}
          </span>
        )}
      </div>
    )
  }
  if (event._type === 'STOPPAGE') {
    return (
      <div className="flex flex-col gap-0.5">
        {event.pause_reason ? (
          <span className="text-xs font-semibold text-orange-400 print:text-orange-700">{event.pause_reason}</span>
        ) : (
          <span className="text-xs text-muted-foreground print:text-gray-500">No reason recorded</span>
        )}
        {event.resumed_at ? (
          <span className="text-xs text-muted-foreground print:text-gray-500">Resumed {fmtDate(event.resumed_at)}</span>
        ) : (
          <span className="text-xs font-semibold text-orange-400 print:text-orange-700">Still stopped</span>
        )}
      </div>
    )
  }
  if (event._type === 'CHECK_RESULT') {
    const t = event.template as any
    return (
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-semibold text-foreground print:text-black">{t?.name ?? '—'}</span>
        {event.numeric_value != null && (
          <span className="font-mono text-xs text-muted-foreground print:text-gray-500">
            {event.numeric_value}{t?.unit ? ` ${t.unit}` : ''}
            {t?.target_value != null && ` (target: ${t.target_value})`}
          </span>
        )}
        {event.text_value && (
          <span className="text-xs text-muted-foreground print:text-gray-500 italic">{event.text_value}</span>
        )}
      </div>
    )
  }
  // QC (first-off / last-off)
  return (
    <div className="flex flex-col gap-0.5">
      <span className={`text-[11px] font-semibold uppercase tracking-wide ${
        event.result === 'PASS' ? 'text-emerald-400 print:text-emerald-700' : 'text-red-400 print:text-red-700'
      }`}>{event.result}</span>
      {event.redeemed_by ? (
        <span className="text-xs text-muted-foreground print:text-gray-500">Redeemed by {event.redeemed_by}</span>
      ) : (
        <span className="text-xs text-orange-400 print:text-orange-700">Pending redemption</span>
      )}
    </div>
  )
}

// ---- Duration cell ----

function EventDuration({ event }: { event: ActivityEvent }) {
  if (event._type === 'SESSION') {
    return <span className="font-mono text-xs">{durationStr(null, event.started_at, event.ended_at)}</span>
  }
  if (event._type === 'STOPPAGE') {
    return <span className="font-mono text-xs">{durationStr(event.duration_mins)}</span>
  }
  return <span className="text-muted-foreground print:text-gray-400">—</span>
}

// ---- Tolerance Chart ----

function ToleranceChart({ events }: { events: ActivityEvent[] }) {
  // Collect all numeric check results and group by check name
  const numericEvents = events.filter(
    e => e._type === 'CHECK_RESULT' && e.numeric_value != null && e.template?.input_type === 'NUMERIC'
  )
  if (numericEvents.length === 0) return null

  // Group by template name
  const groups = new Map<string, { name: string; target: number; upper: number; lower: number; unit: string | null; data: { time: string; value: number; result: string | null }[] }>()
  for (const e of numericEvents) {
    const t = e.template as any
    const key = t?.name ?? 'Unknown'
    if (!groups.has(key)) {
      groups.set(key, {
        name: key,
        target: t?.target_value ?? 0,
        upper: (t?.target_value ?? 0) + (t?.tolerance_plus ?? 0),
        lower: (t?.target_value ?? 0) - (t?.tolerance_minus ?? 0),
        unit: t?.unit ?? null,
        data: [],
      })
    }
    groups.get(key)!.data.push({
      time: new Date(e._time).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
      value: e.numeric_value,
      result: e.result,
    })
  }

  return (
    <div className="flex flex-col gap-6 print:gap-4">
      <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Tolerance Charts</h3>
      {Array.from(groups.values()).map(g => (
        <div key={g.name} className="rounded-xl border border-border bg-card p-5 flex flex-col gap-3 print:border-gray-300">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-foreground">{g.name}</p>
            <p className="text-xs text-muted-foreground font-mono">
              Target: {g.target}{g.unit ? ` ${g.unit}` : ''} &nbsp;|&nbsp; UCL: {g.upper} &nbsp;|&nbsp; LCL: {g.lower}
            </p>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={g.data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} />
              <YAxis
                domain={[
                  Math.min(g.lower * 0.995, ...g.data.map(d => d.value)) * 0.999,
                  Math.max(g.upper * 1.005, ...g.data.map(d => d.value)) * 1.001,
                ]}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                tickFormatter={v => `${v}${g.unit ? g.unit : ''}`}
                width={60}
              />
              <Tooltip
                contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                formatter={(val: number) => [`${val}${g.unit ? ` ${g.unit}` : ''}`, g.name]}
              />
              {/* Reference lines */}
              <ReferenceLine y={g.target} stroke="hsl(var(--primary))" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: 'Target', fill: 'hsl(var(--primary))', fontSize: 10, position: 'right' }} />
              <ReferenceLine y={g.upper} stroke="#ef4444" strokeDasharray="3 3" strokeWidth={1} label={{ value: 'UCL', fill: '#ef4444', fontSize: 10, position: 'right' }} />
              <ReferenceLine y={g.lower} stroke="#ef4444" strokeDasharray="3 3" strokeWidth={1} label={{ value: 'LCL', fill: '#ef4444', fontSize: 10, position: 'right' }} />
              <Line
                type="monotone"
                dataKey="value"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={(props: any) => {
                  const { cx, cy, payload } = props
                  const colour = payload.result === 'FAIL' ? '#ef4444' : payload.result === 'PASS' ? '#22c55e' : 'hsl(var(--primary))'
                  return <circle key={`dot-${cx}-${cy}`} cx={cx} cy={cy} r={4} fill={colour} stroke="none" />
                }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ))}
    </div>
  )
}

// ---- Main component ----

export function ActivityLogClient({
  events,
  users,
  machineId,
  initialFilters,
}: {
  events: ActivityEvent[]
  users: User[]
  machineId: string
  initialFilters: { from?: string; to?: string; mo?: string; userId?: string }
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [from,   setFrom]   = useState(initialFilters.from   ?? '')
  const [to,     setTo]     = useState(initialFilters.to     ?? '')
  const [mo,     setMo]     = useState(initialFilters.mo     ?? '')
  const [userId, setUserId] = useState(initialFilters.userId ?? '')

  function applyFilters() {
    const params = new URLSearchParams()
    if (from)   params.set('from', from)
    if (to)     params.set('to', to)
    if (mo)     params.set('mo', mo.trim())
    if (userId) params.set('userId', userId)
    startTransition(() => {
      router.push(`?${params.toString()}`)
    })
  }

  function clearFilters() {
    setFrom(''); setTo(''); setMo(''); setUserId('')
    startTransition(() => router.push('?'))
  }

  const hasFilters = from || to || mo || userId

  return (
    <div className="p-8 flex flex-col gap-6">

      {/* Filter bar — hidden during print */}
      <div className="print:hidden flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">

          {/* Date from */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">From</label>
            <input
              type="date"
              value={from}
              onChange={e => setFrom(e.target.value)}
              className="h-9 px-3 rounded-lg bg-card border border-border text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          {/* Date to */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">To</label>
            <input
              type="date"
              value={to}
              onChange={e => setTo(e.target.value)}
              className="h-9 px-3 rounded-lg bg-card border border-border text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          {/* MO Number */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">MO Number</label>
            <input
              type="text"
              value={mo}
              onChange={e => setMo(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && applyFilters()}
              placeholder="e.g. MO-2401"
              className="h-9 px-3 rounded-lg bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary transition-colors w-40 font-mono"
            />
          </div>

          {/* User */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Operator</label>
            <select
              value={userId}
              onChange={e => setUserId(e.target.value)}
              className="h-9 px-3 rounded-lg bg-card border border-border text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
            >
              <option value="">All operators</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.display_name}</option>
              ))}
            </select>
          </div>

          {/* Apply + Clear */}
          <div className="flex items-center gap-2 pb-0.5">
            <button
              onClick={applyFilters}
              disabled={isPending}
              className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold flex items-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Search className="w-3.5 h-3.5" />
              Apply
            </button>
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="h-9 px-3 rounded-lg bg-muted text-muted-foreground text-sm font-semibold flex items-center gap-1.5 hover:text-foreground transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Clear
              </button>
            )}
          </div>

          {/* Print button — far right */}
          <div className="ml-auto pb-0.5">
            <button
              onClick={() => window.print()}
              className="h-9 px-4 rounded-lg bg-card border border-border text-sm font-semibold flex items-center gap-2 text-foreground hover:bg-muted transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              Print PDF
            </button>
          </div>
        </div>

        {/* Active filter pills */}
        {hasFilters && (
          <div className="flex flex-wrap gap-2">
            {from   && <FilterPill label={`From: ${from}`}   onRemove={() => { setFrom('');   applyFilters() }} />}
            {to     && <FilterPill label={`To: ${to}`}       onRemove={() => { setTo('');     applyFilters() }} />}
            {mo     && <FilterPill label={`MO: ${mo}`}       onRemove={() => { setMo('');     applyFilters() }} />}
            {userId && <FilterPill label={`Operator: ${users.find(u => u.id === userId)?.display_name ?? userId}`} onRemove={() => { setUserId(''); applyFilters() }} />}
          </div>
        )}
      </div>

      {/* Tolerance charts — only shown if numeric check results exist */}
      <ToleranceChart events={events} />

      {/* Result count */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground print:text-gray-500">
          {events.length} event{events.length !== 1 ? 's' : ''}{hasFilters ? ' matching filters' : ' total'}
        </p>
      </div>

      {/* Table */}
      {events.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border border-border rounded-xl print:border-gray-300">
          No events found for the selected filters.
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-x-auto print:border-gray-300 print:rounded-none">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border print:bg-gray-100 print:border-gray-300">
              <tr>
                {['Time', 'Type', 'MO Number', 'Operator', 'Detail', 'Duration'].map(h => (
                  <th key={h} className="text-left text-xs font-semibold uppercase tracking-widest text-muted-foreground px-4 py-3 whitespace-nowrap print:text-gray-600">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border print:divide-gray-200">
              {events.map((ev, i) => (
                <tr key={ev.id ?? i} className="bg-card hover:bg-muted/30 transition-colors print:bg-white">
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap print:text-gray-500">
                    {fmtDate(ev._time)}
                  </td>
                  <td className="px-4 py-3">
                    <EventTypeBadge event={ev} />
                  </td>
                  <td className="px-4 py-3 font-mono font-semibold text-foreground print:text-black">
                    {ev.mo_number ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-foreground print:text-black">
                    {ev._type === 'SESSION'
                      ? (ev.user?.display_name ?? ev.operator?.display_name ?? '—')
                      : (ev.operator ?? ev.issued_by ?? '—')}
                  </td>
                  <td className="px-4 py-3">
                    <EventDetail event={ev} />
                  </td>
                  <td className="px-4 py-3 text-foreground print:text-black">
                    <EventDuration event={ev} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function FilterPill({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
      {label}
      <button onClick={onRemove} aria-label={`Remove filter ${label}`} className="hover:text-primary/60 transition-colors">
        <X className="w-3 h-3" />
      </button>
    </span>
  )
}

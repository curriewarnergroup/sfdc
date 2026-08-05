'use client'

import { useState } from 'react'
import { Search, Download } from 'lucide-react'

type LogRow = {
  id: string
  action?: string
  event_type?: string
  occurred_at?: string
  created_at?: string
  target_table?: string
  session_id?: string
  actor_user?: { display_name: string } | null
  device?: { station_name: string } | null
  metadata?: Record<string, any> | null
}

export function AuditClient({ log }: { log: LogRow[] }) {
  const [search, setSearch] = useState('')

  const filtered = log.filter(r => {
    const q = search.toLowerCase()
    if (!q) return true
    return (
      (r.action ?? r.event_type ?? '').toLowerCase().includes(q) ||
      (r.actor_user?.display_name ?? '').toLowerCase().includes(q) ||
      (r.device?.station_name ?? '').toLowerCase().includes(q) ||
      (r.target_table ?? '').toLowerCase().includes(q) ||
      (r.session_id ?? '').toLowerCase().includes(q)
    )
  })

  function handleCsvExport() {
    const rows = [
      ['Time', 'Event', 'Actor', 'Station', 'Reference', 'Metadata'],
      ...filtered.map(r => [
        new Date(r.occurred_at ?? r.created_at ?? '').toISOString(),
        r.action ?? r.event_type ?? '',
        r.actor_user?.display_name ?? '',
        r.device?.station_name ?? '',
        r.target_table ?? r.session_id ?? '',
        JSON.stringify(r.metadata ?? {}),
      ]),
    ]
    const csv = rows.map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = 'audit-log.csv'; a.click()
  }

  return (
    <div className="p-8 space-y-5">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search events, actors…"
            className="w-full h-10 pl-9 pr-3 rounded-lg bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <span className="text-sm text-muted-foreground ml-auto">{filtered.length} events</span>
        <button onClick={handleCsvExport} className="h-10 px-4 rounded-lg border border-border text-sm font-medium hover:bg-muted flex items-center gap-2">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      <div className="rounded-xl border border-border overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[700px]">
          <thead className="bg-muted/50 border-b border-border">
            <tr>{['Timestamp', 'Event', 'Actor / Station', 'Reference', 'Detail'].map(h => (
              <th key={h} className="text-left text-xs font-semibold uppercase tracking-widest text-muted-foreground px-4 py-3 whitespace-nowrap">{h}</th>
            ))}</tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map(r => (
              <tr key={r.id} className="bg-card hover:bg-muted/30 transition-colors">
                <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(r.occurred_at ?? r.created_at ?? '').toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' })}
                </td>
                <td className="px-4 py-2.5 text-xs font-semibold text-foreground whitespace-nowrap">
                  {r.action ?? r.event_type ?? '—'}
                </td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">
                  {r.actor_user?.display_name ?? r.device?.station_name ?? '—'}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                  {r.target_table ?? (r.session_id ? r.session_id.slice(0, 8) + '…' : '—')}
                </td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-xs truncate">
                  {r.metadata ? JSON.stringify(r.metadata) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No audit events match your search.</p>}
      </div>
    </div>
  )
}

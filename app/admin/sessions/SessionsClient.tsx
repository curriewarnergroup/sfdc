'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { autoCloseSession } from '@/lib/actions/admin'
import { adminPauseSession, adminResumeSession } from '@/lib/actions/sessions'
import { StatusBadge } from '../_components/AdminShell'
import { elapsedStr } from '../_components/admin-utils'
import { Search, Download } from 'lucide-react'

type Session = {
  id: string; status: string; session_type: string; mo_number?: string
  started_at: string; ended_at?: string | null
  user?: { display_name: string; user_code: string } | null
  machine?: { machine_code: string } | null
  device?: { station_name: string } | null
  authoriser?: { display_name: string; user_code: string } | null
}

type PauseReason = { id: string; label: string }

const STATUS_OPTIONS = ['ALL', 'ACTIVE', 'PAUSED', 'FINISHED', 'AUTO_CLOSED']
const TYPE_OPTIONS   = ['ALL', 'SETUP', 'RUN', 'UNMANNED']

export function SessionsClient({ sessions, pauseReasons }: { sessions: Session[]; pauseReasons: PauseReason[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [search,  setSearch]  = useState('')
  const [status,  setStatus]  = useState('ALL')
  const [type,    setType]    = useState('ALL')

  // Pause modal state
  const [pauseTarget, setPauseTarget] = useState<Session | null>(null)
  const [selectedReasonId, setSelectedReasonId] = useState('')
  const [pauseError, setPauseError] = useState('')

  const filtered = sessions.filter(s => {
    const matchStatus = status === 'ALL' || s.status === status
    const matchType   = type   === 'ALL' || s.session_type === type
    const q = search.toLowerCase()
    const matchSearch = !q ||
      (s.user?.display_name ?? '').toLowerCase().includes(q) ||
      (s.user?.user_code ?? '').toLowerCase().includes(q) ||
      (s.mo_number ?? '').toLowerCase().includes(q) ||
      (s.machine?.machine_code ?? '').toLowerCase().includes(q)
    return matchStatus && matchType && matchSearch
  })

  function handleForceClose(id: string) {
    if (!confirm('Force-close this session?')) return
    startTransition(async () => { await autoCloseSession(id); router.refresh() })
  }

  function handlePauseConfirm() {
    if (!pauseTarget || !selectedReasonId) { setPauseError('Please select a pause reason.'); return }
    setPauseError('')
    startTransition(async () => {
      const res = await adminPauseSession({ sessionId: pauseTarget.id, pauseReasonId: selectedReasonId })
      if (!res.ok) { setPauseError(res.error ?? 'Failed to pause.'); return }
      setPauseTarget(null)
      setSelectedReasonId('')
      router.refresh()
    })
  }

  function handleResume(id: string) {
    startTransition(async () => { await adminResumeSession({ sessionId: id }); router.refresh() })
  }

  function handleCsvExport() {
    const rows = [
      ['ID', 'Type', 'Operator', 'MO', 'Machine', 'Station', 'Status', 'Started', 'Ended'],
      ...filtered.map(s => [
        s.id, s.session_type,
        s.user?.display_name ?? s.user?.user_code ?? '',
        s.mo_number ?? '', s.machine?.machine_code ?? '',
        s.device?.station_name ?? '', s.status,
        new Date(s.started_at).toISOString(),
        s.ended_at ? new Date(s.ended_at).toISOString() : '',
      ]),
    ]
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = 'sessions.csv'; a.click()
  }

  return (
    <div className="p-8 space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search operator, MO, machine…"
            className="h-10 pl-9 pr-3 w-64 rounded-lg bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <select value={status} onChange={e => setStatus(e.target.value)}
          className="h-10 px-3 rounded-lg bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring">
          {STATUS_OPTIONS.map(o => <option key={o}>{o}</option>)}
        </select>
        <select value={type} onChange={e => setType(e.target.value)}
          className="h-10 px-3 rounded-lg bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring">
          {TYPE_OPTIONS.map(o => <option key={o}>{o}</option>)}
        </select>
        <span className="text-sm text-muted-foreground ml-auto">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</span>
        <button onClick={handleCsvExport} className="h-10 px-4 rounded-lg border border-border text-sm font-medium hover:bg-muted flex items-center gap-2">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[800px]">
          <thead className="bg-muted/50 border-b border-border">
            <tr>{['Operator', 'MO', 'Machine', 'Station', 'Type', 'Status', 'Authorised By', 'Started', 'Duration', ''].map(h => (
              <th key={h} className="text-left text-xs font-semibold uppercase tracking-widest text-muted-foreground px-4 py-3 whitespace-nowrap">{h}</th>
            ))}</tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map(s => {
              const live = !s.ended_at
              const dur  = live
                ? elapsedStr(s.started_at)
                : elapsedStr(s.started_at) // approximate using ended_at
              return (
                <tr key={s.id} className="bg-card hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-foreground">{s.user?.display_name ?? s.user?.user_code ?? '—'}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{s.mo_number ?? '—'}</td>
                  <td className="px-4 py-2.5">{s.machine?.machine_code ?? '—'}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{s.device?.station_name ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                      s.session_type === 'UNMANNED'
                        ? 'bg-blue-400/15 text-blue-400'
                        : 'bg-muted text-muted-foreground'
                    }`}>{s.session_type}</span>
                  </td>
                  <td className="px-4 py-2.5"><StatusBadge status={s.status} /></td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {s.authoriser?.display_name ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(s.started_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{dur}</td>
                  <td className="px-4 py-2.5">
                    {live && (
                      <div className="flex items-center gap-3">
                        {s.status === 'ACTIVE' && (
                          <button
                            onClick={() => { setPauseTarget(s); setSelectedReasonId(''); setPauseError('') }}
                            disabled={pending}
                            className="text-xs text-status-paused hover:underline font-medium disabled:opacity-40"
                          >
                            Pause
                          </button>
                        )}
                        {s.status === 'PAUSED' && (
                          <button
                            onClick={() => handleResume(s.id)}
                            disabled={pending}
                            className="text-xs text-status-running hover:underline font-medium disabled:opacity-40"
                          >
                            Resume
                          </button>
                        )}
                        <button onClick={() => handleForceClose(s.id)} disabled={pending}
                          className="text-xs text-destructive hover:underline font-medium disabled:opacity-40">
                          Force Close
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No sessions match your filters.</p>}
      </div>

      {/* Pause modal */}
      {pauseTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 space-y-5 shadow-xl">
            <div>
              <h2 className="text-base font-bold uppercase tracking-widest text-foreground">Pause Session</h2>
              <p className="text-sm text-muted-foreground mt-1">
                <span className="font-mono font-bold text-foreground">{pauseTarget.mo_number ?? '—'}</span>
                {' '}on <span className="font-semibold">{pauseTarget.machine?.machine_code ?? '—'}</span>
                {' '}— <span className="font-semibold text-blue-400">{pauseTarget.session_type}</span>
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Pause Reason</p>
              <div className="grid grid-cols-2 gap-2">
                {pauseReasons.map(r => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => { setSelectedReasonId(r.id); setPauseError('') }}
                    className={`h-11 rounded-lg text-sm font-semibold transition-colors ${
                      selectedReasonId === r.id
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {pauseError && (
              <p className="text-xs text-destructive">{pauseError}</p>
            )}

            <div className="flex gap-3 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => { setPauseTarget(null); setSelectedReasonId(''); setPauseError('') }}
                disabled={pending}
                className="flex-1 h-10 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePauseConfirm}
                disabled={pending || !selectedReasonId}
                className="flex-1 h-10 rounded-lg bg-status-paused text-white text-sm font-bold uppercase tracking-widest disabled:opacity-40 transition-opacity"
              >
                {pending ? 'Pausing…' : 'Confirm Pause'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

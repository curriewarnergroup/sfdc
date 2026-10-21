import { getDashboardStats } from '@/lib/actions/admin'
import { AdminShell, PageHeader, StatCard, StatusBadge } from './_components/AdminShell'
import { ForceCloseButton } from './_components/ForceCloseButton'
import { elapsedStr } from './_components/admin-utils'
import { AlertTriangle } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function AdminDashboardPage() {
  const { activeSessions, longRunning, pausedSessions, unmannedSessions, machineActivity } = await getDashboardStats()

  // One row per machine: merge any concurrent live sessions (multi-setup machines).
  const liveByMachine = new Map<string, any[]>()
  for (const s of activeSessions as any[]) {
    const list = liveByMachine.get(s.machine_id) ?? []
    list.push(s)
    liveByMachine.set(s.machine_id, list)
  }
  const liveMachines = [...liveByMachine.values()].map(list => {
    const oldest = list.reduce((a, b) => (a.started_at < b.started_at ? a : b))
    return {
      machineId: list[0].machine_id as string,
      machine: list[0].machine,
      sessions: list,
      status: list.every(s => s.status === 'PAUSED') ? 'PAUSED' : 'ACTIVE',
      oldestStartedAt: oldest.started_at as string,
      isLong: list.some(s => longRunning.some((lr: any) => lr.id === s.id)),
    }
  })

  return (
    <AdminShell>
      <PageHeader title="Dashboard" subtitle="Live shopfloor overview" />
      <div className="p-8 space-y-8">

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Active"      value={activeSessions.filter(s => s.status === 'ACTIVE').length} />
          <StatCard label="Paused"      value={pausedSessions.length} />
          <StatCard label=">4h Running" value={longRunning.length} sub="Possible exceptions" />
          <StatCard label="Unmanned"    value={unmannedSessions.length} sub="Running without operator" />
        </div>

        {/* Unmanned runs banner */}
        {unmannedSessions.length > 0 && (
          <div className="rounded-xl border border-blue-400/40 bg-blue-400/10 px-5 py-4 flex items-start gap-3">
            <svg className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {unmannedSessions.length} unmanned run{unmannedSessions.length > 1 ? 's' : ''} active
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {unmannedSessions.map((s: any) => (
                  <span key={s.id} className="text-xs font-mono bg-blue-400/20 text-blue-300 px-2 py-0.5 rounded">
                    {s.machine?.machine_code ?? '—'} / {s.mo_number} — auth: {s.authoriser?.display_name ?? s.user?.display_name ?? '—'} ({elapsedStr(s.started_at)})
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Exception banner */}
        {longRunning.length > 0 && (
          <div className="rounded-xl border border-status-paused/40 bg-status-paused/10 px-5 py-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-status-paused shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-foreground">
                {longRunning.length} session{longRunning.length > 1 ? 's' : ''} running longer than 4 hours
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Review below — they may need force-closing.
              </p>
            </div>
          </div>
        )}

        {/* Live sessions table */}
        <section aria-labelledby="live-sessions-heading">
          <h2 id="live-sessions-heading" className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
            Live Sessions
          </h2>
          {liveMachines.length === 0 ? (
            <div className="rounded-xl border border-border bg-card px-6 py-10 text-center text-sm text-muted-foreground">
              No active sessions right now.
            </div>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    {['Machine', 'Operator', 'MO', 'Station', 'Type', 'Status', 'Elapsed', ''].map(h => (
                      <th key={h} className="text-left text-xs font-semibold uppercase tracking-widest text-muted-foreground px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {liveMachines.map(m => (
                    <tr key={m.machineId} className={`${m.isLong ? 'bg-status-paused/5' : 'bg-card'} hover:bg-muted/30 transition-colors align-top`}>
                      <td className="px-4 py-3 font-semibold text-foreground">{m.machine?.machine_code ?? '—'}</td>
                      <td className="px-4 py-3 font-medium text-foreground">
                        {m.sessions.map((s: any) => (
                          <div key={s.id}>{s.user?.display_name ?? s.user?.user_code ?? '—'}</div>
                        ))}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {m.sessions.map((s: any) => (
                          <div key={s.id}>{s.mo_number ?? '—'}</div>
                        ))}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {m.sessions.map((s: any) => (
                          <div key={s.id}>{s.device?.station_name ?? '—'}</div>
                        ))}
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold text-muted-foreground">
                        {m.sessions.map((s: any) => (
                          <div key={s.id}>{s.session_type}</div>
                        ))}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={m.status} /></td>
                      <td className={`px-4 py-3 font-mono text-xs ${m.isLong ? 'text-status-paused font-bold' : 'text-muted-foreground'}`}>
                        {m.isLong && <AlertTriangle className="w-3 h-3 inline mr-1" />}
                        {elapsedStr(m.oldestStartedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          {m.sessions.map((s: any) => (
                            <ForceCloseButton key={s.id} sessionId={s.id} contextLabel={s.mo_number ?? undefined} />
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Recent activity: last 7 days, one row per machine */}
        <section aria-labelledby="recent-activity-heading">
          <h2 id="recent-activity-heading" className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
            Recent Activity by Machine (Last 7 Days)
          </h2>
          {machineActivity.length === 0 ? (
            <div className="rounded-xl border border-border bg-card px-6 py-10 text-center text-sm text-muted-foreground">
              No machine activity in the last 7 days.
            </div>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    {['Machine', 'Latest Activity', 'Operator', 'MO', 'Type', 'Status', 'Sessions'].map(h => (
                      <th key={h} className="text-left text-xs font-semibold uppercase tracking-widest text-muted-foreground px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {machineActivity.map(m => {
                    const s = m.last_session
                    return (
                      <tr key={m.machine_id} className="bg-card hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-2.5">
                          <p className="font-semibold text-foreground">{m.machine_code}</p>
                          {m.description && <p className="text-xs text-muted-foreground">{m.description}</p>}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground font-mono whitespace-nowrap">
                          {m.live
                            ? 'Now'
                            : new Date(m.last_activity_at).toLocaleString('en-GB', {
                                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London',
                              })}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-foreground">{s.user?.display_name ?? '—'}</td>
                        <td className="px-4 py-2.5 text-xs font-mono text-foreground">{s.mo_number ?? '—'}</td>
                        <td className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">{s.session_type}</td>
                        <td className="px-4 py-2.5">
                          {m.live
                            ? <StatusBadge status={s.status} />
                            : <span className="text-xs text-muted-foreground">Ended</span>}
                        </td>
                        <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">{m.session_count}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

      </div>
    </AdminShell>
  )
}

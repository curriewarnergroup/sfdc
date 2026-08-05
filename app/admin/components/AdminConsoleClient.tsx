'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  runShiftCloseout,
  autoCloseSession,
  createShopfloorUser,
  toggleShopfloorUser,
  createMachine,
  createPauseReason,
  createDevice,
} from '@/lib/actions/admin'
import type { Session, ShopfloorUser, Machine, PauseReason, AuditLog } from '@/lib/types'
import { cn } from '@/lib/utils'

type Tab = 'sessions' | 'users' | 'machines' | 'audit' | 'settings'

interface Props {
  sessions: Session[]
  auditLog: AuditLog[]
  users: ShopfloorUser[]
  machines: Machine[]
  pauseReasons: PauseReason[]
}

export function AdminConsoleClient({ sessions, auditLog, users, machines, pauseReasons }: Props) {
  const [tab, setTab] = useState<Tab>('sessions')

  const tabs: { id: Tab; label: string }[] = [
    { id: 'sessions', label: 'Sessions' },
    { id: 'users', label: 'Users' },
    { id: 'machines', label: 'Machines' },
    { id: 'audit', label: 'Audit' },
    { id: 'settings', label: 'Settings' },
  ]

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3 bg-card border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
            <svg className="w-4 h-4 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground leading-none">ShopTrack</p>
            <p className="text-xs text-muted-foreground leading-none mt-0.5">Admin Console</p>
          </div>
        </div>
        <nav className="flex items-center gap-2 text-xs">
          <a href="/kiosk" className="px-3 py-1.5 rounded-md bg-secondary text-secondary-foreground font-semibold hover:bg-secondary/80 transition-colors">Kiosk</a>
          <a href="/qc" className="px-3 py-1.5 rounded-md bg-secondary text-secondary-foreground font-semibold hover:bg-secondary/80 transition-colors">QC</a>
        </nav>
      </header>

      {/* Tab bar */}
      <div className="flex gap-1 px-4 pt-4 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-widest whitespace-nowrap transition-colors',
              tab === t.id ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground border border-border hover:text-foreground'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <main className="flex-1 p-4 max-w-5xl mx-auto w-full">
        {tab === 'sessions' && <SessionsTab sessions={sessions} />}
        {tab === 'users' && <UsersTab users={users} />}
        {tab === 'machines' && <MachinesTab machines={machines} />}
        {tab === 'audit' && <AuditTab auditLog={auditLog} />}
        {tab === 'settings' && <SettingsTab pauseReasons={pauseReasons} />}
      </main>
    </div>
  )
}

// ── Sessions Tab ─────────────────────────────────────────────────────────────

function SessionsTab({ sessions }: { sessions: Session[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [filter, setFilter] = useState('ALL')
  const [closeoutResult, setCloseoutResult] = useState<string | null>(null)

  const filtered = filter === 'ALL' ? sessions : sessions.filter((s) => s.status === filter)

  function handleCloseout() {
    startTransition(async () => {
      const res = await runShiftCloseout()
      if (res.ok) {
        setCloseoutResult(`Closed ${res.data?.closed ?? 0} session(s).`)
        router.refresh()
      } else {
        setCloseoutResult(`Error: ${res.error}`)
      }
    })
  }

  function handleAutoClose(id: string) {
    startTransition(async () => {
      await autoCloseSession(id)
      router.refresh()
    })
  }

  const statusColors: Record<string, string> = {
    ACTIVE: 'bg-status-running/20 text-status-running',
    PAUSED: 'bg-status-paused/20 text-status-paused',
    FINISHED: 'bg-muted text-muted-foreground',
    AUTO_CLOSED: 'bg-status-error/20 text-status-error',
  }

  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-2">
          {['ALL', 'ACTIVE', 'PAUSED', 'FINISHED', 'AUTO_CLOSED'].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-widest transition-colors',
                filter === s ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              )}
            >
              {s.replace('_', ' ')}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {closeoutResult && <p className="text-xs text-muted-foreground">{closeoutResult}</p>}
          <button
            onClick={handleCloseout}
            disabled={pending}
            className="px-4 py-2 rounded-lg bg-status-error/20 border border-status-error/30 text-status-error text-xs font-bold uppercase tracking-widest hover:bg-status-error/30 transition-colors disabled:opacity-40"
          >
            {pending ? 'Running…' : 'Shift Closeout'}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {filtered.length === 0 && (
          <p className="text-center text-muted-foreground py-12">No sessions found.</p>
        )}
        {filtered.map((s) => {
          const user = (s as any).user
          const machine = (s as any).machine
          return (
            <div key={s.id} className="bg-card rounded-xl border border-border p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-bold font-mono text-foreground">{s.mo_number}</span>
                    <span className={cn('text-xs font-bold px-2 py-0.5 rounded-md uppercase', statusColors[s.status] ?? 'bg-muted text-muted-foreground')}>
                      {s.status.replace('_', ' ')}
                    </span>
                    <span className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-md font-bold uppercase">
                      {s.session_type}
                    </span>
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground flex-wrap">
                    <span>{machine?.machine_code ?? '—'}</span>
                    <span>{user?.display_name ?? '—'} <span className="font-mono">({user?.user_code})</span></span>
                    <span>{new Date(s.started_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</span>
                  </div>
                </div>
                {(s.status === 'ACTIVE' || s.status === 'PAUSED') && (
                  <button
                    onClick={() => handleAutoClose(s.id)}
                    disabled={pending}
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-status-error/20 text-status-error text-xs font-bold uppercase hover:bg-status-error/30 transition-colors"
                  >
                    Force Close
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Users Tab ─────────────────────────────────────────────────────────────────

function UsersTab({ users }: { users: ShopfloorUser[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [showForm, setShowForm] = useState(false)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('OPERATOR')
  const [error, setError] = useState('')

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    startTransition(async () => {
      const res = await createShopfloorUser({ userCode: code, displayName: name, role })
      if (res.ok) {
        setShowForm(false)
        setCode('')
        setName('')
        router.refresh()
      } else {
        setError(res.error ?? 'Error')
      }
    })
  }

  function handleToggle(id: string, isActive: boolean) {
    startTransition(async () => {
      await toggleShopfloorUser(id, !isActive)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4 pt-4">
      <div className="flex justify-end">
        <button
          onClick={() => setShowForm((v) => !v)}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold uppercase tracking-widest"
        >
          {showForm ? 'Cancel' : 'Add User'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-card rounded-xl border border-border p-5 space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">New Shopfloor User</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Code</label>
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="OP003" required
                className="w-full h-12 px-3 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono" />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value)}
                className="w-full h-12 px-3 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                {['OPERATOR', 'SETTER', 'QC', 'ADMIN'].map((r) => <option key={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Display Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full Name" required
              className="w-full h-12 px-3 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          {error && <p className="text-xs text-destructive-foreground bg-destructive/20 border border-destructive/30 rounded px-3 py-2">{error}</p>}
          <button type="submit" disabled={pending}
            className="w-full h-12 rounded-lg bg-primary text-primary-foreground font-bold uppercase tracking-widest disabled:opacity-40">
            Create User
          </button>
        </form>
      )}

      <div className="space-y-2">
        {users.map((u) => (
          <div key={u.id} className={cn('bg-card rounded-xl border border-border p-4 flex items-center justify-between', !u.is_active && 'opacity-50')}>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-foreground">{u.display_name}</span>
                <span className="font-mono text-xs text-muted-foreground">{u.user_code}</span>
                <span className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-md font-bold uppercase">{u.role}</span>
              </div>
              <p className="text-xs text-muted-foreground">{u.is_active ? 'Active' : 'Inactive'}</p>
            </div>
            <button
              onClick={() => handleToggle(u.id, u.is_active)}
              disabled={pending}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors',
                u.is_active ? 'bg-status-error/20 text-status-error hover:bg-status-error/30' : 'bg-status-running/20 text-status-running hover:bg-status-running/30'
              )}
            >
              {u.is_active ? 'Deactivate' : 'Activate'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Machines Tab ──────────────────────────────────────────────────────────────

function MachinesTab({ machines }: { machines: Machine[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [showForm, setShowForm] = useState(false)
  const [code, setCode] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    startTransition(async () => {
      const res = await createMachine({ machineCode: code, description })
      if (res.ok) {
        setShowForm(false)
        setCode('')
        setDescription('')
        router.refresh()
      } else {
        setError(res.error ?? 'Error')
      }
    })
  }

  return (
    <div className="space-y-4 pt-4">
      <div className="flex justify-end">
        <button onClick={() => setShowForm((v) => !v)} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold uppercase tracking-widest">
          {showForm ? 'Cancel' : 'Add Machine'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-card rounded-xl border border-border p-5 space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">New Machine</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Machine Code</label>
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="CNC-04" required
                className="w-full h-12 px-3 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono" />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Description</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description"
                className="w-full h-12 px-3 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          </div>
          {error && <p className="text-xs text-destructive-foreground bg-destructive/20 border border-destructive/30 rounded px-3 py-2">{error}</p>}
          <button type="submit" disabled={pending} className="w-full h-12 rounded-lg bg-primary text-primary-foreground font-bold uppercase tracking-widest disabled:opacity-40">
            Create Machine
          </button>
        </form>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {machines.map((m) => (
          <div key={m.id} className={cn('bg-card rounded-xl border border-border p-4', !m.is_active && 'opacity-50')}>
            <p className="font-bold font-mono text-foreground">{m.machine_code}</p>
            {m.description && <p className="text-xs text-muted-foreground mt-0.5">{m.description}</p>}
            <p className="text-xs text-muted-foreground mt-1">{m.is_active ? 'Active' : 'Inactive'}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Audit Tab ─────────────────────────────────────────────────────────────────

function AuditTab({ auditLog }: { auditLog: AuditLog[] }) {
  return (
    <div className="space-y-2 pt-4">
      {auditLog.length === 0 && <p className="text-center text-muted-foreground py-12">No audit events yet.</p>}
      {auditLog.map((entry) => (
        <div key={entry.id} className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="font-bold text-sm text-foreground font-mono uppercase">{entry.event_type.replace(/_/g, ' ')}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {(entry as any).actor_user?.display_name ?? (entry as any).device?.station_name ?? 'System'}
              </p>
            </div>
            <p className="text-xs text-muted-foreground tabular-nums">
              {new Date(entry.occurred_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'medium' })}
            </p>
          </div>
          {entry.metadata && Object.keys(entry.metadata).length > 0 && (
            <pre className="mt-2 text-xs text-muted-foreground bg-background rounded-lg px-3 py-2 overflow-x-auto">
              {JSON.stringify(entry.metadata, null, 2)}
            </pre>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Settings Tab ──────────────────────────────────────────────────────────────

function SettingsTab({ pauseReasons }: { pauseReasons: PauseReason[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [newReason, setNewReason] = useState('')
  const [reasonError, setReasonError] = useState('')

  // New kiosk device
  const [kioskName, setKioskName] = useState('')
  const [kioskPin, setKioskPin] = useState('')
  const [kioskError, setKioskError] = useState('')
  const [kioskOk, setKioskOk] = useState(false)

  function handleAddReason(e: React.FormEvent) {
    e.preventDefault()
    setReasonError('')
    startTransition(async () => {
      const res = await createPauseReason(newReason)
      if (res.ok) {
        setNewReason('')
        router.refresh()
      } else {
        setReasonError(res.error ?? 'Error')
      }
    })
  }

  function handleAddKiosk(e: React.FormEvent) {
    e.preventDefault()
    setKioskError('')
    setKioskOk(false)
    startTransition(async () => {
      const res = await createDevice({ stationName: kioskName, password: kioskPin })
      if (res.ok) {
        setKioskOk(true)
        setKioskName('')
        setKioskPin('')
        router.refresh()
      } else {
        setKioskError(res.error ?? 'Error')
      }
    })
  }

  return (
    <div className="space-y-6 pt-4">
      {/* Pause reasons */}
      <div className="bg-card rounded-xl border border-border p-5">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Pause Reasons</h3>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {pauseReasons.map((r) => (
            <div key={r.id} className={cn('bg-background rounded-lg border border-border px-3 py-2 text-sm', !r.is_active && 'opacity-40')}>
              {r.label}
            </div>
          ))}
        </div>
        <form onSubmit={handleAddReason} className="flex gap-2">
          <input
            value={newReason}
            onChange={(e) => setNewReason(e.target.value)}
            placeholder="New reason label…"
            required
            className="flex-1 h-10 px-3 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button type="submit" disabled={pending || !newReason}
            className="px-4 h-10 rounded-lg bg-primary text-primary-foreground text-xs font-bold uppercase tracking-widest disabled:opacity-40">
            Add
          </button>
        </form>
        {reasonError && <p className="text-xs text-destructive-foreground mt-2">{reasonError}</p>}
      </div>

      {/* New kiosk */}
      <div className="bg-card rounded-xl border border-border p-5">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Register Kiosk Device</h3>
        <form onSubmit={handleAddKiosk} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Station Name</label>
              <input value={kioskName} onChange={(e) => setKioskName(e.target.value)} placeholder="Kiosk-03" required
                className="w-full h-10 px-3 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">PIN</label>
              <input value={kioskPin} onChange={(e) => setKioskPin(e.target.value)} placeholder="4-digit PIN" required
                className="w-full h-10 px-3 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring font-mono" />
            </div>
          </div>
          {kioskOk && <p className="text-xs text-status-running">Kiosk registered successfully.</p>}
          {kioskError && <p className="text-xs text-destructive-foreground">{kioskError}</p>}
          <button type="submit" disabled={pending || !kioskName || !kioskPin}
            className="w-full h-10 rounded-lg bg-primary text-primary-foreground text-xs font-bold uppercase tracking-widest disabled:opacity-40">
            Register Kiosk
          </button>
        </form>
      </div>
    </div>
  )
}

'use client'

import { useState, useEffect, useCallback, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { BigButton } from '@/components/kiosk/BigButton'
import { ScanInput } from '@/components/kiosk/ScanInput'
import { ResumePanel } from './ResumePanel'
import { lookupUserByCode } from '@/lib/actions/sessions'
import type { Device, Session } from '@/lib/types'

// ---- Icons ----
function SetupStartIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /><path d="M4.93 4.93a10 10 0 0 0 0 14.14" /><path d="M12 2v2" /><path d="M12 20v2" />
    </svg>
  )
}
function SetupPauseIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  )
}
function RunStartIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  )
}
function RunPauseIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="17 8 21 12 17 16" /><line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}
function QcCheckIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  )
}

// ---- Elapsed time helper ----
function useElapsed(startedAt: string) {
  const [elapsed, setElapsed] = useState('')
  useEffect(() => {
    const fmt = () => {
      const s = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
      const h = Math.floor(s / 3600).toString().padStart(2, '0')
      const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0')
      const sec = (s % 60).toString().padStart(2, '0')
      setElapsed(`${h}:${m}:${sec}`)
    }
    fmt()
    const id = setInterval(fmt, 1000)
    return () => clearInterval(id)
  }, [startedAt])
  return elapsed
}

// ---- Session card for the Live Sessions tab / screensaver ----
function SessionCard({ session, onAction }: { session: Session; onAction: (s: Session) => void }) {
  const elapsed = useElapsed(session.started_at)
  const isLong = (Date.now() - new Date(session.started_at).getTime()) > 4 * 60 * 60 * 1000
  const qtyPct = session.qty_to_make && session.qty_to_make > 0
    ? Math.min(100, Math.round(((session.qty_made ?? 0) / session.qty_to_make) * 100))
    : null

  return (
    <button
      onClick={() => onAction(session)}
      className="w-full text-left rounded-2xl border-2 border-border bg-card hover:border-primary/60 transition-all p-5 flex flex-col gap-3 touch-manipulation"
      aria-label={`Session ${session.mo_number} — tap to act`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono font-bold text-xl text-foreground">{session.mo_number}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {session.session_type} &mdash; {(session as any).machine?.machine_code ?? '—'} &mdash; {(session as any).user?.display_name ?? '—'}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${
            session.status === 'ACTIVE'
              ? 'bg-status-running/20 text-status-running'
              : 'bg-status-paused/20 text-status-paused'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${session.status === 'ACTIVE' ? 'bg-status-running animate-pulse' : 'bg-status-paused'}`} />
            {session.status}
          </span>
          <span className={`font-mono text-sm font-semibold ${isLong ? 'text-status-error' : 'text-muted-foreground'}`}>{elapsed}</span>
        </div>
      </div>

      {/* Qty row */}
      {(session.qty_to_make || session.qty_made || session.qty_scrapped) ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-4 text-sm">
            <span className="text-muted-foreground">To make: <span className="text-foreground font-semibold">{session.qty_to_make ?? '—'}</span></span>
            <span className="text-muted-foreground">Made: <span className="text-status-running font-semibold">{session.qty_made ?? 0}</span></span>
            <span className="text-muted-foreground">Scrapped: <span className="text-status-error font-semibold">{session.qty_scrapped ?? 0}</span></span>
          </div>
          {qtyPct !== null && (
            <div className="w-full h-2 rounded-full bg-border overflow-hidden">
              <div
                className="h-full rounded-full bg-status-running transition-all"
                style={{ width: `${qtyPct}%` }}
                role="progressbar"
                aria-valuenow={qtyPct}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
          )}
        </div>
      ) : null}

      {/* Tap hint */}
      <p className="text-xs text-primary font-semibold">Tap to pause / finish this job</p>
    </button>
  )
}

// ---- Screensaver overlay ----
function ScreensaverDashboard({
  sessions,
  stationName,
  onDismiss,
  onAction,
}: {
  sessions: Session[]
  stationName: string
  onDismiss: () => void
  onAction: (s: Session) => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-background flex flex-col"
      onClick={onDismiss}
    >
      <div className="flex-none flex items-center justify-between px-6 py-4 border-b border-border">
        <div>
          <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/ChatGPT%20Image%20Mar%203%2C%202026%2C%2003_15_14%20PM-t6QO2pHj18qAGkSrh9JXCZzecEHZd4.png" alt="C&W ShopTrack" className="h-7 w-auto object-contain" />
          <p className="text-sm font-mono font-semibold text-primary">{stationName}</p>
        </div>
        <button
          onClick={onDismiss}
          className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold"
        >
          Back to Actions
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
        {sessions.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
            <p className="text-4xl font-black text-muted-foreground/20 uppercase tracking-widest">No Active Sessions</p>
            <p className="text-sm text-muted-foreground">Tap anywhere to return to the action screen</p>
          </div>
        ) : (
          sessions.map(s => (
            <SessionCard
              key={s.id}
              session={s}
              onAction={(sess) => { onDismiss(); onAction(sess) }}
            />
          ))
        )}
      </div>
    </div>
  )
}

// ---- Main KioskHome ----
interface KioskHomeProps {
  device: Device
  sessions: Session[]
}

const IDLE_SECONDS = 60

// Derive machine state from sessions
type MachineState = 'idle' | 'running' | 'paused'
function getMachineState(sessions: Session[]): MachineState {
  if (sessions.some(s => s.status === 'ACTIVE')) return 'running'
  if (sessions.some(s => s.status === 'PAUSED')) return 'paused'
  return 'idle'
}

// Per-state design tokens (applied inline so they override the theme)
const stateBg: Record<MachineState, string> = {
  idle:    'bg-background',
  running: 'bg-green-600',
  paused:  'bg-red-600',
}
const stateTabBorder: Record<MachineState, string> = {
  idle:    'border-border bg-card',
  running: 'border-green-500 bg-green-700',
  paused:  'border-red-500 bg-red-700',
}
const stateTabActive: Record<MachineState, string> = {
  idle:    'text-primary border-b-2 border-primary',
  running: 'text-white border-b-2 border-white',
  paused:  'text-white border-b-2 border-white',
}
const stateTabInactive: Record<MachineState, string> = {
  idle:    'text-muted-foreground hover:text-foreground',
  running: 'text-green-200 hover:text-white',
  paused:  'text-red-200 hover:text-white',
}
// Button overrides per state — returns className overrides for BigButton
function btnClass(state: MachineState, role: 'start' | 'pause'): string {
  if (state === 'idle') return ''
  if (state === 'running') {
    // Green bg: start buttons = solid white, pause/stop = solid white outlined
    return role === 'start'
      ? 'bg-white text-green-700 border-white hover:bg-green-50'
      : 'bg-green-800 text-white border-white/50 hover:bg-green-900'
  }
  // Red bg: start buttons = solid white, pause/stop = solid white outlined
  return role === 'start'
    ? 'bg-white text-red-700 border-white hover:bg-red-50'
    : 'bg-red-800 text-white border-white/50 hover:bg-red-900'
}

export function KioskHome({ device, sessions }: KioskHomeProps) {
  const router = useRouter()
  const [tab, setTab] = useState<'actions' | 'live'>('actions')
  const [screensaver, setScreensaver] = useState(false)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Admin override — a SUPERVISOR/ADMIN pin reveals every action regardless of state.
  const [adminOverride, setAdminOverride] = useState(false)
  const [adminName, setAdminName] = useState('')
  const [showAdminModal, setShowAdminModal] = useState(false)
  const [adminPin, setAdminPin] = useState('')
  const [adminError, setAdminError] = useState('')
  const [adminPending, startAdminTransition] = useTransition()

  const machineState = getMachineState(sessions)

  // Per-type session state used to drive button labels + visibility rules.
  const setupSession = sessions.find(s => s.session_type === 'SETUP') ?? null
  const runSession = sessions.find(s => s.session_type === 'RUN' || s.session_type === 'UNMANNED') ?? null
  const setupPaused = setupSession?.status === 'PAUSED'
  const runPaused = runSession?.status === 'PAUSED'
  const setupActive = setupSession?.status === 'ACTIVE'
  const runActive = runSession?.status === 'ACTIVE'
  // The single paused session (if any) drives the "Start Back Up" panel.
  const pausedSession = (setupPaused ? setupSession : runPaused ? runSession : null)

  // ── Which action buttons are relevant right now ──────────────────────────
  // The workflow is a locked loop: once a stage is started it must be finished
  // before the next stage becomes available. An admin override reveals all.
  const idle = !setupSession && !runSession
  const showSetupStart  = adminOverride || idle
  const showRunStart    = adminOverride || idle
  const showSetupManage = adminOverride || !!setupSession   // pause / finish / resume
  const showRunManage   = adminOverride || !!runSession
  const showQc          = adminOverride || setupActive || runActive
  // When exactly one primary (start/manage) button shows, let it span full width.
  const primaryCount = [showSetupStart, showRunStart, showSetupManage, showRunManage].filter(Boolean).length
  const soloClass = primaryCount === 1 ? 'col-span-2' : ''

  // Show the Start Back Up panel unless an admin has unlocked all options.
  const showResumePanel = !!pausedSession && !adminOverride

  function handleAdminUnlock() {
    if (!adminPin.trim()) { setAdminError('Please scan or enter a code.'); return }
    setAdminError('')
    startAdminTransition(async () => {
      const user = await lookupUserByCode(adminPin.trim())
      if (!user) { setAdminError('Code not found.'); return }
      if (user.role !== 'SUPERVISOR' && user.role !== 'ADMIN') {
        setAdminError('Only a SUPERVISOR or ADMIN can unlock all options.')
        return
      }
      setAdminOverride(true)
      setAdminName(user.display_name)
      setShowAdminModal(false)
      setAdminPin('')
    })
  }

  function exitAdmin() {
    setAdminOverride(false)
    setAdminName('')
  }

  const resetIdle = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => setScreensaver(true), IDLE_SECONDS * 1000)
  }, [])

  useEffect(() => {
    resetIdle()
    const events = ['mousemove', 'touchstart', 'keydown', 'click']
    events.forEach(e => window.addEventListener(e, resetIdle, { passive: true }))
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current)
      events.forEach(e => window.removeEventListener(e, resetIdle))
    }
  }, [resetIdle])

  function handleSessionAction(session: Session) {
    const path = session.session_type === 'SETUP' ? '/kiosk/setup/manage' : '/kiosk/run/manage'
    router.push(path)
  }

  // Status label shown when running or paused
  const statusLabel =
    machineState === 'running' ? 'RUNNING' :
    machineState === 'paused'  ? 'STOPPED' :
    null

  return (
    <>
      {screensaver && (
        <ScreensaverDashboard
          sessions={sessions}
          stationName={device.station_name}
          onDismiss={() => { setScreensaver(false); resetIdle() }}
          onAction={handleSessionAction}
        />
      )}

      <div className={`flex flex-col min-h-full transition-colors duration-500 ${stateBg[machineState]}`}>

        {/* Status banner — only shows when running or paused */}
        {statusLabel && (
          <div className={`flex items-center justify-center gap-3 py-2 ${
            machineState === 'running' ? 'bg-green-700' : 'bg-red-700'
          }`}>
            <span className={`w-2.5 h-2.5 rounded-full ${
              machineState === 'running' ? 'bg-white animate-pulse' : 'bg-white'
            }`} />
            <span className="text-white text-xs font-black uppercase tracking-[0.3em]">
              Machine {statusLabel}
            </span>
          </div>
        )}

        {/* Tab bar */}
        <div className={`flex border-b ${stateTabBorder[machineState]}`} role="tablist" aria-label="Kiosk sections">
          <button
            role="tab"
            aria-selected={tab === 'actions'}
            onClick={() => setTab('actions')}
            className={`flex-1 py-3 text-sm font-bold uppercase tracking-widest transition-colors ${
              tab === 'actions' ? stateTabActive[machineState] : stateTabInactive[machineState]
            }`}
          >
            Actions
          </button>
          <button
            role="tab"
            aria-selected={tab === 'live'}
            onClick={() => setTab('live')}
            className={`flex-1 py-3 text-sm font-bold uppercase tracking-widest transition-colors relative ${
              tab === 'live' ? stateTabActive[machineState] : stateTabInactive[machineState]
            }`}
          >
            Live Sessions
            {sessions.length > 0 && (
              <span className={`absolute top-2 right-1/4 w-2 h-2 rounded-full animate-pulse ${
                machineState === 'idle' ? 'bg-status-running' : 'bg-white'
              }`} />
            )}
          </button>
        </div>

        {/* Actions tab */}
        {tab === 'actions' && (
          <div className="flex-1 flex flex-col">
            {/* Admin unlock bar (top-right) */}
            <div className="flex justify-end px-6 pt-4">
              {adminOverride ? (
                <button
                  type="button"
                  onClick={exitAdmin}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors ${
                    machineState === 'idle'
                      ? 'bg-primary/15 text-primary hover:bg-primary/25'
                      : 'bg-white/20 text-white hover:bg-white/30'
                  }`}
                  aria-label="Exit admin override"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                  Admin: {adminName} — Exit
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => { setAdminPin(''); setAdminError(''); setShowAdminModal(true) }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors ${
                    machineState === 'idle'
                      ? 'bg-secondary text-muted-foreground hover:text-foreground'
                      : 'bg-white/15 text-white hover:bg-white/25'
                  }`}
                >
                  Admin
                </button>
              )}
            </div>

            {showResumePanel ? (
              <ResumePanel device={device} session={pausedSession!} />
            ) : (
              <div className="flex-1 flex items-center justify-center px-6 pb-8">
                <div className="w-full max-w-xl grid grid-cols-2 gap-4" role="group" aria-label="Kiosk actions">
                  {showSetupStart && (
                    <BigButton
                      variant="success"
                      icon={<SetupStartIcon />}
                      sublabel="Scan operator & MO"
                      onClick={() => router.push('/kiosk/setup/start')}
                      aria-label="Setup Start"
                      className={`${soloClass} ${btnClass(machineState, 'start')}`}
                    >
                      Setup Start
                    </BigButton>
                  )}
                  {showSetupManage && (
                    <BigButton
                      variant={setupPaused ? 'success' : 'warning'}
                      icon={setupPaused ? <RunStartIcon /> : <SetupPauseIcon />}
                      sublabel={setupPaused ? 'Resume the paused setup' : 'Pause or finish setup'}
                      onClick={() => router.push('/kiosk/setup/manage')}
                      aria-label={setupPaused ? 'Setup Resume' : 'Setup Pause / Finish'}
                      className={`${soloClass} ${btnClass(machineState, setupPaused ? 'start' : 'pause')}`}
                    >
                      {setupPaused ? 'Setup Resume' : 'Setup Pause / Finish'}
                    </BigButton>
                  )}
                  {showRunStart && (
                    <BigButton
                      variant="primary"
                      icon={<RunStartIcon />}
                      sublabel="Start production run"
                      onClick={() => router.push('/kiosk/run/start')}
                      aria-label="Run Start"
                      className={`${soloClass} ${btnClass(machineState, 'start')}`}
                    >
                      Run Start
                    </BigButton>
                  )}
                  {showRunManage && (
                    <BigButton
                      variant={runPaused ? 'success' : 'danger'}
                      icon={runPaused ? <RunStartIcon /> : <RunPauseIcon />}
                      sublabel={runPaused ? 'Resume the paused run' : 'Pause or finish run'}
                      onClick={() => router.push('/kiosk/run/manage')}
                      aria-label={runPaused ? 'Run Resume' : 'Run Pause / Finish'}
                      className={`${soloClass} ${btnClass(machineState, runPaused ? 'start' : 'pause')}`}
                    >
                      {runPaused ? 'Run Resume' : 'Run Pause / Finish'}
                    </BigButton>
                  )}
                  {showQc && (
                    <BigButton
                      variant="secondary"
                      icon={<QcCheckIcon />}
                      sublabel="In-process quality check"
                      onClick={() => router.push('/kiosk/qc')}
                      aria-label="QC Check"
                      className={`col-span-2 ${btnClass(machineState, 'start')}`}
                    >
                      QC Check
                    </BigButton>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Live sessions tab */}
        {tab === 'live' && (
          <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
            {sessions.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 py-20 text-center">
                <p className={`text-lg font-bold ${machineState === 'idle' ? 'text-muted-foreground' : 'text-white/70'}`}>
                  No active sessions on this station
                </p>
                <p className={`text-sm ${machineState === 'idle' ? 'text-muted-foreground' : 'text-white/50'}`}>
                  Start a setup or run to see it here
                </p>
              </div>
            ) : (
              sessions.map(s => (
                <SessionCard key={s.id} session={s} onAction={handleSessionAction} />
              ))
            )}
          </div>
        )}
      </div>

      {/* Admin unlock modal */}
      {showAdminModal && (
        <div
          className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Admin unlock"
          onClick={() => setShowAdminModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border-2 border-border bg-card p-6 flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h2 className="text-lg font-black uppercase tracking-widest text-foreground">Admin Override</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Enter a SUPERVISOR or ADMIN PIN to unlock all actions on this station.
              </p>
            </div>
            <ScanInput
              label="Supervisor / Admin PIN"
              value={adminPin}
              onChange={setAdminPin}
              onConfirm={handleAdminUnlock}
              placeholder="Scan badge or enter PIN…"
              autoFocus
              disabled={adminPending}
              hint="Must be SUPERVISOR or ADMIN role"
            />
            {adminError && (
              <p className="text-sm font-semibold text-status-error" aria-live="assertive">{adminError}</p>
            )}
            <div className="flex gap-3">
              <BigButton
                variant="secondary"
                onClick={() => setShowAdminModal(false)}
                className="flex-1"
              >
                Cancel
              </BigButton>
              <BigButton
                variant="primary"
                loading={adminPending}
                disabled={!adminPin.trim()}
                onClick={handleAdminUnlock}
                className="flex-1"
              >
                Unlock
              </BigButton>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

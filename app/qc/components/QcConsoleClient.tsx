'use client'

import { useState, useTransition, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  issueQcCode,
  recordQcFail,
  lookupQcUser,
  qcLogout,
} from '@/lib/actions/qc'
import type { Machine, QcCode, ShopfloorUser } from '@/lib/types'
import {
  ShieldCheck,
  LogOut,
  Copy,
  Check,
  CheckCircle2,
  XCircle,
  ClipboardList,
  Plus,
  ScanLine,
  AlertTriangle,
} from 'lucide-react'

interface Props {
  machines: Machine[]
  history: QcCode[]
  qcUser: ShopfloorUser
}

type CodeType = 'FIRST_OFF' | 'LAST_OFF'
type QcResult = 'PASS' | 'FAIL'
type Tab = 'issue' | 'history'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function codeStatus(code: QcCode): 'ACTIVE' | 'USED' | 'EXPIRED' {
  if (code.redeemed) return 'USED'
  if (new Date(code.expires_at) < new Date()) return 'EXPIRED'
  return 'ACTIVE'
}

function fmt(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

// ─── Main component ───────────────────────────────────────────────────────────

export function QcConsoleClient({ machines, history: initialHistory, qcUser }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('issue')
  const [history, setHistory] = useState<QcCode[]>(initialHistory)

  // Form state
  const [scannedUser, setScannedUser] = useState<ShopfloorUser | null>(null)
  const [userCode, setUserCode] = useState('')
  const [userLookupPending, startUserLookup] = useTransition()
  const [userError, setUserError] = useState('')

  const [machineCode, setMachineCode] = useState('')
  const [resolvedMachine, setResolvedMachine] = useState<Machine | null>(null)

  const [moNumber, setMoNumber] = useState('')
  const [codeType, setCodeType] = useState<CodeType>('FIRST_OFF')
  const [failNotes, setFailNotes] = useState('')

  const [formError, setFormError] = useState('')
  const [pending, startTransition] = useTransition()

  // Issued code display
  const [issued, setIssued] = useState<{ code: string; type: CodeType; result: QcResult } | null>(null)
  // Fail confirmation
  const [failRecorded, setFailRecorded] = useState(false)

  const userInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { userInputRef.current?.focus() }, [])

  // ── User scan/lookup ────────────────────────────────────────────────────────
  const handleUserScan = useCallback((code: string) => {
    setUserError('')
    startUserLookup(async () => {
      const user = await lookupQcUser(code)
      if (user) {
        setScannedUser(user)
        setUserError('')
      } else {
        setUserError('User code not found or inactive.')
        setScannedUser(null)
      }
    })
  }, [])

  // ── Issue / Fail ───────────────────────────────────────────────────────────
  const canSubmit =
    (scannedUser ?? userCode.trim()) &&
    resolvedMachine &&
    moNumber.trim().length > 0

  function handlePass() {
    if (!canSubmit || !resolvedMachine) return
    setFormError('')
    startTransition(async () => {
      const res = await issueQcCode({
        codeType,
        moNumber: moNumber.trim().toUpperCase(),
        machineId: resolvedMachine.id,
        issuedByUserCode: scannedUser?.user_code ?? qcUser.user_code,
        result: 'PASS',
      })
      if (res.ok && res.data) {
        setIssued({ code: res.data.plainCode, type: codeType, result: 'PASS' })
        router.refresh()
      } else {
        setFormError(res.error ?? 'Failed to issue code.')
      }
    })
  }

  function handleFail() {
    if (!canSubmit || !resolvedMachine) return
    setFormError('')
    startTransition(async () => {
      const res = await issueQcCode({
        codeType,
        moNumber: moNumber.trim().toUpperCase(),
        machineId: resolvedMachine.id,
        issuedByUserCode: scannedUser?.user_code ?? qcUser.user_code,
        result: 'FAIL',
      })
      if (res.ok && res.data) {
        // Also record the structured fail event with notes
        await recordQcFail({
          codeType,
          moNumber: moNumber.trim().toUpperCase(),
          machineId: resolvedMachine.id,
          issuedByUserId: qcUser.id,
          notes: failNotes.trim() || undefined,
        })
        setIssued({ code: res.data.plainCode, type: codeType, result: 'FAIL' })
        router.refresh()
      } else {
        setFormError(res.error ?? 'Failed to record failure.')
      }
    })
  }

  function handleReset() {
    setIssued(null)
    setFailRecorded(false)
    setScannedUser(null)
    setUserCode('')
    setMachineCode('')
    setResolvedMachine(null)
    setMoNumber('')
    setFailNotes('')
    setFormError('')
    setUserError('')
    setTimeout(() => userInputRef.current?.focus(), 50)
  }

  async function handleLogout() {
    await qcLogout()
    router.replace('/qc/login')
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-5 py-3 bg-card border-b border-border">
        <div className="flex items-center gap-3">
          <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/ChatGPT%20Image%20Mar%203%2C%202026%2C%2003_15_14%20PM-t6QO2pHj18qAGkSrh9JXCZzecEHZd4.png" alt="C&W ShopTrack" className="h-8 w-auto object-contain" />
          <p className="text-xs text-muted-foreground leading-none">QC Console</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground hidden sm:block">
            Signed in as{' '}
            <span className="text-foreground font-semibold">{qcUser.display_name}</span>
            <span className="ml-1.5 px-1.5 py-0.5 rounded bg-primary/20 text-primary text-[10px] font-bold uppercase">
              {qcUser.role}
            </span>
          </span>
          <a
            href="/kiosk"
            className="px-3 py-1.5 rounded-md bg-secondary text-secondary-foreground text-xs font-semibold hover:bg-secondary/80 transition-colors"
          >
            Kiosk
          </a>
          <a
            href="/admin"
            className="px-3 py-1.5 rounded-md bg-secondary text-secondary-foreground text-xs font-semibold hover:bg-secondary/80 transition-colors"
          >
            Admin
          </a>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-secondary text-secondary-foreground text-xs font-semibold hover:bg-secondary/80 transition-colors"
            aria-label="Sign out"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      {/* ── Body ─────────────────────────────────────────���─────────────────── */}
      <main className="flex-1 max-w-3xl mx-auto w-full p-4 md:p-6">
        {/* Tabs */}
        <div className="flex gap-1 bg-card rounded-xl border border-border p-1 mb-6">
          <TabBtn active={tab === 'issue'} onClick={() => setTab('issue')} icon={<Plus className="w-4 h-4" />}>
            Issue Code
          </TabBtn>
          <TabBtn active={tab === 'history'} onClick={() => setTab('history')} icon={<ClipboardList className="w-4 h-4" />}>
            Recent Codes
          </TabBtn>
        </div>

        {/* ── Issue tab ────────────────────────────────────────────────────── */}
        {tab === 'issue' && (
          <>
            {issued ? (
              <IssuedCodeDisplay issued={issued} onReset={handleReset} />
            ) : (
              <div className="bg-card rounded-xl border border-border divide-y divide-border">
                {/* Section: Who */}
                <Section label="1 — Operator / Setter">
                  <ScanField
                    inputRef={userInputRef}
                    value={userCode}
                    onChange={setUserCode}
                    onConfirm={handleUserScan}
                    placeholder="Scan badge or type user code…"
                    disabled={userLookupPending}
                    error={userError}
                    resolved={scannedUser ? scannedUser.display_name : null}
                    resolvedSub={scannedUser?.role}
                    hint="Scan the operator's badge or type their user code"
                  />
                </Section>

                {/* Section: Machine */}
                <Section label="2 — Machine">
                  <select
                    value={resolvedMachine?.id ?? ''}
                    onChange={(e) => {
                      const m = machines.find((x) => x.id === e.target.value) ?? null
                      setResolvedMachine(m)
                      setMachineCode(m?.machine_code ?? '')
                    }}
                    className="w-full h-12 px-4 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Select machine…</option>
                    {machines.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.machine_code}{m.description ? ` — ${m.description}` : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">Select the machine from the list</p>
                </Section>

                {/* Section: MO */}
                <Section label="3 — MO Number">
                  <input
                    type="text"
                    autoComplete="off"
                    autoCapitalize="characters"
                    value={moNumber}
                    onChange={(e) => setMoNumber(e.target.value.toUpperCase())}
                    placeholder="e.g. MO-2401"
                    className="w-full h-12 px-4 rounded-lg bg-background border border-border text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Scan the job traveller or type manually</p>
                </Section>

                {/* Section: Code type */}
                <Section label="4 — Code Type">
                  <div className="flex gap-3">
                    {(['FIRST_OFF', 'LAST_OFF'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setCodeType(t)}
                        className={`flex-1 h-12 rounded-lg font-bold text-sm uppercase tracking-widest transition-colors ${
                          codeType === t
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                        }`}
                      >
                        {t.replace('_', '-')}
                      </button>
                    ))}
                  </div>
                </Section>

                {/* Section: FAIL notes */}
                <Section label="5 — Failure Notes (optional)">
                  <textarea
                    value={failNotes}
                    onChange={(e) => setFailNotes(e.target.value)}
                    placeholder="Describe the defect or reason for failure (shown on FAIL only)…"
                    rows={2}
                    className="w-full px-4 py-3 rounded-lg bg-background border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  />
                </Section>

                {/* Error banner */}
                {formError && (
                  <div className="px-5 py-4">
                    <p className="flex items-center gap-2 text-sm text-destructive-foreground bg-destructive/20 border border-destructive/30 rounded-lg px-4 py-3">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      {formError}
                    </p>
                  </div>
                )}

                {/* Action buttons */}
                <div className="px-5 py-4 flex gap-3">
                  <button
                    type="button"
                    onClick={handleFail}
                    disabled={pending || !canSubmit}
                    className="flex-1 h-14 rounded-xl bg-destructive text-destructive-foreground font-bold text-base uppercase tracking-widest disabled:opacity-30 transition-opacity flex items-center justify-center gap-2"
                  >
                    <XCircle className="w-5 h-5" />
                    Fail
                  </button>
                  <button
                    type="button"
                    onClick={handlePass}
                    disabled={pending || !canSubmit}
                    className="flex-2 flex-1 h-14 rounded-xl bg-status-running text-white font-bold text-base uppercase tracking-widest disabled:opacity-30 transition-opacity flex items-center justify-center gap-2"
                    style={{ flex: 2 }}
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    {pending ? 'Generating…' : 'Pass — Issue Code'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── History tab ──────────────────────────────────────────────────── */}
        {tab === 'history' && (
          <HistoryTable history={history} />
        )}
      </main>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TabBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 h-10 rounded-lg text-sm font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-colors ${
        active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {icon}
      {children}
    </button>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-5 py-4 space-y-2">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
      {children}
    </div>
  )
}

function ScanField({
  inputRef,
  value,
  onChange,
  onConfirm,
  placeholder,
  disabled,
  error,
  resolved,
  resolvedSub,
  hint,
  transform = (v) => v,
}: {
  inputRef?: React.RefObject<HTMLInputElement | null>
  value: string
  onChange: (v: string) => void
  onConfirm: (v: string) => void
  placeholder?: string
  disabled?: boolean
  error?: string
  resolved?: string | null
  resolvedSub?: string
  hint?: string
  transform?: (v: string) => string
}) {
  return (
    <div className="space-y-1.5">
      <div className="relative">
        <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(transform(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && value.trim()) {
              e.preventDefault()
              onConfirm(value.trim())
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          className={`w-full h-12 pl-10 pr-4 rounded-lg bg-background border text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 transition-colors ${
            error ? 'border-destructive' : resolved ? 'border-status-running' : 'border-border'
          }`}
        />
      </div>

      {resolved && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-status-running/10 border border-status-running/30">
          <Check className="w-4 h-4 text-status-running shrink-0" />
          <div>
            <p className="text-sm font-semibold text-status-running">{resolved}</p>
            {resolvedSub && <p className="text-xs text-muted-foreground">{resolvedSub}</p>}
          </div>
        </div>
      )}
      {error && (
        <p className="text-xs text-destructive-foreground flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> {error}
        </p>
      )}
      {!resolved && !error && hint && (
        <p className="text-xs text-muted-foreground">{hint} — press Enter to confirm</p>
      )}
    </div>
  )
}

function IssuedCodeDisplay({
  issued,
  onReset,
}: {
  issued: { code: string; type: CodeType; result: QcResult }
  onReset: () => void
}) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(issued.code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const isPass = issued.result === 'PASS'

  return (
    <div className={`rounded-xl border-2 p-6 space-y-5 ${isPass ? 'border-status-running/40 bg-status-running/5' : 'border-destructive/40 bg-destructive/5'}`}>
      {/* Badge */}
      <div className="flex items-center justify-between">
        <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-bold uppercase tracking-widest ${
          isPass ? 'bg-status-running/20 text-status-running' : 'bg-destructive/20 text-destructive-foreground'
        }`}>
          {isPass ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {issued.type.replace('_', '-')} — {issued.result}
        </span>
      </div>

      {isPass ? (
        <>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
              Hand this code to the operator
            </p>
            <div className="bg-background rounded-xl border-2 border-primary/40 py-8 px-4 text-center relative">
              <p className="font-mono text-6xl font-bold tracking-[0.4em] text-primary select-all">
                {issued.code}
              </p>
              <button
                onClick={handleCopy}
                className="absolute top-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-border text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Copy code"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-status-running" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-muted-foreground text-center mt-3">
              This code is shown once only. Expires in 30 minutes.
            </p>
          </div>
        </>
      ) : (
        <div className="text-center py-4 space-y-2">
          <XCircle className="w-12 h-12 text-destructive mx-auto" />
          <p className="font-bold text-foreground">Failure recorded</p>
          <p className="text-sm text-muted-foreground">No code has been issued. The failure has been logged.</p>
        </div>
      )}

      <button
        onClick={onReset}
        className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold uppercase tracking-widest flex items-center justify-center gap-2"
      >
        <Plus className="w-4 h-4" />
        Issue Another Code
      </button>
    </div>
  )
}

function HistoryTable({ history }: { history: QcCode[] }) {
  if (history.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        No QC codes issued yet.
      </div>
    )
  }

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {['Issued', 'MO', 'Machine', 'Type', 'Result', 'Expires', 'Used at', 'Used by', 'Status'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-muted-foreground whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {history.map((code) => {
              const status = codeStatus(code)
              return (
                <tr key={code.id} className="hover:bg-secondary/30 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap text-foreground">{fmt(code.created_at)}</td>
                  <td className="px-4 py-3 font-mono font-bold text-foreground">{code.mo_number}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-foreground">
                    {(code as any).machine?.machine_code ?? '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="px-2 py-0.5 rounded text-xs font-bold bg-secondary text-secondary-foreground uppercase">
                      {code.code_type.replace('_', '-')}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                      code.result === 'PASS' ? 'bg-status-running/20 text-status-running' : 'bg-destructive/20 text-destructive-foreground'
                    }`}>
                      {code.result}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{fmt(code.expires_at)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{fmt(code.redeemed_at)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {(code as any).redeemer?.display_name ?? '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <StatusBadge status={status} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden divide-y divide-border">
        {history.map((code) => {
          const status = codeStatus(code)
          return (
            <div key={code.id} className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-mono font-bold text-foreground">{code.mo_number}</p>
                  <p className="text-xs text-muted-foreground">
                    {(code as any).machine?.machine_code ?? '—'} &bull; {fmt(code.created_at)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StatusBadge status={status} />
                  <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                    code.result === 'PASS' ? 'bg-status-running/20 text-status-running' : 'bg-destructive/20 text-destructive-foreground'
                  }`}>
                    {code.result}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="px-2 py-0.5 rounded bg-secondary text-secondary-foreground font-bold uppercase">
                  {code.code_type.replace('_', '-')}
                </span>
                {code.redeemed && (
                  <span>Used by {(code as any).redeemer?.display_name ?? '—'} at {fmt(code.redeemed_at)}</span>
                )}
                {!code.redeemed && <span>Expires {fmt(code.expires_at)}</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: 'ACTIVE' | 'USED' | 'EXPIRED' }) {
  const map = {
    ACTIVE: 'bg-status-running/20 text-status-running',
    USED: 'bg-secondary text-secondary-foreground',
    EXPIRED: 'bg-destructive/20 text-destructive-foreground',
  } as const
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${map[status]}`}>
      {status}
    </span>
  )
}

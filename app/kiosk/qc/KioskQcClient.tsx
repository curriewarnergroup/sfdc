'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { submitCheckResult } from '@/lib/actions/admin'

// ---- Types ----
interface CheckTemplate {
  id: string
  name: string
  description: string | null
  input_type: 'PASS_FAIL' | 'NUMERIC' | 'TEXT'
  target_value: number | null
  tolerance_plus: number | null
  tolerance_minus: number | null
  unit: string | null
  product_id: string | null
}

interface Assignment {
  id: string
  order_index: number
  required: boolean
  template: CheckTemplate
}

interface Session {
  id: string
  mo_number: string
  product_id?: string | null
  user: { id: string; display_name: string } | null
}

interface Device {
  id: string
  station_name: string
  machine_id: string | null
  machine: { id: string; machine_code: string; description: string | null } | null
}

interface Props {
  device: Device
  session: Session
  assignments: Assignment[]
}

// ---- Numeric Keypad ----
function NumericKeypad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  function press(key: string) {
    if (key === 'DEL') {
      onChange(value.slice(0, -1))
    } else if (key === '.' && value.includes('.')) {
      // no-op
    } else if (key === '-' && value.length > 0) {
      // no-op, sign only at start
    } else if (key === '-' && value.length === 0) {
      onChange('-')
    } else {
      onChange(value + key)
    }
  }

  const keys = ['7','8','9','4','5','6','1','2','3','-','0','.']

  return (
    <div className="flex flex-col gap-2">
      <div className="h-14 rounded-xl border-2 border-border bg-muted/30 flex items-center justify-end px-4">
        <span className="text-3xl font-mono font-bold text-foreground tracking-tight">
          {value || <span className="text-muted-foreground/40">0</span>}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {keys.map(k => (
          <button key={k} onClick={() => press(k)}
            className="h-14 rounded-xl bg-card border border-border text-xl font-bold text-foreground hover:bg-muted/40 active:scale-95 transition-all touch-manipulation">
            {k}
          </button>
        ))}
        <button onClick={() => onChange('')}
          className="h-14 rounded-xl bg-muted/50 border border-border text-sm font-semibold text-muted-foreground hover:bg-muted/70 active:scale-95 transition-all touch-manipulation col-span-2">
          Clear
        </button>
        <button onClick={() => press('DEL')}
          className="h-14 rounded-xl bg-muted/50 border border-border text-sm font-semibold text-muted-foreground hover:bg-muted/70 active:scale-95 transition-all touch-manipulation">
          Del
        </button>
      </div>
    </div>
  )
}

// ---- Within tolerance indicator ----
function ToleranceIndicator({ value, target, plus, minus, unit }: {
  value: number; target: number; plus: number; minus: number; unit: string | null
}) {
  const upper = target + plus
  const lower = target - minus
  const inTolerance = value >= lower && value <= upper
  const pct = Math.min(100, Math.max(0, ((value - lower) / (upper - lower)) * 100))

  return (
    <div className="flex flex-col gap-2 p-4 rounded-xl border border-border bg-muted/20">
      <div className="flex items-center justify-between text-xs font-semibold">
        <span className="text-muted-foreground">Lower: <span className="font-mono text-foreground">{lower}{unit ? ` ${unit}` : ''}</span></span>
        <span className={`px-2 py-0.5 rounded font-bold ${inTolerance ? 'bg-status-running/20 text-status-running' : 'bg-destructive/20 text-destructive'}`}>
          {inTolerance ? 'IN TOLERANCE' : 'OUT OF TOLERANCE'}
        </span>
        <span className="text-muted-foreground">Upper: <span className="font-mono text-foreground">{upper}{unit ? ` ${unit}` : ''}</span></span>
      </div>
      <div className="relative h-4 rounded-full bg-border overflow-hidden">
        <div className="absolute inset-0 bg-status-running/20" />
        {/* Target marker */}
        <div className="absolute top-0 bottom-0 w-0.5 bg-foreground/40" style={{ left: '50%' }} />
        {/* Value marker */}
        <div
          className={`absolute top-1 bottom-1 w-2 rounded-full transition-all ${inTolerance ? 'bg-status-running' : 'bg-destructive'}`}
          style={{ left: `calc(${pct}% - 4px)` }}
        />
      </div>
      <div className="text-center text-xs text-muted-foreground">
        Target: <span className="font-mono font-bold text-foreground">{target}{unit ? ` ${unit}` : ''}</span>
      </div>
    </div>
  )
}

// ---- Check Screen ----
function CheckScreen({
  assignment,
  index,
  total,
  session,
  device,
  onNext,
  onSkip,
}: {
  assignment: Assignment
  index: number
  total: number
  session: Session
  device: Device
  onNext: (result: 'PASS' | 'FAIL' | null, numericValue: number | null, textValue: string | null) => void
  onSkip: () => void
}) {
  const t = assignment.template
  const [numericStr, setNumericStr] = useState('')
  const [textValue, setTextValue] = useState('')
  const [failWarning, setFailWarning] = useState(false)
  const [pending, startTransition] = useTransition()

  const numericValue = numericStr !== '' ? parseFloat(numericStr) : null

  // For NUMERIC: derive pass/fail from tolerance
  function getNumericResult(): 'PASS' | 'FAIL' | null {
    if (numericValue === null || t.target_value === null) return null
    const upper = t.target_value + (t.tolerance_plus ?? 0)
    const lower = t.target_value - (t.tolerance_minus ?? 0)
    return (numericValue >= lower && numericValue <= upper) ? 'PASS' : 'FAIL'
  }

  function handlePassFail(r: 'PASS' | 'FAIL') {
    if (r === 'FAIL' && !failWarning) {
      setFailWarning(true)
      return
    }
    onNext(r, null, null)
  }

  function handleNumericSubmit() {
    if (numericValue === null) return
    const result = getNumericResult()
    if (result === 'FAIL' && !failWarning) {
      setFailWarning(true)
      return
    }
    onNext(result, numericValue, null)
  }

  function handleTextSubmit() {
    onNext(null, null, textValue)
  }

  const numericResult = t.input_type === 'NUMERIC' ? getNumericResult() : null

  return (
    <div className="flex flex-col min-h-full bg-background">
      {/* Header */}
      <div className="border-b border-border px-5 py-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Check {index + 1} of {total} &mdash; {session.mo_number}
          </p>
          <h2 className="text-lg font-black text-foreground mt-0.5">{t.name}</h2>
          {t.description && <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>}
        </div>
        {!assignment.required && (
          <button onClick={onSkip} className="text-xs text-muted-foreground hover:text-foreground underline">Skip</button>
        )}
      </div>

      <div className="flex-1 flex flex-col gap-5 p-5">
        {/* PASS / FAIL */}
        {t.input_type === 'PASS_FAIL' && (
          <>
            {failWarning && (
              <div className="rounded-xl border-2 border-destructive bg-destructive/10 p-4 text-center">
                <p className="text-destructive font-black text-lg">FAIL recorded</p>
                <p className="text-sm text-destructive/80 mt-1">Consider stopping the machine before continuing.</p>
                <p className="text-xs text-muted-foreground mt-2">Tap FAIL again to confirm and continue.</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4 mt-auto">
              <button
                onClick={() => handlePassFail('PASS')}
                disabled={pending}
                className="h-32 rounded-2xl border-2 border-status-running bg-status-running/15 text-status-running text-2xl font-black uppercase tracking-widest hover:bg-status-running/25 active:scale-95 transition-all touch-manipulation disabled:opacity-50">
                Pass
              </button>
              <button
                onClick={() => handlePassFail('FAIL')}
                disabled={pending}
                className="h-32 rounded-2xl border-2 border-destructive bg-destructive/15 text-destructive text-2xl font-black uppercase tracking-widest hover:bg-destructive/25 active:scale-95 transition-all touch-manipulation disabled:opacity-50">
                Fail
              </button>
            </div>
          </>
        )}

        {/* NUMERIC */}
        {t.input_type === 'NUMERIC' && (
          <>
            {t.target_value != null && numericValue !== null && (
              <ToleranceIndicator
                value={numericValue}
                target={t.target_value}
                plus={t.tolerance_plus ?? 0}
                minus={t.tolerance_minus ?? 0}
                unit={t.unit}
              />
            )}
            {t.target_value != null && (
              <p className="text-center text-sm text-muted-foreground">
                Target: <span className="font-mono font-bold text-foreground">{t.target_value}{t.unit ? ` ${t.unit}` : ''}</span>
                {' '}(+{t.tolerance_plus ?? 0} / -{t.tolerance_minus ?? 0})
              </p>
            )}
            {failWarning && (
              <div className="rounded-xl border-2 border-destructive bg-destructive/10 p-3 text-center">
                <p className="text-destructive font-bold">Reading is out of tolerance.</p>
                <p className="text-sm text-destructive/80">Consider stopping the machine. Tap Submit again to confirm.</p>
              </div>
            )}
            <NumericKeypad value={numericStr} onChange={setNumericStr} />
            <button
              onClick={handleNumericSubmit}
              disabled={numericValue === null || pending}
              className="w-full h-14 rounded-2xl bg-primary text-primary-foreground font-black text-lg uppercase tracking-widest hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-40 touch-manipulation">
              Submit Reading
            </button>
          </>
        )}

        {/* TEXT */}
        {t.input_type === 'TEXT' && (
          <>
            <textarea
              value={textValue}
              onChange={e => setTextValue(e.target.value)}
              rows={5}
              placeholder="Enter observation…"
              className="w-full rounded-xl border border-border bg-muted/30 px-4 py-3 text-foreground text-base resize-none focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              onClick={handleTextSubmit}
              disabled={!textValue.trim() || pending}
              className="w-full h-14 rounded-2xl bg-primary text-primary-foreground font-black text-lg uppercase tracking-widest hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-40 touch-manipulation">
              Submit
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ---- Summary screen ----
function SummaryScreen({
  submitted,
  total,
  onDone,
}: {
  submitted: Array<{ name: string; result: string | null; value: number | null; unit: string | null }>
  total: number
  onDone: () => void
}) {
  const passes = submitted.filter(s => s.result === 'PASS').length
  const fails = submitted.filter(s => s.result === 'FAIL').length

  return (
    <div className="flex flex-col min-h-full bg-background">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-lg font-black text-foreground">QC Check Complete</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{submitted.length} of {total} checks submitted</p>
      </div>
      <div className="flex-1 p-5 flex flex-col gap-4">
        <div className="flex gap-3">
          <div className="flex-1 rounded-xl bg-status-running/15 border border-status-running/30 p-4 text-center">
            <p className="text-3xl font-black text-status-running">{passes}</p>
            <p className="text-xs text-muted-foreground font-semibold uppercase">Pass</p>
          </div>
          <div className="flex-1 rounded-xl bg-destructive/15 border border-destructive/30 p-4 text-center">
            <p className="text-3xl font-black text-destructive">{fails}</p>
            <p className="text-xs text-muted-foreground font-semibold uppercase">Fail</p>
          </div>
        </div>
        {fails > 0 && (
          <div className="rounded-xl border-2 border-destructive bg-destructive/10 p-4">
            <p className="font-black text-destructive">Failures recorded — please review before continuing production.</p>
          </div>
        )}
        <div className="flex flex-col gap-2 mt-2">
          {submitted.map((s, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-3 rounded-xl border border-border bg-card">
              <span className="text-sm text-foreground font-semibold">{s.name}</span>
              <span className="flex items-center gap-2">
                {s.value != null && <span className="font-mono text-sm text-muted-foreground">{s.value}{s.unit ? ` ${s.unit}` : ''}</span>}
                {s.result && (
                  <span className={`text-xs font-black px-2 py-0.5 rounded ${s.result === 'PASS' ? 'bg-status-running/20 text-status-running' : 'bg-destructive/20 text-destructive'}`}>
                    {s.result}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-auto">
          <button onClick={onDone}
            className="w-full h-14 rounded-2xl bg-primary text-primary-foreground font-black text-lg uppercase tracking-widest hover:bg-primary/90 active:scale-[0.98] transition-all touch-manipulation">
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

// ---- Main ----
export function KioskQcClient({ device, session, assignments }: Props) {
  const router = useRouter()
  const [index, setIndex] = useState(0)
  const [submitted, setSubmitted] = useState<Array<{ name: string; result: string | null; value: number | null; unit: string | null }>>([])
  const [done, setDone] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [, startTransition] = useTransition()

  if (assignments.length === 0) {
    return (
      <div className="flex flex-col min-h-full bg-background items-center justify-center gap-4 p-8 text-center">
        <p className="text-xl font-black text-foreground">No checks assigned</p>
        <p className="text-sm text-muted-foreground">No QC checks have been set up for MO <span className="font-mono font-bold">{session.mo_number}</span>. Ask your admin to add checks via the control plan import.</p>
        <button onClick={() => router.push('/kiosk')} className="h-12 px-8 rounded-2xl bg-primary text-primary-foreground font-bold">Back to Kiosk</button>
      </div>
    )
  }

  if (done) {
    return (
      <SummaryScreen
        submitted={submitted}
        total={assignments.length}
        onDone={() => router.push('/kiosk')}
      />
    )
  }

  const current = assignments[index]

  async function handleNext(result: 'PASS' | 'FAIL' | null, numericValue: number | null, textValue: string | null) {
    const t = current.template
    setSubmitError(null)
    setSaving(true)
    const res = await submitCheckResult({
      mo_number: session.mo_number,
      product_id: t.product_id ?? session.product_id ?? undefined,
      machine_id: device.machine_id ?? undefined,
      session_id: session.id,
      check_template_id: t.id,
      result: result ?? undefined,
      numeric_value: numericValue,
      text_value: textValue,
      checked_by: session.user?.id ?? '',
    })
    setSaving(false)

    if (!res.ok) {
      setSubmitError(res.error ?? 'Failed to save result. Please try again.')
      return
    }

    setSubmitted(prev => [...prev, {
      name: t.name,
      result,
      value: numericValue,
      unit: t.unit,
    }])

    if (index + 1 >= assignments.length) {
      setDone(true)
    } else {
      setIndex(i => i + 1)
    }
  }

  function handleSkip() {
    if (index + 1 >= assignments.length) {
      setDone(true)
    } else {
      setIndex(i => i + 1)
    }
  }

  if (saving) {
    return (
      <div className="flex flex-col min-h-full bg-background items-center justify-center gap-4">
        <div className="w-10 h-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
        <p className="text-foreground font-semibold">Saving result…</p>
      </div>
    )
  }

  if (submitError) {
    return (
      <div className="flex flex-col min-h-full bg-background items-center justify-center gap-4 p-8 text-center">
        <div className="rounded-2xl border-2 border-destructive bg-destructive/10 p-6 flex flex-col gap-4 max-w-sm w-full">
          <p className="text-destructive font-black text-xl">Save Failed</p>
          <p className="text-sm text-destructive/80">{submitError}</p>
          <button
            onClick={() => setSubmitError(null)}
            className="h-12 rounded-xl bg-primary text-primary-foreground font-bold text-sm"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <CheckScreen
      assignment={current}
      index={index}
      total={assignments.length}
      session={session}
      device={device}
      onNext={handleNext}
      onSkip={handleSkip}
    />
  )
}

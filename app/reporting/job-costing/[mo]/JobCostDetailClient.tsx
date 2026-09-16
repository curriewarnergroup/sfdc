'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, RotateCcw } from 'lucide-react'
import { markJobComplete, reopenJob } from '@/lib/actions/job-costing'
import type { JobCostRow } from '@/lib/job-costing/engine'
import { formatMoney, formatNumber, formatPct, formatSecsAsHms } from '@/lib/job-costing/format'

type Quote = {
  mo_number: string
  part_no: string
  total_order_qty: number
  cycle_time_secs: number
  setup_time_secs: number
  run_labour_rate: number
  run_overhead_rate: number
  setup_labour_rate: number
  setup_overhead_rate: number
  sales_price_per_part: number
  material_cost_per_part: number | null
  completed_at: string | null
}

type SessionRow = {
  id: string
  session_type: string
  status: string
  machine_code: string | null
  started_at: string
  ended_at: string | null
  net_secs: number
  paused_secs: number
}

type Detail = {
  quote: Quote
  history: Record<string, any> | null
  row: JobCostRow | null
  sessions: SessionRow[]
  pauseByReason?: Record<string, number>
}

type PartHistoryRow = {
  mo_number: string
  completed_at: string
  qty_made: number
  quoted_setup_secs: number
  actual_setup_secs: number
  expected_profit: number | null
  actual_profit: number | null
  actual_margin_pct: number | null
  expected_margin_pct: number | null
}

export function JobCostDetailClient({ detail, partHistory }: { detail: Detail; partHistory: PartHistoryRow[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')

  const { quote, history, row, sessions, pauseByReason } = detail
  const display = history ?? row

  function handleComplete() {
    setError('')
    startTransition(async () => {
      const res = await markJobComplete(quote.mo_number)
      if (!res.success) {
        setError(res.error)
        return
      }
      router.refresh()
    })
  }

  function handleReopen() {
    startTransition(async () => {
      await reopenJob(quote.mo_number)
      router.refresh()
    })
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/reporting/job-costing"
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Job Costing
        </Link>
        {quote.completed_at ? (
          <button
            onClick={handleReopen}
            disabled={pending}
            className="h-9 px-4 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4" /> Reopen Job
          </button>
        ) : (
          row && (
            <button
              onClick={handleComplete}
              disabled={pending || row.qty_made < row.total_order_qty}
              title={row.qty_made < row.total_order_qty ? 'Order quantity not yet reached' : undefined}
              className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-bold flex items-center gap-2 disabled:opacity-40 transition-opacity"
            >
              <CheckCircle2 className="w-4 h-4" /> Mark Complete
            </button>
          )
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {quote.completed_at && (
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          Completed {new Date(quote.completed_at).toLocaleString('en-GB')}
        </div>
      )}

      {display && (
        <div className="grid grid-cols-3 gap-4">
          <MetricCard
            label="Actual Profit"
            value={formatMoney(display.actual_profit)}
            tone={(display.actual_profit ?? 0) < 0 ? 'destructive' : 'positive'}
            sub={`Expected: ${formatMoney(display.expected_profit)}`}
          />
          <MetricCard
            label="Actual Margin"
            value={formatPct(display.actual_margin_pct)}
            sub={`Expected: ${formatPct(display.expected_margin_pct)}`}
          />
          <MetricCard
            label="Setup Variance"
            value={formatSecsAsHms(
              (display.actual_setup_secs ?? 0) - (display.quoted_setup_secs ?? quote.setup_time_secs),
            )}
            tone={(display.actual_setup_secs ?? 0) > (display.quoted_setup_secs ?? quote.setup_time_secs) ? 'destructive' : 'positive'}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-foreground uppercase tracking-widest">Quote</h2>
          <dl className="rounded-xl border border-border divide-y divide-border overflow-hidden bg-card text-sm">
            <Row label="Total Order Qty" value={formatNumber(quote.total_order_qty)} />
            <Row label="Cycle Time" value={formatSecsAsHms(quote.cycle_time_secs)} />
            <Row label="Setup Time" value={formatSecsAsHms(quote.setup_time_secs)} />
            <Row label="Run Labour Rate" value={`${formatMoney(quote.run_labour_rate)}/hr`} />
            <Row label="Run Overhead Rate" value={`${formatMoney(quote.run_overhead_rate)}/hr`} />
            <Row label="Setup Labour Rate" value={`${formatMoney(quote.setup_labour_rate)}/hr`} />
            <Row label="Setup Overhead Rate" value={`${formatMoney(quote.setup_overhead_rate)}/hr`} />
            <Row label="Sales Price / Part" value={formatMoney(quote.sales_price_per_part)} />
            <Row
              label="Material Cost / Part"
              value={quote.material_cost_per_part === null ? 'Not tracked' : formatMoney(quote.material_cost_per_part)}
            />
          </dl>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-bold text-foreground uppercase tracking-widest">Actuals</h2>
          <dl className="rounded-xl border border-border divide-y divide-border overflow-hidden bg-card text-sm">
            <Row label="Qty Made" value={formatNumber(display?.qty_made ?? 0)} />
            <Row label="Qty Scrapped" value={formatNumber(display?.qty_scrapped ?? 0)} />
            <Row label="Scrap %" value={formatPct(display?.scrap_pct ?? null)} />
            <Row label="Actual Setup Time" value={formatSecsAsHms(display?.actual_setup_secs ?? 0)} />
            <Row
              label="Current Cycle Time"
              value={formatSecsAsHms(
                (display as any)?.current_cycle_secs ?? (history as any)?.actual_cycle_secs ?? null,
              )}
            />
            <Row label="Expected Labour Hours" value={formatNumber(display?.expected_labour_hours ?? 0)} />
            <Row label="Actual Labour Hours" value={formatNumber(display?.actual_labour_hours ?? 0)} />
            <Row label="Revenue" value={formatMoney(display?.revenue)} />
            <Row label="Material Cost" value={formatMoney(display?.material_cost)} />
          </dl>
        </section>
      </div>

      {pauseByReason && Object.keys(pauseByReason).length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-foreground uppercase tracking-widest">Pause Breakdown</h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(pauseByReason)
              .sort((a, b) => b[1] - a[1])
              .map(([label, ms]) => (
                <span key={label} className="px-3 py-1.5 rounded-lg bg-card border border-border text-sm">
                  {label}: <span className="font-semibold text-foreground">{formatSecsAsHms(ms / 1000)}</span>
                </span>
              ))}
          </div>
        </section>
      )}

      {sessions.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-foreground uppercase tracking-widest">Sessions</h2>
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  {['Type', 'Machine', 'Status', 'Started', 'Net Time', 'Paused'].map((h) => (
                    <th key={h} className="text-left text-xs font-semibold uppercase tracking-widest text-muted-foreground px-4 py-2.5">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sessions.map((s) => (
                  <tr key={s.id} className="bg-card">
                    <td className="px-4 py-2.5 font-medium text-foreground">{s.session_type}</td>
                    <td className="px-4 py-2.5 font-mono text-muted-foreground">{s.machine_code ?? '—'}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{s.status}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{new Date(s.started_at).toLocaleString('en-GB')}</td>
                    <td className="px-4 py-2.5 text-foreground">{formatSecsAsHms(s.net_secs)}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{formatSecsAsHms(s.paused_secs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {partHistory.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-foreground uppercase tracking-widest">
            Part History — {quote.part_no}
          </h2>
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  {['MO', 'Completed', 'Qty Made', 'Setup Var.', 'Actual Profit', 'Actual Margin'].map((h) => (
                    <th key={h} className="text-left text-xs font-semibold uppercase tracking-widest text-muted-foreground px-4 py-2.5">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {partHistory.map((h) => (
                  <tr key={h.mo_number} className="bg-card">
                    <td className="px-4 py-2.5 font-mono font-semibold text-foreground">
                      <Link href={`/reporting/job-costing/${h.mo_number}`} className="hover:text-primary">
                        {h.mo_number}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{new Date(h.completed_at).toLocaleDateString('en-GB')}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{h.qty_made}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {formatSecsAsHms(h.actual_setup_secs - h.quoted_setup_secs)}
                    </td>
                    <td className={`px-4 py-2.5 font-semibold ${(h.actual_profit ?? 0) < 0 ? 'text-destructive' : 'text-status-running'}`}>
                      {formatMoney(h.actual_profit)}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{formatPct(h.actual_margin_pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  )
}

function MetricCard({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string
  value: string
  sub?: string
  tone?: 'default' | 'destructive' | 'positive'
}) {
  const toneCls = tone === 'destructive' ? 'text-destructive' : tone === 'positive' ? 'text-status-running' : 'text-foreground'
  return (
    <div className="bg-card rounded-xl border border-border p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${toneCls}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  )
}

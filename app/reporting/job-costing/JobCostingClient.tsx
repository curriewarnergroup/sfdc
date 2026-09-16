'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, TrendingDown, TrendingUp, HelpCircle } from 'lucide-react'
import type { JobCostRow } from '@/lib/job-costing/engine'
import { formatMoney, formatPct, formatSecsAsHms } from '@/lib/job-costing/format'

type Exceptions = {
  noActivity: { mo_number: string; part_no: string; total_order_qty: number; first_imported_at: string }[]
  noQuote: { mo_number: string; machine_codes: string[] }[]
}

type FilterTab = 'ALL' | 'LOSING' | 'IN_SETUP' | 'LOW_CONFIDENCE'

export function JobCostingClient({ rows, exceptions }: { rows: JobCostRow[]; exceptions: Exceptions }) {
  const [tab, setTab] = useState<FilterTab>('ALL')

  const filtered = useMemo(() => {
    switch (tab) {
      case 'LOSING':
        return rows.filter((r) => r.actual_profit !== null && r.actual_profit < 0)
      case 'IN_SETUP':
        return rows.filter((r) => r.status === 'IN_SETUP')
      case 'LOW_CONFIDENCE':
        return rows.filter((r) => r.low_confidence)
      default:
        return rows
    }
  }, [rows, tab])

  const sorted = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        const aVal = a.actual_profit ?? Number.POSITIVE_INFINITY
        const bVal = b.actual_profit ?? Number.POSITIVE_INFINITY
        return aVal - bVal
      }),
    [filtered],
  )

  const losingCount = rows.filter((r) => r.actual_profit !== null && r.actual_profit < 0).length
  const inSetupCount = rows.filter((r) => r.status === 'IN_SETUP').length
  const lowConfidenceCount = rows.filter((r) => r.low_confidence).length
  const exceptionCount = exceptions.noActivity.length + exceptions.noQuote.length

  return (
    <div className="p-8 space-y-5">
      <div className="grid grid-cols-4 gap-4">
        <SummaryCard label="Open Jobs" value={rows.length} tone="default" />
        <SummaryCard label="Losing Money" value={losingCount} tone="destructive" />
        <SummaryCard label="In Setup" value={inSetupCount} tone="default" />
        <SummaryCard label="Low Confidence" value={lowConfidenceCount} tone="warning" />
      </div>

      {exceptionCount > 0 && <ExceptionsPanel exceptions={exceptions} />}

      <div className="flex items-center gap-2 border-b border-border">
        {(
          [
            ['ALL', 'All Jobs'],
            ['LOSING', 'Losing Money'],
            ['IN_SETUP', 'In Setup'],
            ['LOW_CONFIDENCE', 'Low Confidence'],
          ] as [FilterTab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              {['MO', 'Part', 'Machine', 'Status', 'Qty', 'Setup Var.', 'Expected Profit', 'Actual Profit', 'Margin', ''].map(
                (h) => (
                  <th
                    key={h}
                    className="text-left text-xs font-semibold uppercase tracking-widest text-muted-foreground px-4 py-3"
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map((row) => (
              <tr key={row.mo_number} className="bg-card hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-mono font-semibold text-foreground">
                  <Link href={`/reporting/job-costing/${row.mo_number}`} className="hover:text-primary transition-colors">
                    {row.mo_number}
                  </Link>
                </td>
                <td className="px-4 py-3 text-foreground">{row.part_no}</td>
                <td className="px-4 py-3 text-muted-foreground font-mono">{row.machine_codes.join(', ') || '—'}</td>
                <td className="px-4 py-3">
                  <StatusPill row={row} />
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {row.qty_made} / {row.total_order_qty}
                  <span className="text-xs ml-1">({formatPct(row.percent_complete)})</span>
                </td>
                <td className="px-4 py-3">
                  <span className={row.setup_over_quote ? 'text-destructive' : 'text-status-running'}>
                    {row.setup_variance_secs > 0 ? '+' : ''}
                    {formatSecsAsHms(row.setup_variance_secs)}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{formatMoney(row.expected_profit)}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      row.actual_profit === null
                        ? 'text-muted-foreground'
                        : row.actual_profit < 0
                          ? 'text-destructive font-semibold'
                          : 'text-status-running font-semibold'
                    }
                  >
                    {formatMoney(row.actual_profit)}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{formatPct(row.actual_margin_pct)}</td>
                <td className="px-4 py-3">
                  {row.low_confidence && (
                    <span title="Low confidence — few parts made so far">
                      <HelpCircle className="w-4 h-4 text-amber-500" />
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={10} className="text-center text-sm text-muted-foreground py-8">
                  No jobs in this view.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StatusPill({ row }: { row: JobCostRow }) {
  if (row.status === 'IN_SETUP') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide bg-muted text-muted-foreground">
        In Setup
      </span>
    )
  }
  if (row.actual_profit !== null && row.actual_profit < 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide bg-destructive/20 text-destructive">
        <TrendingDown className="w-3 h-3" /> Losing
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide bg-status-running/20 text-status-running">
      <TrendingUp className="w-3 h-3" /> Running
    </span>
  )
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'default' | 'destructive' | 'warning'
}) {
  const toneCls =
    tone === 'destructive' ? 'text-destructive' : tone === 'warning' ? 'text-amber-500' : 'text-foreground'
  return (
    <div className="bg-card rounded-xl border border-border p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${toneCls}`}>{value}</p>
    </div>
  )
}

function ExceptionsPanel({ exceptions }: { exceptions: Exceptions }) {
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-500" />
        <h3 className="text-sm font-bold text-foreground">Data Exceptions</h3>
      </div>
      {exceptions.noQuote.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1">
            Shop floor activity with no imported quote ({exceptions.noQuote.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {exceptions.noQuote.map((e) => (
              <span key={e.mo_number} className="px-2 py-1 rounded bg-card border border-border text-xs font-mono">
                {e.mo_number} · {e.machine_codes.join(', ') || 'unknown machine'}
              </span>
            ))}
          </div>
        </div>
      )}
      {exceptions.noActivity.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1">
            Imported quotes with no shop floor activity yet ({exceptions.noActivity.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {exceptions.noActivity.map((e) => (
              <span key={e.mo_number} className="px-2 py-1 rounded bg-card border border-border text-xs font-mono">
                {e.mo_number} · {e.part_no}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

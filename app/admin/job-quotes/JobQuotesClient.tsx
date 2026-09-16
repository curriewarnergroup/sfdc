'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, Download, Search, X, CheckCircle2, AlertCircle, History, RotateCcw } from 'lucide-react'
import { previewJobQuoteImport, confirmJobQuoteImport, reopenJob } from '@/lib/actions/job-costing'
import type { ImportPreview, ImportRowResult } from '@/lib/job-costing/import'
import { formatMoney, formatSecsAsHms } from '@/lib/job-costing/format'

type Quote = {
  mo_number: string
  part_no: string
  total_order_qty: number
  qty_made: number | null
  qty_scrapped: number | null
  sales_price_per_part: number
  completed_at: string | null
  updated_at: string
}

type ImportRecord = {
  id: string
  file_name: string
  imported_at: string
  rows_total: number
  rows_inserted: number
  rows_updated: number
  rows_unchanged: number
  rows_failed: number
  errors: { row: number; mo_number: string | null; errors: string[] }[] | null
  imported_by: { display_name: string } | null
}

const STATUS_STYLE: Record<string, string> = {
  NEW: 'bg-status-running/20 text-status-running',
  UPDATE: 'bg-primary/15 text-primary',
  UNCHANGED: 'bg-muted text-muted-foreground',
  ERROR: 'bg-destructive/20 text-destructive',
}

export function JobQuotesClient({ quotes, imports }: { quotes: Quote[]; imports: ImportRecord[] }) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()
  const [search, setSearch] = useState('')
  const [showHistory, setShowHistory] = useState(false)

  const [preview, setPreview] = useState<(ImportPreview & { fileName: string }) | null>(null)
  const [previewError, setPreviewError] = useState('')
  const [confirmError, setConfirmError] = useState('')
  const [confirmed, setConfirmed] = useState<{ counts: ImportPreview['counts'] } | null>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPreviewError('')
    setConfirmError('')
    setConfirmed(null)
    const formData = new FormData()
    formData.set('file', file)
    startTransition(async () => {
      const res = await previewJobQuoteImport(formData)
      if (!res.success) {
        setPreviewError(res.error)
        return
      }
      setPreview(res.data)
    })
    e.target.value = ''
  }

  function handleConfirm() {
    if (!preview) return
    setConfirmError('')
    const rows = preview.rows.filter((r) => r.record).map((r) => r.record!)
    startTransition(async () => {
      const res = await confirmJobQuoteImport(preview.fileName, rows)
      if (!res.success) {
        setConfirmError(res.error)
        return
      }
      setConfirmed({ counts: res.data.counts })
      setPreview(null)
      router.refresh()
    })
  }

  function closePreview() {
    setPreview(null)
    setPreviewError('')
    setConfirmError('')
  }

  function handleReopen(mo: string) {
    startTransition(async () => {
      await reopenJob(mo)
      router.refresh()
    })
  }

  const filtered = quotes.filter(
    (q) =>
      q.mo_number.toLowerCase().includes(search.toLowerCase()) ||
      q.part_no.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="p-8 space-y-5">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search MO or part…"
            className="w-full h-10 pl-9 pr-3 rounded-lg bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <button
          onClick={() => setShowHistory((v) => !v)}
          className="h-10 px-4 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors flex items-center gap-2"
        >
          <History className="w-4 h-4" /> Import History
        </button>
        <a
          href="/api/admin/job-quotes-template"
          className="h-10 px-4 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors flex items-center gap-2"
        >
          <Download className="w-4 h-4" /> Download Template
        </a>
        <input ref={fileInputRef} type="file" accept=".xlsx" onChange={handleFileChange} className="hidden" />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={pending}
          className="h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-bold flex items-center gap-2 disabled:opacity-50"
        >
          <Upload className="w-4 h-4" /> Import Spreadsheet
        </button>
      </div>

      {previewError && !preview && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {previewError}
        </div>
      )}

      {confirmed && (
        <div className="rounded-lg border border-status-running/30 bg-status-running/10 px-4 py-3 text-sm text-status-running flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          Import complete — {confirmed.counts.new} new, {confirmed.counts.update} updated
          {confirmed.counts.error > 0 && `, ${confirmed.counts.error} skipped with errors`}.
        </div>
      )}

      {showHistory && (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                {['File', 'Imported', 'By', 'New', 'Updated', 'Unchanged', 'Failed'].map((h) => (
                  <th
                    key={h}
                    className="text-left text-xs font-semibold uppercase tracking-widest text-muted-foreground px-4 py-3"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {imports.map((imp) => (
                <tr key={imp.id} className="bg-card">
                  <td className="px-4 py-3 font-medium text-foreground">{imp.file_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{new Date(imp.imported_at).toLocaleString('en-GB')}</td>
                  <td className="px-4 py-3 text-muted-foreground">{imp.imported_by?.display_name ?? '—'}</td>
                  <td className="px-4 py-3 text-status-running">{imp.rows_inserted}</td>
                  <td className="px-4 py-3 text-primary">{imp.rows_updated}</td>
                  <td className="px-4 py-3 text-muted-foreground">{imp.rows_unchanged}</td>
                  <td className="px-4 py-3 text-destructive">{imp.rows_failed}</td>
                </tr>
              ))}
              {imports.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                    No imports yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              {['MO Number', 'Part No', 'Order Qty', 'Made', 'Scrapped', 'Price / Part', 'Status', ''].map((h) => (
                <th
                  key={h}
                  className="text-left text-xs font-semibold uppercase tracking-widest text-muted-foreground px-4 py-3"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((q) => (
              <tr key={q.mo_number} className="bg-card hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-mono font-semibold text-foreground">{q.mo_number}</td>
                <td className="px-4 py-3 text-foreground">{q.part_no}</td>
                <td className="px-4 py-3 text-muted-foreground">{q.total_order_qty}</td>
                <td className="px-4 py-3 text-muted-foreground">{q.qty_made ?? '—'}</td>
                <td className="px-4 py-3 text-muted-foreground">{q.qty_scrapped ?? '—'}</td>
                <td className="px-4 py-3 text-muted-foreground">{formatMoney(q.sales_price_per_part)}</td>
                <td className="px-4 py-3">
                  {q.completed_at ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide bg-muted text-muted-foreground">
                      Completed
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide bg-status-running/20 text-status-running">
                      Open
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {q.completed_at && (
                    <button
                      onClick={() => handleReopen(q.mo_number)}
                      disabled={pending}
                      className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-40"
                      aria-label="Reopen"
                      title="Reopen job"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                  No job quotes found. Import a spreadsheet to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {preview && (
        <ImportPreviewModal
          preview={preview}
          pending={pending}
          error={confirmError}
          onClose={closePreview}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  )
}

function ImportPreviewModal({
  preview,
  pending,
  error,
  onClose,
  onConfirm,
}: {
  preview: ImportPreview & { fileName: string }
  pending: boolean
  error: string
  onClose: () => void
  onConfirm: () => void
}) {
  const canImport = preview.counts.new + preview.counts.update > 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-card border border-border rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-bold text-foreground">Import Preview — {preview.fileName}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {preview.counts.new} new · {preview.counts.update} updated · {preview.counts.unchanged} unchanged ·{' '}
              {preview.counts.error} errors
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border sticky top-0">
              <tr>
                {['Row', 'MO', 'Part', 'Status', 'Details'].map((h) => (
                  <th
                    key={h}
                    className="text-left text-xs font-semibold uppercase tracking-widest text-muted-foreground px-3 py-2"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {preview.rows.map((row) => (
                <PreviewRow key={row.rowNumber} row={row} />
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-4 border-t border-border space-y-3">
          {error && (
            <p className="text-xs text-destructive flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" /> {error}
            </p>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-10 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={pending || !canImport}
              className="flex-1 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-bold uppercase tracking-widest disabled:opacity-40 transition-opacity"
            >
              {pending ? 'Importing…' : `Import ${preview.counts.new + preview.counts.update} Rows`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function PreviewRow({ row }: { row: ImportRowResult }) {
  return (
    <tr className="bg-card">
      <td className="px-3 py-2 text-muted-foreground">{row.rowNumber}</td>
      <td className="px-3 py-2 font-mono font-semibold text-foreground">{row.mo_number ?? '—'}</td>
      <td className="px-3 py-2 text-foreground">{row.part_no ?? '—'}</td>
      <td className="px-3 py-2">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide ${STATUS_STYLE[row.status]}`}
        >
          {row.status}
        </span>
      </td>
      <td className="px-3 py-2 text-xs text-muted-foreground">
        {row.status === 'ERROR' && row.errors.join('; ')}
        {row.status === 'UPDATE' &&
          row.changes.map((c) => `${c.field}: ${formatChange(c.field, c.old)} → ${formatChange(c.field, c.new)}`).join(', ')}
      </td>
    </tr>
  )
}

function formatChange(field: string, value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (field.includes('secs')) return formatSecsAsHms(Number(value))
  if (field.includes('rate') || field.includes('price') || field.includes('cost')) return formatMoney(Number(value))
  return String(value)
}

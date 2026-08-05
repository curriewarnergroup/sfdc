'use client'

import { Download } from 'lucide-react'

type Column<T> = { key: keyof T & string; header: string }

/**
 * Client-side CSV export. Reporting had no export at all — admin master
 * data did, reports didn't — so nothing could be pulled into a pack
 * without retyping.
 *
 * Cells are RFC 4180 quoted and a leading BOM is written so Excel opens
 * UTF-8 correctly. Values starting with =, +, - or @ are prefixed with a
 * single quote to stop Excel evaluating them as formulas.
 */
export function ExportCsvButton<T extends Record<string, unknown>>({
  rows,
  columns,
  filename,
  label = 'Export CSV',
}: {
  rows: T[]
  columns: Array<Column<T>>
  filename: string
  label?: string
}) {
  function cell(value: unknown): string {
    if (value === null || value === undefined) return ''
    let s = Array.isArray(value) ? value.join('; ') : String(value)
    if (/^[=+\-@]/.test(s)) s = `'${s}`
    return `"${s.replace(/"/g, '""')}"`
  }

  function download() {
    const header = columns.map(c => cell(c.header)).join(',')
    const body = rows.map(r => columns.map(c => cell(r[c.key])).join(',')).join('\r\n')
    const blob = new Blob([`\uFEFF${header}\r\n${body}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <button
      onClick={download}
      disabled={rows.length === 0}
      className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed print:hidden"
    >
      <Download className="w-3.5 h-3.5" />
      {label}
    </button>
  )
}

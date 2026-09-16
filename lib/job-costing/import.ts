// ============================================================
// Job Quote import — parsing, validation, and diffing.
// ------------------------------------------------------------
// Pure logic, no database access, so preview and confirm both run the
// exact same code path and can never disagree.
// ============================================================

import { read, utils } from 'xlsx'
import { normalizeMo } from './engine'

export interface NormalizedQuoteRecord {
  mo_number: string
  part_no: string
  total_order_qty: number
  qty_made: number | null
  qty_scrapped: number | null
  cycle_time_secs: number
  setup_time_secs: number
  run_labour_rate: number
  run_overhead_rate: number
  setup_labour_rate: number
  setup_overhead_rate: number
  sales_price_per_part: number
  material_cost_per_part: number | null
}

export type ImportRowStatus = 'NEW' | 'UPDATE' | 'UNCHANGED' | 'ERROR'

export interface FieldChange {
  field: string
  old: unknown
  new: unknown
}

export interface ImportRowResult {
  rowNumber: number // 1-based, matches spreadsheet row (including header)
  status: ImportRowStatus
  mo_number: string | null
  part_no: string | null
  record: NormalizedQuoteRecord | null
  errors: string[]
  changes: FieldChange[]
}

export interface ImportPreview {
  rows: ImportRowResult[]
  counts: { new: number; update: number; unchanged: number; error: number }
}

// Canonical field -> accepted header spellings (normalized: lowercase, whitespace collapsed).
const HEADER_ALIASES: Record<string, string[]> = {
  mo_number: ['mo number', 'mo no', 'mo', 'mo #', 'manufacturing order'],
  part_no: ['part no', 'part number', 'part'],
  total_order_qty: ['total order qty', 'order qty', 'qty ordered', 'total qty'],
  qty_made: ['qty made', 'quantity made', 'made'],
  qty_scrapped: ['qty scrapped', 'quantity scrapped', 'scrapped'],
  cycle_time_secs: ['cycle time (secs)', 'cycle time secs', 'cycle time', 'cycle time (s)'],
  setup_time_secs: ['setup time (secs)', 'setup time secs', 'setup time', 'setup time (s)'],
  run_labour_rate: ['run labour rate', 'run labor rate'],
  run_overhead_rate: ['run overhead rate'],
  setup_labour_rate: ['setup labour rate', 'setup labor rate'],
  setup_overhead_rate: ['setup overhead rate'],
  sales_price_per_part: ['sales price per part', 'sales price', 'price per part'],
  material_cost_per_part: ['material cost per part', 'material cost'],
}

const REQUIRED_FIELDS = [
  'mo_number',
  'part_no',
  'total_order_qty',
  'cycle_time_secs',
  'setup_time_secs',
  'run_labour_rate',
  'run_overhead_rate',
  'setup_labour_rate',
  'setup_overhead_rate',
  'sales_price_per_part',
] as const

const OPTIONAL_FIELDS = ['qty_made', 'qty_scrapped', 'material_cost_per_part'] as const

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, ' ')
}

function buildHeaderIndex(headerRow: unknown[]): { index: Record<string, number>; missing: string[] } {
  const normalized = headerRow.map((h) => normalizeHeader(String(h ?? '')))
  const index: Record<string, number> = {}

  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const col = normalized.findIndex((h) => aliases.includes(h))
    if (col !== -1) index[field] = col
  }

  const missing = REQUIRED_FIELDS.filter((f) => index[f] === undefined)
  return { index, missing }
}

function parseNumberCell(raw: unknown): { value: number | null; invalid: boolean } {
  if (raw === undefined || raw === null || raw === '') return { value: null, invalid: false }
  if (typeof raw === 'number') return { value: raw, invalid: Number.isNaN(raw) }
  const cleaned = String(raw).replace(/[£$,\s]/g, '')
  if (cleaned === '') return { value: null, invalid: false }
  const num = Number(cleaned)
  return { value: Number.isFinite(num) ? num : null, invalid: !Number.isFinite(num) }
}

export function parseWorkbook(buffer: ArrayBuffer): { rows: unknown[][]; sheetName: string } | { error: string } {
  let workbook: ReturnType<typeof read>
  try {
    workbook = read(buffer, { type: 'array' })
  } catch {
    return { error: 'Could not read this file. Upload a .xlsx spreadsheet.' }
  }
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) return { error: 'The workbook has no sheets.' }
  const sheet = workbook.Sheets[sheetName]
  const rows = utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: null })
  return { rows, sheetName }
}

/**
 * Parses raw spreadsheet rows into normalized, per-row validated records.
 * Does not check for duplicates within the file or diff against the database —
 * see `diffAgainstExisting`.
 */
export function parseQuoteRows(rows: unknown[][]): { rowResults: ImportRowResult[]; headerError: string | null } {
  if (rows.length === 0) {
    return { rowResults: [], headerError: 'The file has no rows.' }
  }

  const [headerRow, ...dataRows] = rows
  const { index, missing } = buildHeaderIndex(headerRow)
  if (missing.length > 0) {
    return {
      rowResults: [],
      headerError: `Missing required column(s): ${missing.join(', ')}`,
    }
  }

  const rowResults: ImportRowResult[] = []

  dataRows.forEach((row, i) => {
    const rowNumber = i + 2 // account for header row, 1-based
    const isBlank = row.every((cell) => cell === null || cell === undefined || String(cell).trim() === '')
    if (isBlank) return

    const errors: string[] = []
    const get = (field: string) => (index[field] !== undefined ? row[index[field]] : undefined)

    const moRaw = get('mo_number')
    const partRaw = get('part_no')
    const mo_number = moRaw != null && String(moRaw).trim() !== '' ? normalizeMo(String(moRaw)) : null
    const part_no = partRaw != null && String(partRaw).trim() !== '' ? String(partRaw).trim() : null

    if (!mo_number) errors.push('MO Number is required')
    if (!part_no) errors.push('Part No is required')

    const numbers: Record<string, number | null> = {}
    for (const field of [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS]) {
      if (field === 'mo_number' || field === 'part_no') continue
      const { value, invalid } = parseNumberCell(get(field))
      if (invalid) {
        errors.push(`${field.replace(/_/g, ' ')} is not a valid number`)
      } else if (value === null && (REQUIRED_FIELDS as readonly string[]).includes(field)) {
        errors.push(`${field.replace(/_/g, ' ')} is required`)
      }
      numbers[field] = value
    }

    const positiveOrZeroFields = [
      'total_order_qty',
      'cycle_time_secs',
      'setup_time_secs',
      'run_labour_rate',
      'run_overhead_rate',
      'setup_labour_rate',
      'setup_overhead_rate',
      'sales_price_per_part',
      'qty_made',
      'qty_scrapped',
      'material_cost_per_part',
    ]
    for (const field of positiveOrZeroFields) {
      const value = numbers[field]
      if (value !== null && value !== undefined && value < 0) {
        errors.push(`${field.replace(/_/g, ' ')} cannot be negative`)
      }
    }
    if (numbers.total_order_qty !== null && numbers.total_order_qty !== undefined && numbers.total_order_qty <= 0) {
      errors.push('Total Order Qty must be greater than 0')
    }
    if (numbers.cycle_time_secs !== null && numbers.cycle_time_secs !== undefined && numbers.cycle_time_secs <= 0) {
      errors.push('Cycle Time (secs) must be greater than 0')
    }
    if (
      numbers.qty_made != null &&
      numbers.total_order_qty != null &&
      numbers.qty_made > numbers.total_order_qty
    ) {
      errors.push('Qty Made cannot exceed Total Order Qty')
    }

    if (errors.length > 0) {
      rowResults.push({
        rowNumber,
        status: 'ERROR',
        mo_number,
        part_no,
        record: null,
        errors,
        changes: [],
      })
      return
    }

    const record: NormalizedQuoteRecord = {
      mo_number: mo_number!,
      part_no: part_no!,
      total_order_qty: numbers.total_order_qty!,
      qty_made: numbers.qty_made ?? null,
      qty_scrapped: numbers.qty_scrapped ?? null,
      cycle_time_secs: numbers.cycle_time_secs!,
      setup_time_secs: numbers.setup_time_secs!,
      run_labour_rate: numbers.run_labour_rate!,
      run_overhead_rate: numbers.run_overhead_rate!,
      setup_labour_rate: numbers.setup_labour_rate!,
      setup_overhead_rate: numbers.setup_overhead_rate!,
      sales_price_per_part: numbers.sales_price_per_part!,
      material_cost_per_part: numbers.material_cost_per_part ?? null,
    }

    rowResults.push({
      rowNumber,
      status: 'NEW', // provisional; resolved by diffAgainstExisting
      mo_number: record.mo_number,
      part_no: record.part_no,
      record,
      errors: [],
      changes: [],
    })
  })

  return { rowResults, headerError: null }
}

const COMPARABLE_FIELDS: (keyof NormalizedQuoteRecord)[] = [
  'part_no',
  'total_order_qty',
  'qty_made',
  'qty_scrapped',
  'cycle_time_secs',
  'setup_time_secs',
  'run_labour_rate',
  'run_overhead_rate',
  'setup_labour_rate',
  'setup_overhead_rate',
  'sales_price_per_part',
  'material_cost_per_part',
]

/**
 * Resolves duplicate MOs within the file and diffs surviving rows against
 * the current job_quotes table. Mutates row statuses in place and returns
 * the same array with final counts.
 */
export function diffAgainstExisting(
  rowResults: ImportRowResult[],
  existingByMo: Map<string, NormalizedQuoteRecord & { completed_at: string | null }>,
): ImportPreview {
  const seenInFile = new Map<string, number[]>()
  for (const row of rowResults) {
    if (row.status === 'ERROR' || !row.mo_number) continue
    const list = seenInFile.get(row.mo_number) ?? []
    list.push(row.rowNumber)
    seenInFile.set(row.mo_number, list)
  }

  for (const row of rowResults) {
    if (row.status === 'ERROR' || !row.record || !row.mo_number) continue

    const dupes = seenInFile.get(row.mo_number) ?? []
    if (dupes.length > 1) {
      row.status = 'ERROR'
      row.errors.push(`Duplicate MO Number in this file (rows ${dupes.join(', ')})`)
      row.record = null
      continue
    }

    const existing = existingByMo.get(row.mo_number)
    if (!existing) {
      row.status = 'NEW'
      continue
    }

    if (existing.completed_at) {
      row.status = 'ERROR'
      row.errors.push('MO is already completed and cannot be re-imported')
      row.record = null
      continue
    }

    if (existing.part_no !== row.record.part_no) {
      row.status = 'ERROR'
      row.errors.push(`MO already linked to part ${existing.part_no}`)
      row.record = null
      continue
    }

    const changes: FieldChange[] = []
    for (const field of COMPARABLE_FIELDS) {
      if (existing[field] !== row.record[field]) {
        changes.push({ field, old: existing[field], new: row.record[field] })
      }
    }

    if (changes.length === 0) {
      row.status = 'UNCHANGED'
    } else {
      row.status = 'UPDATE'
      row.changes = changes
    }
  }

  const counts = { new: 0, update: 0, unchanged: 0, error: 0 }
  for (const row of rowResults) {
    if (row.status === 'NEW') counts.new++
    else if (row.status === 'UPDATE') counts.update++
    else if (row.status === 'UNCHANGED') counts.unchanged++
    else counts.error++
  }

  return { rows: rowResults, counts }
}

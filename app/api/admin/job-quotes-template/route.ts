import { utils, write } from 'xlsx'
import { requireAdmin } from '@/lib/auth/guards'

// Canonical header row — matches the first alias for each field in
// lib/job-costing/import.ts, plus one worked example row so units are
// unambiguous (secs vs hrs, per-part vs per-order, etc).
const HEADERS = [
  'MO Number',
  'Part No',
  'Total Order Qty',
  'Qty Made',
  'Qty Scrapped',
  'Cycle Time (secs)',
  'Setup Time (secs)',
  'Run Labour Rate',
  'Run Overhead Rate',
  'Setup Labour Rate',
  'Setup Overhead Rate',
  'Sales Price Per Part',
  'Material Cost Per Part',
]

const EXAMPLE_ROW = [
  'MO-10234', // MO Number
  'PN-4471-A', // Part No
  500, // Total Order Qty
  '', // Qty Made — leave blank until reported
  '', // Qty Scrapped — leave blank until reported
  42, // Cycle Time (secs) — per part
  1800, // Setup Time (secs) — once per job
  18.5, // Run Labour Rate — £/hr
  12, // Run Overhead Rate — £/hr
  22, // Setup Labour Rate — £/hr
  12, // Setup Overhead Rate — £/hr
  4.75, // Sales Price Per Part
  0.6, // Material Cost Per Part — optional
]

export async function GET() {
  try {
    await requireAdmin()
  } catch {
    return new Response('Unauthorized', { status: 401 })
  }

  const sheet = utils.aoa_to_sheet([HEADERS, EXAMPLE_ROW])
  sheet['!cols'] = HEADERS.map((h) => ({ wch: Math.max(h.length + 2, 14) }))

  const workbook = utils.book_new()
  utils.book_append_sheet(workbook, sheet, 'Job Quotes')

  const buffer = write(workbook, { type: 'buffer', bookType: 'xlsx' })

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="job-quotes-import-template.xlsx"',
    },
  })
}

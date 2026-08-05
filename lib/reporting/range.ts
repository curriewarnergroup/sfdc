// ============================================================
// Reporting date ranges
// ------------------------------------------------------------
// Every report is now bounded by a calendar-day range in Europe/London.
// Previously there was no range at all: each page pulled the entire history
// on every load, which is both slow and — past PostgREST's 1,000-row cap —
// silently wrong.
//
// Ranges are inclusive of both ends and expressed as 'YYYY-MM-DD' London
// day keys, matching v_session_intervals.work_date.
// ============================================================

import { londonDayKey } from '@/lib/tz'

export type RangePreset =
  | 'today'
  | 'yesterday'
  | 'this-week'
  | 'last-7'
  | 'last-30'
  | 'this-month'
  | 'last-month'
  | 'custom'

export type ReportRange = {
  from: string      // YYYY-MM-DD, inclusive
  to: string        // YYYY-MM-DD, inclusive
  preset: RangePreset
  label: string
}

export const PRESETS: Array<{ key: RangePreset; label: string }> = [
  { key: 'today',      label: 'Today' },
  { key: 'yesterday',  label: 'Yesterday' },
  { key: 'this-week',  label: 'This week' },
  { key: 'last-7',     label: 'Last 7 days' },
  { key: 'last-30',    label: 'Last 30 days' },
  { key: 'this-month', label: 'This month' },
  { key: 'last-month', label: 'Last month' },
]

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/

/** Today's London calendar day as YYYY-MM-DD. */
export function londonToday(): string {
  return londonDayKey(Date.now())
}

/** Shift a YYYY-MM-DD day key by n days (calendar arithmetic, DST-safe). */
export function addDays(dayKey: string, n: number): string {
  const [y, m, d] = dayKey.split('-').map(Number)
  const t = Date.UTC(y, m - 1, d + n)
  const dt = new Date(t)
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

/** Monday of the week containing dayKey (UK working week). */
function startOfWeek(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0 = Sunday
  const backToMonday = dow === 0 ? 6 : dow - 1
  return addDays(dayKey, -backToMonday)
}

function startOfMonth(dayKey: string): string {
  return `${dayKey.slice(0, 7)}-01`
}

function endOfMonth(dayKey: string): string {
  const [y, m] = dayKey.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${dayKey.slice(0, 7)}-${String(last).padStart(2, '0')}`
}

export function rangeForPreset(preset: RangePreset): ReportRange {
  const today = londonToday()
  switch (preset) {
    case 'today':
      return { from: today, to: today, preset, label: 'Today' }
    case 'yesterday': {
      const y = addDays(today, -1)
      return { from: y, to: y, preset, label: 'Yesterday' }
    }
    case 'this-week':
      return { from: startOfWeek(today), to: today, preset, label: 'This week' }
    case 'last-30':
      return { from: addDays(today, -29), to: today, preset, label: 'Last 30 days' }
    case 'this-month':
      return { from: startOfMonth(today), to: today, preset, label: 'This month' }
    case 'last-month': {
      const lastMonthDay = addDays(startOfMonth(today), -1)
      return {
        from: startOfMonth(lastMonthDay),
        to: endOfMonth(lastMonthDay),
        preset,
        label: 'Last month',
      }
    }
    case 'last-7':
    default:
      return { from: addDays(today, -6), to: today, preset: 'last-7', label: 'Last 7 days' }
  }
}

/**
 * Resolve a range from page searchParams.
 * Explicit ?from= / ?to= win; otherwise ?preset=; otherwise last 7 days.
 * Invalid or inverted input falls back rather than throwing — a report page
 * should never 500 because someone edited the URL.
 */
export function resolveRange(sp?: {
  from?: string
  to?: string
  preset?: string
}): ReportRange {
  const from = sp?.from?.trim()
  const to = sp?.to?.trim()

  if (from && to && DAY_KEY.test(from) && DAY_KEY.test(to)) {
    const [lo, hi] = from <= to ? [from, to] : [to, from]
    return { from: lo, to: hi, preset: 'custom', label: `${formatDay(lo)} – ${formatDay(hi)}` }
  }

  const preset = (sp?.preset ?? 'last-7') as RangePreset
  const known = PRESETS.some(p => p.key === preset)
  return rangeForPreset(known ? preset : 'last-7')
}

/** Human day for headings and CSV filenames: 06 Aug 2026. */
export function formatDay(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function rangeSuffix(range: ReportRange): string {
  return range.from === range.to ? range.from : `${range.from}_${range.to}`
}

export function minutesToHours(mins: number | null | undefined): number {
  return Math.round(((mins ?? 0) / 60) * 10) / 10
}

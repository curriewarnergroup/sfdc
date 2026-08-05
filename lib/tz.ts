// ============================================================
// UK timezone helpers (Europe/London)
// ------------------------------------------------------------
// The server runs in UTC, but this is a UK company: all shift and calendar-day
// logic must be evaluated in Europe/London, which is GMT (UTC+0) in winter and
// BST (UTC+1) in summer. Never use the server-local getHours()/getDate() for
// business-day math — it would be an hour off for ~half the year. These helpers
// resolve real London wall-clock times via Intl and handle DST automatically.
// ============================================================

export const LONDON_TZ = 'Europe/London'

// The offset (ms) of Europe/London at a given instant. Positive = ahead of UTC
// (BST = +1h). Winter GMT = 0.
function londonOffsetMs(utcMs: number): number {
  const dtf = new Intl.DateTimeFormat('en-GB', {
    timeZone: LONDON_TZ,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = dtf.formatToParts(new Date(utcMs))
  const map: Record<string, string> = {}
  for (const p of parts) map[p.type] = p.value
  const asUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second),
  )
  return asUTC - utcMs
}

// Convert a London wall-clock time (Y, M[1-12], D, h, m) to an epoch-ms instant.
export function londonWallClockToMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): number {
  // First approximation treats the wall clock as if it were UTC, then we
  // correct by the actual London offset at that instant. One iteration is
  // sufficient for all times except the ~1h/year DST fold, which never affects
  // daytime shift ends.
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0)
  const offset = londonOffsetMs(guess)
  return guess - offset
}

// London calendar-day key "YYYY-MM-DD" for an instant. en-CA formats as
// YYYY-MM-DD, so this is a stable, sortable day bucket in UK local time.
export function londonDayKey(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: LONDON_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms))
}

// The [year, month(1-12), day] of the London calendar day containing an instant.
function londonYMD(ms: number): [number, number, number] {
  const [y, m, d] = londonDayKey(ms).split('-').map(Number)
  return [y, m, d]
}

// Epoch-ms of the shift end time (HH:MM[:SS]) on the London day containing `atMs`.
export function shiftEndBoundaryFor(atMs: number, endTime: string): number {
  const [h, m] = endTime.split(':').map(Number)
  const [y, mo, d] = londonYMD(atMs)
  return londonWallClockToMs(y, mo, d, h, m)
}

// Epoch-ms of the FIRST shift-end (HH:MM[:SS]) at or after `fromMs`. This is the
// end of the shift a piece of work belongs to: for a day shift started at 06:46
// it is the same day's end; for a night shift started at 22:00 (end 06:00) it
// correctly rolls to the next morning. Anchoring to the work's own start — not
// "now" — is what keeps stale or overnight sessions from being mis-flagged.
export function firstShiftEndAtOrAfter(fromMs: number, endTime: string): number {
  const sameDay = shiftEndBoundaryFor(fromMs, endTime)
  if (sameDay >= fromMs) return sameDay
  // Shift end already passed on the start day → it ends the following day.
  const [h, m] = endTime.split(':').map(Number)
  const [y, mo, d] = londonYMD(fromMs)
  return londonWallClockToMs(y, mo, d + 1, h, m)
}

// Epoch-ms of the next London midnight strictly after `ms` (start of next day).
export function nextLondonMidnight(ms: number): number {
  const [y, mo, d] = londonYMD(ms)
  return londonWallClockToMs(y, mo, d + 1, 0, 0)
}

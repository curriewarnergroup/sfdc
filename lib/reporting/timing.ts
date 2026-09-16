import { createServiceClient } from '@/lib/supabase/service'
import { londonDayKey, firstShiftEndAtOrAfter, nextLondonMidnight } from '@/lib/tz'

// ============================================================
// Pause-aware timing engine
// ------------------------------------------------------------
// A session's wall-clock elapsed time (ended_at - started_at) is NOT the same
// as the time actually worked. These helpers replay a session's PAUSE/RESUME
// events to split elapsed time into: total (incl. pauses), paused (with a
// breakdown by reason), and net working time. This is the single source of
// truth used by every timing-based report and by job costing.
//
// Lives outside lib/actions/reporting.ts (a 'use server' file, whose exports
// must all be async server actions) so it can export plain sync helpers and
// be imported by both reporting.ts and lib/actions/job-costing.ts.
// ============================================================

export type TimingEvent = {
  event_type: string
  occurred_at: string
  reason_label: string | null
}

export type SessionTiming = {
  totalMs: number
  pausedMs: number
  netMs: number
  breakMs: number
  pauseByReason: Record<string, number> // reason label -> paused ms
}

export function computeSessionTiming(
  startedAt: string,
  endedAt: string | null,
  breakDeductedMinutes: number,
  events: TimingEvent[],
  shift: ShiftContext = { endTime: null, startMs: 0, overrunAuthorised: false },
): SessionTiming {
  const start = new Date(startedAt).getTime()
  const end = endedAt ? new Date(endedAt).getTime() : Date.now()
  // Total elapsed is clamped to the operator's shift end too — time sitting
  // logged in hours after the shift is neither "worked" nor legitimate elapsed.
  const boundary = sessionShiftBoundary({ ...shift, startMs: start })
  const clampEnd = boundary === null ? end : Math.min(end, boundary)
  const effectiveEnd = Math.max(start, clampEnd)
  const totalMs = Math.max(0, effectiveEnd - start)

  const sorted = [...events].sort(
    (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime(),
  )

  let pausedMs = 0
  const pauseByReason: Record<string, number> = {}
  let pauseStart: number | null = null
  let pauseLabel = 'Unspecified'

  for (const ev of sorted) {
    const t = new Date(ev.occurred_at).getTime()
    if (ev.event_type === 'SESSION_PAUSE') {
      pauseStart = t
      pauseLabel = ev.reason_label ?? 'Unspecified'
    } else if (ev.event_type === 'SESSION_RESUME' && pauseStart != null) {
      const dur = Math.max(0, Math.min(t, effectiveEnd) - Math.min(pauseStart, effectiveEnd))
      pausedMs += dur
      pauseByReason[pauseLabel] = (pauseByReason[pauseLabel] ?? 0) + dur
      pauseStart = null
    }
  }
  // Session is still paused right now (no closing RESUME) — count up to end.
  if (pauseStart != null) {
    const dur = Math.max(0, effectiveEnd - Math.min(pauseStart, effectiveEnd))
    pausedMs += dur
    pauseByReason[pauseLabel] = (pauseByReason[pauseLabel] ?? 0) + dur
  }

  const breakMs = Math.max(0, breakDeductedMinutes) * 60000
  const netMs = Math.max(0, totalMs - pausedMs - breakMs)
  return { totalMs, pausedMs, netMs, breakMs, pauseByReason }
}

// Returns the active (non-paused) working intervals [startMs, endMs] of a
// session — used to attribute worked time to the correct calendar day.
export function getWorkingIntervals(
  startedAt: string,
  endedAt: string | null,
  events: TimingEvent[],
  shift: ShiftContext = { endTime: null, startMs: 0, overrunAuthorised: false },
): Array<[number, number]> {
  const start = new Date(startedAt).getTime()
  const end = endedAt ? new Date(endedAt).getTime() : Date.now()
  const sorted = [...events].sort(
    (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime(),
  )
  const intervals: Array<[number, number]> = []
  let activeStart: number | null = start
  for (const ev of sorted) {
    const t = Math.min(new Date(ev.occurred_at).getTime(), end)
    if (ev.event_type === 'SESSION_PAUSE' && activeStart != null) {
      if (t > activeStart) intervals.push([activeStart, t])
      activeStart = null
    } else if (ev.event_type === 'SESSION_RESUME' && activeStart == null) {
      activeStart = t
    }
  }
  if (activeStart != null && end > activeStart) intervals.push([activeStart, end])
  // Cut off anything worked past the operator's shift end (unless authorised).
  // Anchor the shift day to this session's actual start.
  return clampIntervalsToShift(intervals, { ...shift, startMs: start })
}

// Local YYYY-MM-DD key (server timezone) for grouping by calendar day.
// Splits working intervals into per-calendar-day minutes, breaking at London
// midnight so a session that runs past midnight is counted on both days
// correctly in UK local time (GMT/BST aware).
export function minutesByDay(intervals: Array<[number, number]>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [s, e] of intervals) {
    let cur = s
    while (cur < e) {
      const segEnd = Math.min(e, nextLondonMidnight(cur))
      const key = londonDayKey(cur)
      out[key] = (out[key] ?? 0) + (segEnd - cur) / 60000
      cur = segEnd
    }
  }
  return out
}

// Fetch and group PAUSE/RESUME timing events for a set of session ids.
// Also reports which sessions carry a shift-overrun authorisation (stored as a
// SESSION_RESUME event with metadata.overrun_authorised = true, since we cannot
// add DB columns from this environment).
export async function fetchTimingEvents(
  supabase: ReturnType<typeof createServiceClient>,
  sessionIds: string[],
): Promise<{ events: Map<string, TimingEvent[]>; overrunAuthorised: Set<string> }> {
  const bySession = new Map<string, TimingEvent[]>()
  const overrunAuthorised = new Set<string>()
  if (sessionIds.length === 0) return { events: bySession, overrunAuthorised }

  // Chunk to stay within IN-clause limits on large datasets — batches of
  // session IDs rather than one large IN list.
  const chunkSize = 500
  for (let i = 0; i < sessionIds.length; i += chunkSize) {
    const chunk = sessionIds.slice(i, i + chunkSize)
    const { data } = await supabase
      .from('session_events')
      .select('session_id, event_type, occurred_at, metadata, pause_reason:pause_reasons(label)')
      .in('session_id', chunk)
      .in('event_type', ['SESSION_PAUSE', 'SESSION_RESUME'])
      .order('occurred_at', { ascending: true })
    for (const ev of data ?? []) {
      if ((ev.metadata as any)?.overrun_authorised) {
        overrunAuthorised.add(ev.session_id)
        // This marker is not a real pause/resume — skip it as a timing event.
        continue
      }
      const list = bySession.get(ev.session_id) ?? []
      list.push({
        event_type: ev.event_type as string,
        occurred_at: ev.occurred_at as string,
        reason_label: (ev.pause_reason as any)?.label ?? null,
      })
      bySession.set(ev.session_id, list)
    }
  }
  return { events: bySession, overrunAuthorised }
}

// ---- Shift-end clamp -------------------------------------------------------
// A user's shift defines a daily end time (HH:MM, server-local). Work done
// after that boundary does NOT count as worked time UNLESS the operator
// confirmed (via PIN) they were still present — recorded as a SESSION_RESUME
// event carrying metadata.overrun_authorised = true. This applies both live
// and retroactively to all historical data (no confirmations existed before,
// so past overruns are simply clamped).

export type ShiftContext = {
  endTime: string | null // 'HH:MM[:SS]' from the user's shift, or null = no shift
  startMs: number // when the session started (anchors the shift day)
  overrunAuthorised: boolean // operator confirmed presence past shift end
}

// The single shift-end boundary (epoch ms) that applies to a session, or null
// when there is no shift or the overrun was authorised. Anchored to the shift
// the session's work belongs to (based on its start), so overnight and older
// sessions are handled correctly.
function sessionShiftBoundary(shift: ShiftContext): number | null {
  if (!shift.endTime || shift.overrunAuthorised) return null
  return firstShiftEndAtOrAfter(shift.startMs, shift.endTime)
}

// Clamp working intervals so nothing after the operator's shift end counts.
// Returns intervals unchanged when there is no shift or the overrun is authorised.
function clampIntervalsToShift(
  intervals: Array<[number, number]>,
  shift: ShiftContext,
): Array<[number, number]> {
  const boundary = sessionShiftBoundary(shift)
  if (boundary === null) return intervals
  const out: Array<[number, number]> = []
  for (const [s, e] of intervals) {
    if (s >= boundary) continue // whole interval is past shift end
    out.push([s, Math.min(e, boundary)]) // truncate at the boundary
  }
  return out
}

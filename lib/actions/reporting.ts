'use server'

import { createServiceClient } from '@/lib/supabase/service'
import { londonDayKey, firstShiftEndAtOrAfter, nextLondonMidnight } from '@/lib/tz'

// ============================================================
// Pause-aware timing engine
// ------------------------------------------------------------
// A session's wall-clock elapsed time (ended_at - started_at) is NOT the same
// as the time actually worked. These helpers replay a session's PAUSE/RESUME
// events to split elapsed time into: total (incl. pauses), paused (with a
// breakdown by reason), and net working time. This is the single source of
// truth used by every report below.
// ============================================================

type TimingEvent = {
  event_type: string
  occurred_at: string
  reason_label: string | null
}

type SessionTiming = {
  totalMs: number
  pausedMs: number
  netMs: number
  breakMs: number
  pauseByReason: Record<string, number> // reason label -> paused ms
}

function computeSessionTiming(
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
function getWorkingIntervals(
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
function minutesByDay(intervals: Array<[number, number]>): Record<string, number> {
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
async function fetchTimingEvents(
  supabase: ReturnType<typeof createServiceClient>,
  sessionIds: string[],
): Promise<{ events: Map<string, TimingEvent[]>; overrunAuthorised: Set<string> }> {
  const bySession = new Map<string, TimingEvent[]>()
  const overrunAuthorised = new Set<string>()
  if (sessionIds.length === 0) return { events: bySession, overrunAuthorised }

  // Chunk to stay within IN-clause limits on large datasets.
  const chunkSize = 200
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

type ShiftContext = {
  endTime: string | null            // 'HH:MM[:SS]' from the user's shift, or null = no shift
  startMs: number                   // when the session started (anchors the shift day)
  overrunAuthorised: boolean        // operator confirmed presence past shift end
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
    if (s >= boundary) continue          // whole interval is past shift end
    out.push([s, Math.min(e, boundary)]) // truncate at the boundary
  }
  return out
}


// ---- Machine Status ----
// Returns all machines with their current active/paused session (if any)
// Uses the same proven join pattern as getDashboardStats in admin.ts
export async function getMachineStatusReport() {
  const supabase = createServiceClient()

  const { data: machines } = await supabase
    .from('machines')
    .select('id, machine_code, description, is_active')
    .eq('is_active', true)

  if (!machines) return []

  // Single query with all joins — same pattern as getDashboardStats
  const { data: activeSessions } = await supabase
    .from('sessions')
    .select('*, machine:machines(*), user:shopfloor_users!user_id(*), authoriser:shopfloor_users!authorised_by(*)')
    .in('status', ['ACTIVE', 'PAUSED'])

  // For paused sessions, get the most recent pause event's reason
  const pausedIds = (activeSessions ?? []).filter(s => s.status === 'PAUSED').map(s => s.id)
  const pauseReasonMap = new Map<string, string>()
  if (pausedIds.length > 0) {
    const { data: pauseEvents } = await supabase
      .from('session_events')
      .select('session_id, pause_reason:pause_reasons(label)')
      .eq('event_type', 'SESSION_PAUSE')
      .in('session_id', pausedIds)
      .order('occurred_at', { ascending: false })
    for (const ev of pauseEvents ?? []) {
      if (!pauseReasonMap.has(ev.session_id) && (ev.pause_reason as any)?.label) {
        pauseReasonMap.set(ev.session_id, (ev.pause_reason as any).label)
      }
    }
  }

  const sessionsByMachine = new Map((activeSessions ?? []).map(s => [s.machine_id, s]))

  // Natural sort: BH1, BH2, BH3 ... BH10 not BH1, BH10, BH2
  const sorted = [...machines].sort((a, b) =>
    a.machine_code.localeCompare(b.machine_code, undefined, { numeric: true, sensitivity: 'base' })
  )

  return sorted.map(m => {
    const session = sessionsByMachine.get(m.id) ?? null
    return {
      ...m,
      session: session ? { ...session, pause_reason_label: pauseReasonMap.get(session.id) ?? null } : null,
    }
  })
}

// ---- Machine Current Live Status ----
export async function getMachineCurrentStatus(machineId: string) {
  const supabase = createServiceClient()

  // Get machine info
  const { data: machine } = await supabase
    .from('machines')
    .select('id, machine_code, description, is_active, unmanned_threshold_minutes')
    .eq('id', machineId)
    .single()

  if (!machine) return null

  // Get active/paused session with operator + authoriser
  const { data: session } = await supabase
    .from('sessions')
    .select(`
      id,
      session_type,
      status,
      mo_number,
      started_at,
      qty_to_make,
      qty_made,
      qty_scrapped,
      authorised_by,
      user:shopfloor_users!user_id(id, display_name, role),
      authoriser:shopfloor_users!authorised_by(id, display_name)
    `)
    .eq('machine_id', machineId)
    .in('status', ['ACTIVE', 'PAUSED'])
    .maybeSingle()

  // Pull part number from mo_check_assignments if an active MO exists
  let partNumber: string | null = null
  if (session?.mo_number) {
    const { data: assignment } = await supabase
      .from('mo_check_assignments')
      .select('product_id')
      .eq('mo_number', session.mo_number)
      .not('product_id', 'is', null)
      .limit(1)
      .maybeSingle()
    partNumber = assignment?.product_id ?? null
  }

  // Get current pause reason if paused
  let pauseReasonLabel: string | null = null
  if (session?.status === 'PAUSED') {
    const { data: lastPause } = await supabase
      .from('session_events')
      .select('pause_reason:pause_reasons(label)')
      .eq('session_id', session.id)
      .eq('event_type', 'SESSION_PAUSE')
      .order('occurred_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    pauseReasonLabel = (lastPause?.pause_reason as any)?.label ?? null
  }

  return {
    machine,
    session: session
      ? { ...session, part_number: partNumber, pause_reason_label: pauseReasonLabel }
      : null,
  }
}

// ---- Machine History (all sessions for a machine by its UUID) ----
export async function getMachineHistory(machineId: string) {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('sessions')
    .select(`
      id,
      session_type,
      status,
      mo_number,
      started_at,
      ended_at,
      qty_to_make,
      qty_made,
      qty_scrapped,
      user:shopfloor_users ( display_name, role )
    `)
    .eq('machine_id', machineId)
    .order('started_at', { ascending: false })
    .limit(200)
  return data ?? []
}

// ---- Machine Event Log ----
// Returns all session_events for a machine's sessions — full event log
export async function getMachineEventLog(machineId: string) {
  const supabase = createServiceClient()

  // First get all session IDs for this machine
  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, session_type, mo_number, status, started_at, ended_at, qty_made, qty_to_make, qty_scrapped')
    .eq('machine_id', machineId)
    .order('started_at', { ascending: false })
    .limit(100)

  if (!sessions || sessions.length === 0) return { sessions: [], events: [] }

  const sessionIds = sessions.map(s => s.id)

  const { data: events } = await supabase
    .from('session_events')
    .select('id, session_id, event_type, occurred_at, actor_user:shopfloor_users(display_name, role), pause_reason:pause_reasons(label), metadata')
    .in('session_id', sessionIds)
    .order('occurred_at', { ascending: false })
    .limit(500)

  return { sessions, events: events ?? [] }
}

// ---- Setup Time Report ----
// Blanket overview of every machine: total time spent in setup, number of
// setups, current live status, and which machines are in setup right now.
export async function getSetupTimeReport() {
  const supabase = createServiceClient()

  const { data: machines } = await supabase
    .from('machines')
    .select('id, machine_code, description, is_active')
    .eq('is_active', true)

  if (!machines) return []

  // Every SETUP session (any status) — used to total setup time per machine.
  // Join the operator's shift so setup time worked past shift end is excluded.
  const { data: setupSessions } = await supabase
    .from('sessions')
    .select('id, machine_id, status, started_at, ended_at, break_deducted_minutes, user:shopfloor_users!user_id(shift:shift_patterns(end_time))')
    .eq('session_type', 'SETUP')

  // All currently live sessions (any type) to determine each machine's status
  const { data: liveSessions } = await supabase
    .from('sessions')
    .select('id, machine_id, session_type, status, mo_number, started_at, user:shopfloor_users!user_id(display_name, role)')
    .in('status', ['ACTIVE', 'PAUSED'])

  const liveByMachine = new Map((liveSessions ?? []).map(s => [s.machine_id, s]))

  // Replay pause/resume events so setup time is split into worked vs paused.
  const { events: eventsBySession, overrunAuthorised } = await fetchTimingEvents(
    supabase,
    (setupSessions ?? []).map(s => s.id),
  )

  // Aggregate per machine: total (incl pauses), working, paused, reason breakdown.
  type Agg = {
    totalMinutes: number
    netMinutes: number
    pausedMinutes: number
    count: number
    lastSetup: string | null
    pauseByReason: Record<string, number> // label -> minutes
  }
  const setupAgg = new Map<string, Agg>()
  for (const s of setupSessions ?? []) {
    const t = computeSessionTiming(
      s.started_at,
      s.ended_at,
      s.break_deducted_minutes ?? 0,
      eventsBySession.get(s.id) ?? [],
      {
        endTime: (s.user as any)?.shift?.end_time ?? null,
        startMs: new Date(s.started_at).getTime(),
        overrunAuthorised: overrunAuthorised.has(s.id),
      },
    )
    const cur = setupAgg.get(s.machine_id) ?? {
      totalMinutes: 0, netMinutes: 0, pausedMinutes: 0, count: 0, lastSetup: null, pauseByReason: {},
    }
    cur.totalMinutes += t.totalMs / 60000
    cur.netMinutes += t.netMs / 60000
    cur.pausedMinutes += t.pausedMs / 60000
    cur.count += 1
    for (const [label, ms] of Object.entries(t.pauseByReason)) {
      cur.pauseByReason[label] = (cur.pauseByReason[label] ?? 0) + ms / 60000
    }
    if (!cur.lastSetup || new Date(s.started_at) > new Date(cur.lastSetup)) cur.lastSetup = s.started_at
    setupAgg.set(s.machine_id, cur)
  }

  const sorted = [...machines].sort((a, b) =>
    a.machine_code.localeCompare(b.machine_code, undefined, { numeric: true, sensitivity: 'base' })
  )

  return sorted.map(m => {
    const agg = setupAgg.get(m.id) ?? {
      totalMinutes: 0, netMinutes: 0, pausedMinutes: 0, count: 0, lastSetup: null, pauseByReason: {},
    }
    const live = liveByMachine.get(m.id) ?? null
    const inSetup = !!live && live.session_type === 'SETUP'
    const pauseBreakdown = Object.entries(agg.pauseByReason)
      .map(([label, minutes]) => ({ label, minutes: Math.round(minutes) }))
      .filter(r => r.minutes > 0)
      .sort((a, b) => b.minutes - a.minutes)
    return {
      id: m.id,
      machine_code: m.machine_code,
      description: m.description as string | null,
      total_setup_minutes: Math.round(agg.totalMinutes),
      net_setup_minutes: Math.round(agg.netMinutes),
      paused_setup_minutes: Math.round(agg.pausedMinutes),
      pause_breakdown: pauseBreakdown,
      setup_count: agg.count,
      last_setup: agg.lastSetup,
      in_setup: inSetup,
      current: live
        ? {
            session_type: live.session_type as string,
            status: live.status as string,
            mo_number: live.mo_number as string,
            started_at: live.started_at as string,
            operator: (live.user as any)?.display_name ?? null,
          }
        : null,
    }
  })
}

// ---- Operator Time Report ----
export async function getOperatorTimeReport() {
  const supabase = createServiceClient()

  const { data: users } = await supabase
    .from('shopfloor_users')
    .select('id, display_name, role, is_active')
    .in('role', ['OPERATOR', 'SETTER', 'SUPERVISOR'])
    .order('display_name')

  if (!users) return []

  // Get all sessions (finished, auto-closed, AND active) grouped by user.
  // Join each operator's shift so post-shift time is excluded from worked hours.
  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, user_id, started_at, ended_at, break_deducted_minutes, status, user:shopfloor_users!user_id(shift:shift_patterns(end_time))')
    .not('session_type', 'eq', 'UNMANNED')

  // Replay pauses so "hours worked" is time actually working, not wall-clock.
  const { events: eventsBySession, overrunAuthorised } = await fetchTimingEvents(
    supabase,
    (sessions ?? []).map(s => s.id),
  )

  const sessionsByUser = new Map<string, typeof sessions>()
  for (const s of sessions ?? []) {
    if (!sessionsByUser.has(s.user_id)) sessionsByUser.set(s.user_id, [])
    sessionsByUser.get(s.user_id)!.push(s)
  }

  return users.map(u => {
    const userSessions = sessionsByUser.get(u.id) ?? []
    let netMinutes = 0
    let totalMinutes = 0
    for (const s of userSessions) {
      const t = computeSessionTiming(
        s.started_at,
        s.ended_at,
        s.break_deducted_minutes ?? 0,
        eventsBySession.get(s.id) ?? [],
        {
          endTime: (s.user as any)?.shift?.end_time ?? null,
          startMs: new Date(s.started_at).getTime(),
          overrunAuthorised: overrunAuthorised.has(s.id),
        },
      )
      netMinutes += t.netMs / 60000
      totalMinutes += t.totalMs / 60000
    }
    return {
      ...u,
      session_count: userSessions.length,
      hours_worked: Math.round((netMinutes / 60) * 10) / 10,
      hours_elapsed: Math.round((totalMinutes / 60) * 10) / 10,
      hours_produced: null as number | null,
    }
  })
}

// ---- Operator Daily Work Breakdown ----
// For each person, a day-by-day breakdown of hours actually worked (pauses
// excluded) and exactly where — which machine + MO — they spent that time.
// Working time is attributed to the calendar day it happened on, so a session
// that spans midnight is counted correctly across both days.
export async function getOperatorDailyReport() {
  const supabase = createServiceClient()

  const { data: users } = await supabase
    .from('shopfloor_users')
    .select('id, display_name, role')
    .in('role', ['OPERATOR', 'SETTER', 'SUPERVISOR'])
    .order('display_name')

  if (!users) return []

  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, user_id, session_type, mo_number, started_at, ended_at, machine:machines(machine_code, description), user:shopfloor_users!user_id(shift:shift_patterns(end_time))')
    .not('session_type', 'eq', 'UNMANNED')
    .order('started_at', { ascending: false })

  const { events: eventsBySession, overrunAuthorised } = await fetchTimingEvents(
    supabase,
    (sessions ?? []).map(s => s.id),
  )

  // user -> day -> { minutes, entries map keyed by machine|mo|type }
  type Entry = { machine_code: string; description: string | null; mo_number: string; session_type: string; minutes: number }
  type DayAgg = { minutes: number; entries: Map<string, Entry> }
  const byUser = new Map<string, Map<string, DayAgg>>()

  for (const s of sessions ?? []) {
    const intervals = getWorkingIntervals(s.started_at, s.ended_at, eventsBySession.get(s.id) ?? [], {
      endTime: (s.user as any)?.shift?.end_time ?? null,
      startMs: new Date(s.started_at).getTime(),
      overrunAuthorised: overrunAuthorised.has(s.id),
    })
    const perDay = minutesByDay(intervals)
    const machineCode = (s.machine as any)?.machine_code ?? 'Unknown'
    const description = (s.machine as any)?.description ?? null
    const entryKey = `${machineCode}|${s.mo_number}|${s.session_type}`

    let days = byUser.get(s.user_id)
    if (!days) { days = new Map(); byUser.set(s.user_id, days) }

    for (const [day, minutes] of Object.entries(perDay)) {
      if (minutes <= 0) continue
      let agg = days.get(day)
      if (!agg) { agg = { minutes: 0, entries: new Map() }; days.set(day, agg) }
      agg.minutes += minutes
      const existing = agg.entries.get(entryKey)
      if (existing) {
        existing.minutes += minutes
      } else {
        agg.entries.set(entryKey, {
          machine_code: machineCode,
          description,
          mo_number: s.mo_number as string,
          session_type: s.session_type as string,
          minutes,
        })
      }
    }
  }

  return users.map(u => {
    const days = byUser.get(u.id) ?? new Map<string, DayAgg>()
    const dayList = [...days.entries()]
      .map(([date, agg]) => ({
        date,
        hours: Math.round((agg.minutes / 60) * 10) / 10,
        entries: [...agg.entries.values()]
          .map(e => ({ ...e, hours: Math.round((e.minutes / 60) * 10) / 10 }))
          .sort((a, b) => b.minutes - a.minutes),
      }))
      .filter(d => d.hours > 0)
      .sort((a, b) => (a.date < b.date ? 1 : -1)) // most recent day first
    const totalHours = Math.round(dayList.reduce((s, d) => s + d.hours, 0) * 10) / 10
    return {
      id: u.id,
      display_name: u.display_name,
      role: u.role,
      total_hours: totalHours,
      days: dayList,
    }
  })
}

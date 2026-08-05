'use server'

import { createServiceClient } from '@/lib/supabase/service'
import type { ReportRange } from '@/lib/reporting/range'
import { minutesToHours } from '@/lib/reporting/range'

// ============================================================
// Reporting
// ------------------------------------------------------------
// The timing engine now lives in Postgres (see the supabase/migrations
// files for v_session_intervals and the rpt_* functions). This module is a
// thin, typed wrapper over those RPCs plus the live-status queries, which
// are genuinely current-state and stay in the app layer.
//
// What changed and why:
//
//  * Every historical report now takes a date range. There was previously
//    no range at all, so each page recomputed the entire history in Node.
//
//  * Nothing selects an unbounded list any more. PostgREST caps rows at
//    1,000 by default and does not raise an error when it truncates, so
//    the old `select all sessions` / `select all events` pattern was
//    silently dropping data — and dropping pause events made worked time
//    read HIGH. Anything that could exceed the cap now pages explicitly.
//
//  * Hours are attributed to the operator who was signed on at the time,
//    not sessions.user_id, which is overwritten on handover.
//
//  * Breaks are deducted from the shift's break window.
//
//  * Cancelled setups are excluded from setup averages.
// ============================================================

const PAGE_SIZE = 1000

/**
 * Page through a PostgREST query rather than trusting the default cap.
 * `build` must return a fresh query builder each call.
 */
async function fetchAllPages<T>(
  build: () => any,
  { pageSize = PAGE_SIZE, maxRows = 50_000 }: { pageSize?: number; maxRows?: number } = {},
): Promise<T[]> {
  const out: T[] = []
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const { data, error } = await build().range(offset, offset + pageSize - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < pageSize) break
  }
  return out
}

// ============================================================
// Live status (current-state — no date range applies)
// ============================================================

// ---- Machine Status ----
export async function getMachineStatusReport() {
  const supabase = createServiceClient()

  const { data: machines } = await supabase
    .from('machines')
    .select('id, machine_code, description, is_active, unmanned_threshold_minutes')
    .eq('is_active', true)

  if (!machines) return []

  const { data: activeSessions } = await supabase
    .from('sessions')
    .select('*, machine:machines(*), user:shopfloor_users!user_id(*), authoriser:shopfloor_users!authorised_by(*)')
    .in('status', ['ACTIVE', 'PAUSED'])
    .order('started_at', { ascending: false })

  // Most recent pause reason for each paused session.
  const pausedIds = (activeSessions ?? []).filter(s => s.status === 'PAUSED').map(s => s.id)
  const pauseReasonMap = new Map<string, string>()
  if (pausedIds.length > 0) {
    const { data: pauseEvents } = await supabase
      .from('session_events')
      .select('session_id, pause_reason:pause_reasons(label), metadata')
      .eq('event_type', 'SESSION_PAUSE')
      .in('session_id', pausedIds)
      .order('occurred_at', { ascending: false })
    for (const ev of pauseEvents ?? []) {
      if (pauseReasonMap.has(ev.session_id)) continue
      const label =
        (ev.pause_reason as any)?.label ??
        ((ev.metadata as any)?.handover ? 'Operator handover' : null) ??
        ((ev.metadata as any)?.auto_logout ? 'Shift end — no response' : null) ??
        ((ev.metadata as any)?.admin_override ? 'Admin hold' : null)
      if (label) pauseReasonMap.set(ev.session_id, label)
    }
  }

  // One live session per machine is enforced by a partial unique index, but
  // take the most recent defensively rather than letting map order decide.
  const sessionsByMachine = new Map<string, any>()
  for (const s of activeSessions ?? []) {
    if (!sessionsByMachine.has(s.machine_id)) sessionsByMachine.set(s.machine_id, s)
  }

  const sorted = [...machines].sort((a, b) =>
    a.machine_code.localeCompare(b.machine_code, undefined, { numeric: true, sensitivity: 'base' }),
  )

  return sorted.map(m => {
    const session = sessionsByMachine.get(m.id) ?? null
    return {
      ...m,
      session: session
        ? { ...session, pause_reason_label: pauseReasonMap.get(session.id) ?? null }
        : null,
    }
  })
}

// ---- Machine Current Live Status ----
export async function getMachineCurrentStatus(machineId: string) {
  const supabase = createServiceClient()

  const { data: machine } = await supabase
    .from('machines')
    .select('id, machine_code, description, is_active, unmanned_threshold_minutes')
    .eq('id', machineId)
    .single()

  if (!machine) return null

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
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

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

  let pauseReasonLabel: string | null = null
  if (session?.status === 'PAUSED') {
    const { data: lastPause } = await supabase
      .from('session_events')
      .select('pause_reason:pause_reasons(label), metadata')
      .eq('session_id', session.id)
      .eq('event_type', 'SESSION_PAUSE')
      .order('occurred_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    pauseReasonLabel =
      (lastPause?.pause_reason as any)?.label ??
      ((lastPause?.metadata as any)?.handover ? 'Operator handover' : null) ??
      ((lastPause?.metadata as any)?.auto_logout ? 'Shift end — no response' : null) ??
      null
  }

  return {
    machine,
    session: session
      ? { ...session, part_number: partNumber, pause_reason_label: pauseReasonLabel }
      : null,
  }
}

// ---- Machine History ----
export async function getMachineHistory(
  machineId: string,
  opts?: { from?: string; to?: string; limit?: number },
) {
  const supabase = createServiceClient()
  let q = supabase
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
      user:shopfloor_users!user_id ( display_name, role )
    `)
    .eq('machine_id', machineId)
    .order('started_at', { ascending: false })
    .limit(opts?.limit ?? 200)

  if (opts?.from) q = q.gte('started_at', `${opts.from}T00:00:00Z`)
  if (opts?.to) q = q.lte('started_at', `${opts.to}T23:59:59Z`)

  const { data } = await q
  return data ?? []
}

// ---- Machine Event Log ----
export async function getMachineEventLog(
  machineId: string,
  opts?: { sessionLimit?: number; eventLimit?: number },
) {
  const supabase = createServiceClient()

  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, session_type, mo_number, status, started_at, ended_at, qty_made, qty_to_make, qty_scrapped')
    .eq('machine_id', machineId)
    .order('started_at', { ascending: false })
    .limit(opts?.sessionLimit ?? 100)

  if (!sessions || sessions.length === 0) return { sessions: [], events: [] }

  const sessionIds = sessions.map(s => s.id)

  const { data: events } = await supabase
    .from('session_events')
    .select('id, session_id, event_type, occurred_at, actor_user:shopfloor_users(display_name, role), pause_reason:pause_reasons(label), metadata')
    .in('session_id', sessionIds)
    .order('occurred_at', { ascending: false })
    .limit(opts?.eventLimit ?? 500)

  return { sessions, events: events ?? [] }
}

// ============================================================
// Historical reports (RPC-backed)
// ============================================================

type SetupRow = {
  machine_id: string
  machine_code: string
  machine_description: string | null
  setup_count: number
  abandoned_count: number
  worked_minutes: number
  paused_minutes: number
  total_minutes: number
  avg_setup_minutes: number
  last_setup: string | null
  pause_breakdown: Array<{ label: string; minutes: number }>
}

// ---- Setup Time Report ----
// Shape is unchanged from the previous version so SetupTimeGrid keeps
// working; abandoned_count and avg_setup_minutes are new additions.
export async function getSetupTimeReport(range: ReportRange) {
  const supabase = createServiceClient()

  const [{ data: machines }, { data: rpcRows, error }, { data: liveSessions }] = await Promise.all([
    supabase
      .from('machines')
      .select('id, machine_code, description, is_active')
      .eq('is_active', true),
    supabase.rpc('rpt_setup_time', { p_from: range.from, p_to: range.to }),
    supabase
      .from('sessions')
      .select('id, machine_id, session_type, status, mo_number, started_at, user:shopfloor_users!user_id(display_name, role)')
      .in('status', ['ACTIVE', 'PAUSED']),
  ])

  if (error) throw new Error(`rpt_setup_time: ${error.message}`)
  if (!machines) return []

  const byMachine = new Map<string, SetupRow>(
    ((rpcRows ?? []) as SetupRow[]).map(r => [r.machine_id, r]),
  )
  const liveByMachine = new Map((liveSessions ?? []).map(s => [s.machine_id, s]))

  const sorted = [...machines].sort((a, b) =>
    a.machine_code.localeCompare(b.machine_code, undefined, { numeric: true, sensitivity: 'base' }),
  )

  return sorted.map(m => {
    const r = byMachine.get(m.id)
    const live = liveByMachine.get(m.id) ?? null
    return {
      id: m.id,
      machine_code: m.machine_code,
      description: (m.description ?? null) as string | null,
      total_setup_minutes: Math.round(Number(r?.total_minutes ?? 0)),
      net_setup_minutes: Math.round(Number(r?.worked_minutes ?? 0)),
      paused_setup_minutes: Math.round(Number(r?.paused_minutes ?? 0)),
      avg_setup_minutes: Math.round(Number(r?.avg_setup_minutes ?? 0)),
      pause_breakdown: (r?.pause_breakdown ?? []).map(p => ({
        label: p.label,
        minutes: Math.round(Number(p.minutes)),
      })),
      setup_count: Number(r?.setup_count ?? 0),
      abandoned_count: Number(r?.abandoned_count ?? 0),
      last_setup: r?.last_setup ?? null,
      in_setup: !!live && live.session_type === 'SETUP',
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
export async function getOperatorTimeReport(range: ReportRange) {
  const supabase = createServiceClient()

  const [{ data: users }, { data: rows, error }] = await Promise.all([
    supabase
      .from('shopfloor_users')
      .select('id, display_name, role, is_active')
      .in('role', ['OPERATOR', 'SETTER', 'SUPERVISOR'])
      .order('display_name'),
    supabase.rpc('rpt_operator_summary', { p_from: range.from, p_to: range.to }),
  ])

  if (error) throw new Error(`rpt_operator_summary: ${error.message}`)
  if (!users) return []

  const byUser = new Map(
    ((rows ?? []) as any[]).map(r => [r.operator_id as string, r]),
  )

  return users.map(u => {
    const r = byUser.get(u.id)
    return {
      ...u,
      session_count: Number(r?.session_count ?? 0),
      // Machine-hours: sums every session, so someone running three machines
      // for an hour shows three hours. Right for job costing.
      hours_worked: minutesToHours(Number(r?.worked_minutes ?? 0)),
      // Wall-clock hours: overlapping sessions merged. Right for attendance.
      hours_on_clock: minutesToHours(Number(r?.clock_minutes ?? 0)),
      hours_paused: minutesToHours(Number(r?.paused_minutes ?? 0)),
      hours_break: minutesToHours(Number(r?.break_minutes ?? 0)),
      hours_elapsed: minutesToHours(Number(r?.elapsed_minutes ?? 0)),
      // Still null: nothing writes sessions.qty_made, so there is no
      // produced-hours figure to compute efficiency against. See docs.
      hours_produced: null as number | null,
    }
  })
}

// ---- Operator Daily Work Breakdown ----
export async function getOperatorDailyReport(range: ReportRange) {
  const supabase = createServiceClient()

  const [{ data: users }, { data: rows, error }] = await Promise.all([
    supabase
      .from('shopfloor_users')
      .select('id, display_name, role')
      .in('role', ['OPERATOR', 'SETTER', 'SUPERVISOR'])
      .order('display_name'),
    supabase.rpc('rpt_operator_daily', { p_from: range.from, p_to: range.to }),
  ])

  if (error) throw new Error(`rpt_operator_daily: ${error.message}`)
  if (!users) return []

  type Entry = {
    machine_code: string
    description: string | null
    mo_number: string
    session_type: string
    minutes: number
    hours: number
  }
  const byUser = new Map<string, Map<string, { minutes: number; entries: Entry[] }>>()

  for (const r of (rows ?? []) as any[]) {
    const minutes = Number(r.worked_minutes ?? 0)
    if (minutes <= 0) continue
    let days = byUser.get(r.operator_id)
    if (!days) {
      days = new Map()
      byUser.set(r.operator_id, days)
    }
    let day = days.get(r.work_date)
    if (!day) {
      day = { minutes: 0, entries: [] }
      days.set(r.work_date, day)
    }
    day.minutes += minutes
    day.entries.push({
      machine_code: r.machine_code ?? 'Unknown',
      description: r.machine_description ?? null,
      mo_number: r.mo_number,
      session_type: r.session_type,
      minutes,
      hours: minutesToHours(minutes),
    })
  }

  return users.map(u => {
    const days = byUser.get(u.id) ?? new Map()
    const dayList = [...days.entries()]
      .map(([date, agg]: [string, { minutes: number; entries: Entry[] }]) => ({
        date,
        hours: minutesToHours(agg.minutes),
        entries: agg.entries.sort((a, b) => b.minutes - a.minutes),
      }))
      .filter(d => d.hours > 0)
      .sort((a, b) => (a.date < b.date ? 1 : -1))

    return {
      id: u.id,
      display_name: u.display_name,
      role: u.role,
      total_hours: Math.round(dayList.reduce((s, d) => s + d.hours, 0) * 10) / 10,
      days: dayList,
    }
  })
}

// ---- Downtime Pareto ----
// Where stopped time actually goes, biggest cause first, with a running
// cumulative percentage so the 80/20 line is obvious.
export async function getDowntimeParetoReport(range: ReportRange, machineId?: string) {
  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('rpt_downtime_pareto', {
    p_from: range.from,
    p_to: range.to,
    p_machine_id: machineId ?? null,
  })
  if (error) throw new Error(`rpt_downtime_pareto: ${error.message}`)

  return ((data ?? []) as any[]).map(r => ({
    pause_reason: r.pause_reason as string,
    minutes: Number(r.minutes),
    hours: minutesToHours(Number(r.minutes)),
    occurrences: Number(r.occurrences),
    machines_hit: Number(r.machines_hit),
    pct_of_total: Number(r.pct_of_total),
    running_pct: Number(r.running_pct),
  }))
}

// ---- Machine Utilisation ----
export async function getMachineUtilisationReport(
  range: ReportRange,
  capacityMinutesPerDay = 480,
) {
  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('rpt_machine_utilisation', {
    p_from: range.from,
    p_to: range.to,
    p_capacity_minutes_per_day: capacityMinutesPerDay,
  })
  if (error) throw new Error(`rpt_machine_utilisation: ${error.message}`)

  return ((data ?? []) as any[]).map(r => ({
    machine_id: r.machine_id as string,
    machine_code: r.machine_code as string,
    machine_description: (r.machine_description ?? null) as string | null,
    work_date: r.work_date as string,
    run_minutes: Number(r.run_minutes),
    setup_minutes: Number(r.setup_minutes),
    unmanned_minutes: Number(r.unmanned_minutes),
    paused_minutes: Number(r.paused_minutes),
    break_minutes: Number(r.break_minutes),
    capacity_minutes: Number(r.capacity_minutes),
    utilisation_pct: r.utilisation_pct == null ? null : Number(r.utilisation_pct),
    setup_ratio_pct: r.setup_ratio_pct == null ? null : Number(r.setup_ratio_pct),
  }))
}

// ---- MO / Job Roll-up ----
export async function getMoSummaryReport(range: ReportRange, mo?: string) {
  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('rpt_mo_summary', {
    p_from: range.from,
    p_to: range.to,
    p_mo: mo?.trim() || null,
  })
  if (error) throw new Error(`rpt_mo_summary: ${error.message}`)

  return ((data ?? []) as any[]).map(r => ({
    mo_number: r.mo_number as string,
    session_count: Number(r.session_count),
    machines: (r.machines ?? []) as string[],
    operators: (r.operators ?? []) as string[],
    setup_minutes: Number(r.setup_minutes),
    run_minutes: Number(r.run_minutes),
    unmanned_minutes: Number(r.unmanned_minutes),
    paused_minutes: Number(r.paused_minutes),
    break_minutes: Number(r.break_minutes),
    total_minutes: Number(r.total_minutes),
    first_start: r.first_start as string | null,
    last_activity: r.last_activity as string | null,
    qty_to_make: r.qty_to_make == null ? null : Number(r.qty_to_make),
    qty_made: r.qty_made == null ? null : Number(r.qty_made),
    qty_scrapped: r.qty_scrapped == null ? null : Number(r.qty_scrapped),
    minutes_per_part: r.minutes_per_part == null ? null : Number(r.minutes_per_part),
  }))
}

// ---- Raw interval export ----
// For anyone who wants the underlying facts in a spreadsheet rather than a
// pre-aggregated report. Paged, so it does not hit the 1,000-row cap.
export async function getSessionIntervals(range: ReportRange) {
  const supabase = createServiceClient()
  return fetchAllPages<Record<string, unknown>>(() =>
    supabase
      .from('v_session_intervals')
      .select('work_date, operator_name, operator_role, machine_code, mo_number, session_type, state, pause_reason, interval_start, interval_end, minutes')
      .gte('work_date', range.from)
      .lte('work_date', range.to)
      .order('interval_start', { ascending: true }),
  )
}

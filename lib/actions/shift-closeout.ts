'use server'

import { createServiceClient } from '@/lib/supabase/service'
import { firstShiftEndAtOrAfter } from '@/lib/tz'
import type { ActionResult } from '@/lib/types'

// ============================================================
// Shift closeout
// ------------------------------------------------------------
// Replaces the previous version in lib/actions/admin.ts, which closed
// EVERY session left ACTIVE, at a fixed 22:00 UTC, Monday to Friday. That
// had three problems:
//
//   1. Vercel cron runs in UTC, so "22:00" was actually 23:00 through the
//      BST half of the year.
//   2. It closed sessions regardless of which shift the operator was on,
//      so it landed on the night shift just as they were starting.
//   3. It never ran at weekends, so anything left ACTIVE on Friday sat
//      open until Monday night — blocking the machine and leaving a wildly
//      wrong ended_at behind.
//
// This version runs hourly and closes a session only once ITS OWN shift
// has ended, and stamps ended_at with the shift boundary rather than
// whenever the cron happened to fire.
// ============================================================

// How long after shift end before a still-ACTIVE session is closed. Long
// enough that a legitimate authorised overrun is never cut short.
const GRACE_MINUTES = 90

// Sessions whose operator has no shift assigned have no boundary to work
// from; close them after this long so they cannot block a machine forever.
const NO_SHIFT_MAX_HOURS = 16

export async function runShiftCloseout(): Promise<
  ActionResult<{ closed: number; skipped: number }>
> {
  const supabase = createServiceClient()
  const now = Date.now()

  // PAUSED sessions are a deliberate hold and must survive across days —
  // only ACTIVE ones are candidates. Kept unchanged from the original.
  const { data: sessions, error: fetchErr } = await supabase
    .from('sessions')
    .select('id, started_at, overrun_authorised_at, user:shopfloor_users!user_id(shift:shift_patterns(end_time))')
    .eq('status', 'ACTIVE')
    .order('started_at', { ascending: true })
    .range(0, 4999)

  if (fetchErr) return { ok: false, error: fetchErr.message }
  if (!sessions?.length) return { ok: true, data: { closed: 0, skipped: 0 } }

  type Due = { id: string; endedAt: string }
  const due: Due[] = []
  let skipped = 0

  for (const s of sessions) {
    const startedMs = new Date(s.started_at).getTime()
    const endTime = (s.user as any)?.shift?.end_time as string | undefined

    let boundaryMs: number
    if (endTime) {
      boundaryMs = firstShiftEndAtOrAfter(startedMs, endTime)
    } else {
      boundaryMs = startedMs + NO_SHIFT_MAX_HOURS * 3600_000
    }

    if (now < boundaryMs + GRACE_MINUTES * 60_000) {
      skipped += 1
      continue
    }

    // An authorised overrun means the operator confirmed they were still
    // there, so close at the confirmation-extended point rather than the
    // original boundary — but still close it, since the shift is long over.
    const endedAtMs = s.overrun_authorised_at
      ? Math.max(boundaryMs, new Date(s.overrun_authorised_at).getTime())
      : boundaryMs

    due.push({ id: s.id, endedAt: new Date(endedAtMs).toISOString() })
  }

  if (due.length === 0) return { ok: true, data: { closed: 0, skipped } }

  // ended_at differs per session, so update in batches by timestamp rather
  // than stamping them all with the moment the cron ran.
  const byTimestamp = new Map<string, string[]>()
  for (const d of due) {
    const list = byTimestamp.get(d.endedAt) ?? []
    list.push(d.id)
    byTimestamp.set(d.endedAt, list)
  }

  let closed = 0
  for (const [endedAt, ids] of byTimestamp) {
    const { error } = await supabase
      .from('sessions')
      .update({ status: 'AUTO_CLOSED', ended_at: endedAt, auto_closed: true })
      .in('id', ids)
      .eq('status', 'ACTIVE') // guard against a race with a live finish
    if (error) return { ok: false, error: error.message }
    closed += ids.length
  }

  await supabase.from('session_events').insert(
    due.map(d => ({
      session_id: d.id,
      event_type: 'SESSION_AUTO_CLOSE',
      metadata: {
        reason: 'shift_closeout',
        closed_at_shift_end: d.endedAt,
        cron_ran_at: new Date(now).toISOString(),
      },
    })),
  )

  return { ok: true, data: { closed, skipped } }
}

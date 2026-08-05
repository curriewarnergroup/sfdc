'use server'

import { createServiceClient } from '@/lib/supabase/service'
import { forceEndDeviceSession } from '@/lib/actions/device-auth'
import { firstShiftEndAtOrAfter } from '@/lib/tz'
import type { ActionResult } from '@/lib/types'

// Minutes past a user's shift end before we prompt "are you still here?".
const PROMPT_AFTER_MIN = 5
// Minutes the operator has to respond before being auto-logged out.
const RESPOND_WINDOW_MIN = 3
// Beyond this many minutes past shift end, a live session is treated as stale
// data (e.g. a job left running from a previous day) rather than someone
// actively working now. The live watcher ignores it so it cannot repeatedly
// auto-log-out the kiosk; reporting still clamps its hours at shift end.
const STALE_AFTER_MIN = 12 * 60

export type ShiftOverrunStatus = {
  sessionId: string
  operatorName: string
  machineCode: string
  // 'clear' = within shift, 'prompt' = past end +5m (show modal),
  // 'expired' = past end +8m with no confirmation (caller should auto-logout).
  state: 'clear' | 'prompt' | 'expired'
  // Seconds remaining before auto-logout, when state === 'prompt'.
  secondsToLogout: number
}

// Evaluate every live (ACTIVE/PAUSED) session on a device against its
// operator's shift. Only manned sessions with a shift and no overrun
// authorisation can enter the prompt/expired states.
export async function getShiftOverrunStatus(
  deviceId: string,
): Promise<ShiftOverrunStatus[]> {
  const supabase = createServiceClient()
  const now = Date.now()

  // Only ACTIVE sessions represent someone working at the machine right now.
  // A PAUSED job means the operator has stepped away / signed off that job, so
  // there is nothing to prompt about — and stale paused jobs must never trigger
  // an auto-logout.
  const { data: sessions } = await supabase
    .from('sessions')
    .select(
      'id, session_type, status, started_at, overrun_authorised_at, machine:machines(machine_code), user:shopfloor_users!user_id(display_name, shift:shift_patterns(end_time))',
    )
    .eq('device_id', deviceId)
    .eq('status', 'ACTIVE')

  if (!sessions?.length) return []

  // Legacy authorisations were recorded as a SESSION_RESUME carrying
  // metadata.overrun_authorised. New ones use sessions.overrun_authorised_at.
  // Honour both so nothing recorded before the column existed is re-prompted.
  const ids = sessions.map((s) => s.id)
  const { data: authEvents } = await supabase
    .from('session_events')
    .select('session_id, metadata')
    .in('session_id', ids)
    .eq('event_type', 'SESSION_RESUME')
  const authorised = new Set(
    (authEvents ?? [])
      .filter((e) => (e.metadata as any)?.overrun_authorised)
      .map((e) => e.session_id),
  )

  const out: ShiftOverrunStatus[] = []
  for (const s of sessions) {
    // Unmanned runs have no operator on the clock — never prompt.
    if (s.session_type === 'UNMANNED') continue
    const endTime = (s.user as any)?.shift?.end_time as string | undefined
    if (!endTime) continue // no shift assigned → never prompt or clamp
    if (s.overrun_authorised_at) continue // confirmed (column)
    if (authorised.has(s.id)) continue // confirmed (legacy marker event)

    // Anchor to the end of the shift THIS session belongs to (based on when the
    // work started), not "today" — otherwise overnight or older sessions get a
    // bogus, huge overrun.
    const shiftEnd = firstShiftEndAtOrAfter(new Date(s.started_at).getTime(), endTime)
    const minsPast = (now - shiftEnd) / 60000
    if (minsPast < PROMPT_AFTER_MIN) continue
    if (minsPast > STALE_AFTER_MIN) continue // stale leftover session, ignore live

    const logoutAtMs = shiftEnd + (PROMPT_AFTER_MIN + RESPOND_WINDOW_MIN) * 60000
    const state: ShiftOverrunStatus['state'] = now >= logoutAtMs ? 'expired' : 'prompt'
    out.push({
      sessionId: s.id,
      operatorName: (s.user as any)?.display_name ?? 'Operator',
      machineCode: (s.machine as any)?.machine_code ?? '',
      state,
      secondsToLogout: Math.max(0, Math.round((logoutAtMs - now) / 1000)),
    })
  }
  return out
}

// Operator confirms (via PIN) they are still at the machine. Records an
// overrun authorisation so the rest of this session counts as worked time and
// no further prompts fire. Only the operator on the job may confirm.
//
// This now writes sessions.overrun_authorised_at. Previously it was stored
// only as a SESSION_RESUME event with metadata.overrun_authorised — a fake
// resume that the timing engine had to remember to filter out of the
// pause/resume replay, and which corrupted the timeline if ever missed. The
// event is still written, but purely as an audit record.
export async function authoriseShiftOverrun(params: {
  sessionId: string
  operatorCode: string
  deviceId: string
}): Promise<ActionResult> {
  const supabase = createServiceClient()

  const { data: user } = await supabase
    .from('shopfloor_users')
    .select('id, display_name')
    .eq('user_code', params.operatorCode.trim())
    .eq('is_active', true)
    .maybeSingle()
  if (!user) return { ok: false, error: 'User code not found.' }

  // The confirming PIN must belong to the operator currently on the job.
  const { data: session } = await supabase
    .from('sessions')
    .select('id, user_id')
    .eq('id', params.sessionId)
    .maybeSingle()
  if (!session) return { ok: false, error: 'Session not found.' }
  if (session.user_id !== user.id) {
    return { ok: false, error: 'Only the operator on this job can confirm.' }
  }

  const { error } = await supabase
    .from('sessions')
    .update({
      overrun_authorised_at: new Date().toISOString(),
      overrun_authorised_by: user.id,
    })
    .eq('id', params.sessionId)
    .is('overrun_authorised_at', null)

  if (error) return { ok: false, error: 'Could not record the confirmation.' }

  await supabase.from('session_events').insert({
    session_id: params.sessionId,
    // Audit trail only — no longer load-bearing for timing.
    event_type: 'SESSION_RESUME',
    actor_user_id: user.id,
    device_id: params.deviceId,
    metadata: { overrun_authorised: true, confirmed_by: user.display_name },
  })

  return { ok: true }
}

// No response within the window: sign the operator off the job (it stays
// PAUSED and available for the next person, exactly like a normal sign-off)
// and log the device out. Because no overrun was authorised, the reporting
// timing engine already clamps the trailing post-shift time out of worked hours.
export async function autoLogoutShiftOverrun(params: {
  sessionId: string
  deviceId: string
}): Promise<ActionResult> {
  const supabase = createServiceClient()

  const { data: session } = await supabase
    .from('sessions')
    .select('id, user_id, status')
    .eq('id', params.sessionId)
    .maybeSingle()
  if (!session) return { ok: false, error: 'Session not found.' }

  // Keep the job live (PAUSED) so it is not lost — only the operator is signed off.
  if (session.status === 'ACTIVE') {
    await supabase
      .from('sessions')
      .update({ status: 'PAUSED' })
      .eq('id', params.sessionId)
      .eq('status', 'ACTIVE')

    await supabase.from('session_events').insert({
      session_id: params.sessionId,
      event_type: 'SESSION_PAUSE',
      actor_user_id: session.user_id,
      device_id: params.deviceId,
      metadata: { auto_logout: true, reason: 'shift_overrun_no_response' },
    })
  }

  // End the kiosk device session so the login screen returns.
  await forceEndDeviceSession(params.deviceId)

  return { ok: true }
}

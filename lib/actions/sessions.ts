'use server'

import { createServiceClient } from '@/lib/supabase/service'
import type { ActionResult, Session, SessionEvent, ShopfloorUser } from '@/lib/types'

// ---- Lookup helpers ----

export async function lookupUserByCode(userCode: string): Promise<ShopfloorUser | null> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('shopfloor_users')
    .select('*')
    .eq('user_code', userCode.trim())
    .eq('is_active', true)
    .single()
  return data ?? null
}

export async function getActiveMachines() {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('machines')
    .select('*')
    .eq('is_active', true)
    .order('machine_code')
  return data ?? []
}

export async function getPauseReasons() {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('pause_reasons')
    .select('*')
    .eq('is_active', true)
    .order('label')
  return data ?? []
}

export async function getActiveSessionForDevice(deviceId: string): Promise<Session | null> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('sessions')
    .select('*, machine:machines(*), user:shopfloor_users!user_id(*), device:devices(*)')
    .eq('device_id', deviceId)
    .in('status', ['ACTIVE', 'PAUSED'])
    .limit(1)
    .maybeSingle()
  return data ?? null
}

export async function getAllActiveSessionsForDevice(deviceId: string): Promise<Session[]> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('sessions')
    .select('*, machine:machines(*), user:shopfloor_users!user_id(*), device:devices(*)')
    .eq('device_id', deviceId)
    .in('status', ['ACTIVE', 'PAUSED'])
    .order('started_at', { ascending: false })
  return (data ?? []) as Session[]
}

export async function getRecentEventsForSession(sessionId: string): Promise<SessionEvent[]> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('session_events')
    .select('*, pause_reason:pause_reasons(*), actor_user:shopfloor_users(*)')
    .eq('session_id', sessionId)
    .order('occurred_at', { ascending: false })
    .limit(20)
  return data ?? []
}

// ---- Session state machine ----

export async function startSession(params: {
  deviceId: string
  userCode: string
  machineId: string
  moNumber: string
  sessionType: 'SETUP' | 'RUN'
  // Optional SUPERVISOR/ADMIN code that bypasses the First-Off requirement.
  supervisorOverrideCode?: string
}): Promise<ActionResult<{ session: Session }>> {
  const supabase = createServiceClient()

  // Resolve user
  const user = await lookupUserByCode(params.userCode)
  if (!user) return { ok: false, error: 'User code not found.' }

  // Note: operators are allowed to run multiple sessions across different machines.
  // We do NOT block on existing user sessions — only machine occupancy is enforced.

  // Check machine is active
  const { data: machine } = await supabase
    .from('machines')
    .select('is_active, machine_code')
    .eq('id', params.machineId)
    .single()

  if (!machine?.is_active) {
    return { ok: false, error: `Machine ${machine?.machine_code ?? ''} is inactive and cannot be used.` }
  }

  // Check machine not already occupied
  const { data: machineSession } = await supabase
    .from('sessions')
    .select('id, mo_number')
    .eq('machine_id', params.machineId)
    .in('status', ['ACTIVE', 'PAUSED'])
    .single()

  if (machineSession) {
    return {
      ok: false,
      error: `Machine already has an active session on MO ${machineSession.mo_number}.`,
    }
  }

  // For RUN sessions, check FIRST_OFF is approved
  let firstOffOverrideBy: ShopfloorUser | null = null
  if (params.sessionType === 'RUN') {
    const { data: setupSession } = await supabase
      .from('sessions')
      .select('first_off_approved')
      .eq('machine_id', params.machineId)
      .eq('mo_number', params.moNumber)
      .eq('session_type', 'SETUP')
      .eq('status', 'FINISHED')
      .order('ended_at', { ascending: false })
      .limit(1)
      .single()

    if (!setupSession?.first_off_approved) {
      // Allow a SUPERVISOR/ADMIN to override the missing First-Off.
      if (params.supervisorOverrideCode?.trim()) {
        const supervisor = await lookupUserByCode(params.supervisorOverrideCode)
        if (!supervisor) return { ok: false, error: 'Supervisor code not found.' }
        if (supervisor.role !== 'SUPERVISOR' && supervisor.role !== 'ADMIN') {
          return { ok: false, error: 'Only a SUPERVISOR or ADMIN can override the First-Off.' }
        }
        firstOffOverrideBy = supervisor
      } else {
        return {
          ok: false,
          error: 'First-off approval required before starting a Run session.',
        }
      }
    }
  }

  // Insert session
  const { data: session, error: insertErr } = await supabase
    .from('sessions')
    .insert({
      session_type: params.sessionType,
      status: 'ACTIVE',
      mo_number: params.moNumber.trim().toUpperCase(),
      machine_id: params.machineId,
      user_id: user.id,
      device_id: params.deviceId,
      ...(firstOffOverrideBy ? { authorised_by: firstOffOverrideBy.id } : {}),
    })
    .select('*, machine:machines(*), user:shopfloor_users!user_id(*), device:devices(*)')
    .single()

  if (insertErr || !session) {
    return { ok: false, error: insertErr?.message ?? 'Failed to start session.' }
  }

  // Log event
  await supabase.from('session_events').insert({
    session_id: session.id,
    event_type: 'SESSION_START',
    actor_user_id: user.id,
    device_id: params.deviceId,
    metadata: {
      session_type: params.sessionType,
      mo_number: params.moNumber,
      ...(firstOffOverrideBy
        ? { first_off_override: true, override_by: firstOffOverrideBy.display_name }
        : {}),
    },
  })

  return { ok: true, data: { session } }
}

// ---- Unmanned Run ----

export async function authoriseUnmannedRun(params: {
  deviceId: string
  supervisorCode: string
  machineId: string
  moNumber: string
}): Promise<ActionResult<{ session: Session }>> {
  const supabase = createServiceClient()

  // Verify supervisor exists and has SUPERVISOR or ADMIN role
  const supervisor = await lookupUserByCode(params.supervisorCode)
  if (!supervisor) return { ok: false, error: 'Supervisor code not found.' }
  if (supervisor.role !== 'SUPERVISOR' && supervisor.role !== 'ADMIN') {
    return { ok: false, error: 'Only a SUPERVISOR or ADMIN can authorise an unmanned run.' }
  }

  // Check machine is active
  const { data: unmannedMachine } = await supabase
    .from('machines')
    .select('is_active, machine_code')
    .eq('id', params.machineId)
    .single()

  if (!unmannedMachine?.is_active) {
    return { ok: false, error: `Machine ${unmannedMachine?.machine_code ?? ''} is inactive and cannot be used.` }
  }

  // Check if machine already has an active session — if so, convert it to UNMANNED (state change, not new session)
  const { data: existing } = await supabase
    .from('sessions')
    .select('id, mo_number, session_type')
    .eq('machine_id', params.machineId)
    .in('status', ['ACTIVE', 'PAUSED'])
    .maybeSingle()

  let session: any

  if (existing) {
    // State change: existing manned run → unmanned
    const { data: updated, error: updateErr } = await supabase
      .from('sessions')
      .update({
        session_type: 'UNMANNED',
        authorised_by: supervisor.id,
        status: 'ACTIVE', // ensure it's active (un-pause if paused)
      })
      .eq('id', existing.id)
      .select('*, machine:machines(*), user:shopfloor_users!user_id(*), device:devices(*)')
      .single()

    if (updateErr || !updated) {
      return { ok: false, error: updateErr?.message ?? 'Failed to convert session to unmanned.' }
    }
    session = updated

    await supabase.from('session_events').insert({
      session_id: session.id,
      event_type: 'SESSION_START',
      actor_user_id: supervisor.id,
      device_id: params.deviceId,
      metadata: { session_type: 'UNMANNED', mo_number: existing.mo_number, authorised_by: supervisor.display_name, converted_from: existing.session_type },
    })
  } else {
    // No existing session — create a fresh unmanned session
    const moNumber = params.moNumber.trim().toUpperCase()
    const { data: inserted, error: insertErr } = await supabase
      .from('sessions')
      .insert({
        session_type: 'UNMANNED',
        status: 'ACTIVE',
        mo_number: moNumber,
        machine_id: params.machineId,
        user_id: supervisor.id,
        device_id: params.deviceId,
        authorised_by: supervisor.id,
      })
      .select('*, machine:machines(*), user:shopfloor_users!user_id(*), device:devices(*)')
      .single()

    if (insertErr || !inserted) {
      return { ok: false, error: insertErr?.message ?? 'Failed to start unmanned session.' }
    }
    session = inserted

    await supabase.from('session_events').insert({
      session_id: session.id,
      event_type: 'SESSION_START',
      actor_user_id: supervisor.id,
      device_id: params.deviceId,
      metadata: { session_type: 'UNMANNED', mo_number: moNumber, authorised_by: supervisor.display_name },
    })
  }

  return { ok: true, data: { session } }
}

export async function convertToMannedRun(params: {
  sessionId: string
  actorUserCode: string
  deviceId: string
}): Promise<ActionResult> {
  const supabase = createServiceClient()

  const actor = await lookupUserByCode(params.actorUserCode)
  if (!actor) return { ok: false, error: 'User code not found.' }

  const { error } = await supabase
    .from('sessions')
    .update({ session_type: 'RUN', authorised_by: null })
    .eq('id', params.sessionId)

  if (error) return { ok: false, error: error.message }

  await supabase.from('session_events').insert({
    session_id: params.sessionId,
    event_type: 'SESSION_START',
    actor_user_id: actor.id,
    device_id: params.deviceId,
    metadata: { converted_to: 'RUN' },
  })

  return { ok: true }
}

export async function pauseSession(params: {
  sessionId: string
  actorUserCode: string
  pauseReasonId: string
  deviceId: string
}): Promise<ActionResult> {
  const supabase = createServiceClient()

  const user = await lookupUserByCode(params.actorUserCode)
  if (!user) return { ok: false, error: 'User code not found.' }

  const { error } = await supabase
    .from('sessions')
    .update({ status: 'PAUSED' })
    .eq('id', params.sessionId)
    .eq('status', 'ACTIVE')

  if (error) return { ok: false, error: 'Could not pause session.' }

  await supabase.from('session_events').insert({
    session_id: params.sessionId,
    event_type: 'SESSION_PAUSE',
    actor_user_id: user.id,
    device_id: params.deviceId,
    pause_reason_id: params.pauseReasonId,
    metadata: {},
  })

  return { ok: true }
}

// Sign the current operator off a live job WITHOUT closing it. The job stays
// PAUSED and available on this machine so the next operator can sign on and
// take over (used for operator/setter shift swaps). No pause reason required.
export async function signOffJob(params: {
  sessionId: string
  actorUserCode: string
  deviceId: string
}): Promise<ActionResult> {
  const supabase = createServiceClient()

  const user = await lookupUserByCode(params.actorUserCode)
  if (!user) return { ok: false, error: 'User code not found.' }

  const { error } = await supabase
    .from('sessions')
    .update({ status: 'PAUSED' })
    .eq('id', params.sessionId)
    .in('status', ['ACTIVE', 'PAUSED'])

  if (error) return { ok: false, error: 'Could not sign off the job.' }

  await supabase.from('session_events').insert({
    session_id: params.sessionId,
    event_type: 'SESSION_PAUSE',
    actor_user_id: user.id,
    device_id: params.deviceId,
    metadata: { handover: true, signed_off_by: user.display_name },
  })

  return { ok: true }
}

export async function resumeSession(params: {
  sessionId: string
  actorUserCode: string
  deviceId: string
  // When true, the resuming user takes over the job (user_id is reassigned).
  // Used for the kiosk "Start Back Up / Sign On" panel so time is attributed
  // to whoever is actually running the machine now.
  reassignOperator?: boolean
}): Promise<ActionResult> {
  const supabase = createServiceClient()

  const user = await lookupUserByCode(params.actorUserCode)
  if (!user) return { ok: false, error: 'User code not found.' }

  const updates: Record<string, unknown> = { status: 'ACTIVE' }
  if (params.reassignOperator) updates.user_id = user.id

  const { error } = await supabase
    .from('sessions')
    .update(updates)
    .eq('id', params.sessionId)
    .eq('status', 'PAUSED')

  if (error) {
    // Unique index blocks a user from holding two live sessions at once.
    if (error.code === '23505') {
      return { ok: false, error: 'You already have another active job. Finish it before signing on here.' }
    }
    return { ok: false, error: 'Could not resume session.' }
  }

  await supabase.from('session_events').insert({
    session_id: params.sessionId,
    event_type: 'SESSION_RESUME',
    actor_user_id: user.id,
    device_id: params.deviceId,
    metadata: params.reassignOperator ? { signed_on_by: user.display_name } : {},
  })

  return { ok: true }
}

// Supervisor-authenticated pause for UNMANNED sessions (kiosk-side)
export async function supervisorPauseUnmannedSession(params: {
  sessionId: string
  supervisorCode: string
  pauseReasonId: string
  deviceId: string
}): Promise<ActionResult> {
  const supabase = createServiceClient()

  const supervisor = await lookupUserByCode(params.supervisorCode)
  if (!supervisor) return { ok: false, error: 'Supervisor code not found.' }
  if (supervisor.role !== 'SUPERVISOR' && supervisor.role !== 'ADMIN') {
    return { ok: false, error: 'Only a SUPERVISOR or ADMIN can pause an unmanned run.' }
  }

  const { error } = await supabase
    .from('sessions')
    .update({ status: 'PAUSED' })
    .eq('id', params.sessionId)
    .eq('status', 'ACTIVE')

  if (error) return { ok: false, error: 'Could not pause session.' }

  await supabase.from('session_events').insert({
    session_id: params.sessionId,
    event_type: 'SESSION_PAUSE',
    actor_user_id: supervisor.id,
    device_id: params.deviceId,
    pause_reason_id: params.pauseReasonId,
    metadata: { supervisor_override: true },
  })

  return { ok: true }
}

// Supervisor-authenticated resume for UNMANNED sessions (kiosk-side)
export async function supervisorResumeUnmannedSession(params: {
  sessionId: string
  supervisorCode: string
  deviceId: string
}): Promise<ActionResult> {
  const supabase = createServiceClient()

  const supervisor = await lookupUserByCode(params.supervisorCode)
  if (!supervisor) return { ok: false, error: 'Supervisor code not found.' }
  if (supervisor.role !== 'SUPERVISOR' && supervisor.role !== 'ADMIN') {
    return { ok: false, error: 'Only a SUPERVISOR or ADMIN can resume an unmanned run.' }
  }

  const { error } = await supabase
    .from('sessions')
    .update({ status: 'ACTIVE' })
    .eq('id', params.sessionId)
    .eq('status', 'PAUSED')

  if (error) return { ok: false, error: 'Could not resume session.' }

  await supabase.from('session_events').insert({
    session_id: params.sessionId,
    event_type: 'SESSION_RESUME',
    actor_user_id: supervisor.id,
    device_id: params.deviceId,
    metadata: { supervisor_override: true },
  })

  return { ok: true }
}

// Admin-side pause (no code required — admin is already authenticated)
export async function adminPauseSession(params: {
  sessionId: string
  pauseReasonId: string
}): Promise<ActionResult> {
  const supabase = createServiceClient()

  const { error } = await supabase
    .from('sessions')
    .update({ status: 'PAUSED' })
    .eq('id', params.sessionId)
    .eq('status', 'ACTIVE')

  if (error) return { ok: false, error: 'Could not pause session.' }

  await supabase.from('session_events').insert({
    session_id: params.sessionId,
    event_type: 'SESSION_PAUSE',
    metadata: { admin_override: true, pause_reason_id: params.pauseReasonId },
  })

  return { ok: true }
}

// Admin-side resume (no code required)
export async function adminResumeSession(params: {
  sessionId: string
}): Promise<ActionResult> {
  const supabase = createServiceClient()

  const { error } = await supabase
    .from('sessions')
    .update({ status: 'ACTIVE' })
    .eq('id', params.sessionId)
    .eq('status', 'PAUSED')

  if (error) return { ok: false, error: 'Could not resume session.' }

  await supabase.from('session_events').insert({
    session_id: params.sessionId,
    event_type: 'SESSION_RESUME',
    metadata: { admin_override: true },
  })

  return { ok: true }
}

export async function finishSession(params: {
  sessionId: string
  actorUserCode: string
  deviceId: string
  notes?: string
}): Promise<ActionResult> {
  const supabase = createServiceClient()

  const user = await lookupUserByCode(params.actorUserCode)
  if (!user) return { ok: false, error: 'User code not found.' }

  // Check for pending (unredeemed) QC code if this is a RUN session
  const { data: sess } = await supabase
    .from('sessions')
    .select('session_type, mo_number, machine_id')
    .eq('id', params.sessionId)
    .single()

  if (sess?.session_type === 'RUN') {
    const { data: pendingCode } = await supabase
      .from('qc_codes')
      .select('id')
      .eq('mo_number', sess.mo_number)
      .eq('machine_id', sess.machine_id)
      .eq('code_type', 'LAST_OFF')
      .eq('redeemed', false)
      .gt('expires_at', new Date().toISOString())
      .single()

    if (pendingCode) {
      return { ok: false, error: 'A Last-Off QC code must be redeemed before finishing.' }
    }
  }

  const { error } = await supabase
    .from('sessions')
    .update({
      status: 'FINISHED',
      ended_at: new Date().toISOString(),
      notes: params.notes ?? null,
    })
    .eq('id', params.sessionId)
    .in('status', ['ACTIVE', 'PAUSED'])

  if (error) return { ok: false, error: 'Could not finish session.' }

  await supabase.from('session_events').insert({
    session_id: params.sessionId,
    event_type: 'SESSION_FINISH',
    actor_user_id: user.id,
    device_id: params.deviceId,
    metadata: { notes: params.notes ?? '' },
  })

  return { ok: true }
}

// ---- QC Code redemption on kiosk ----

export async function redeemQcCode(params: {
  plainCode: string
  sessionId: string
  actorUserCode: string
  deviceId: string
}): Promise<ActionResult<{ result: 'PASS' | 'FAIL'; codeType: string }>> {
  const supabase = createServiceClient()
  const crypto = await import('crypto')

  const codeHash = crypto.createHash('sha256').update(params.plainCode.trim()).digest('hex')

  const { data: qcCode } = await supabase
    .from('qc_codes')
    .select('*')
    .eq('code_hash', codeHash)
    .eq('redeemed', false)
    .gt('expires_at', new Date().toISOString())
    .single()

  const user = await lookupUserByCode(params.actorUserCode)

  if (!qcCode) {
    await supabase.from('session_events').insert({
      session_id: params.sessionId,
      event_type: 'QC_CODE_REDEEMED_FAILED',
      actor_user_id: user?.id ?? null,
      device_id: params.deviceId,
      metadata: { reason: 'invalid_or_expired' },
    })
    return { ok: false, error: 'QC code not found, already used, or expired.' }
  }

  // Mark as redeemed
  await supabase
    .from('qc_codes')
    .update({
      redeemed: true,
      redeemed_at: new Date().toISOString(),
      redeemed_by: user?.id ?? null,
    })
    .eq('id', qcCode.id)

  // If FIRST_OFF PASS, approve the setup session
  if (qcCode.code_type === 'FIRST_OFF' && qcCode.result === 'PASS') {
    await supabase
      .from('sessions')
      .update({ first_off_approved: true })
      .eq('id', params.sessionId)
  }

  await supabase.from('session_events').insert({
    session_id: params.sessionId,
    event_type: 'QC_CODE_REDEEMED',
    actor_user_id: user?.id ?? null,
    device_id: params.deviceId,
    metadata: { code_type: qcCode.code_type, result: qcCode.result },
  })

  return { ok: true, data: { result: qcCode.result, codeType: qcCode.code_type } }
}

// ---- Setup session list for manage page ----

export async function getSetupSessionsForStation(params: {
  deviceId: string
  allStations: boolean
}) {
  const supabase = createServiceClient()
  let query = supabase
    .from('sessions')
    .select('*, machine:machines(*), user:shopfloor_users!user_id(*), device:devices(*)')
    .eq('session_type', 'SETUP')
    .in('status', ['ACTIVE', 'PAUSED'])
    .order('started_at', { ascending: false })

  if (!params.allStations) {
    query = query.eq('device_id', params.deviceId)
  }

  const { data } = await query
  return (data ?? []) as Session[]
}

export async function recordTakeoverEvent(params: {
  sessionId: string
  actorUserCode: string
  deviceId: string
  confirmed: boolean
  originalUserId: string
}): Promise<ActionResult> {
  const supabase = createServiceClient()
  const actor = await lookupUserByCode(params.actorUserCode)
  await supabase.from('session_events').insert({
    session_id: params.sessionId,
    event_type: 'SESSION_START', // reuse closest semantic event; metadata carries intent
    actor_user_id: actor?.id ?? null,
    device_id: params.deviceId,
    metadata: {
      takeover: true,
      confirmed: params.confirmed,
      original_user_id: params.originalUserId,
    },
  })
  return { ok: true }
}

export async function finishSetupSession(params: {
  sessionId: string
  actorUserCode: string
  deviceId: string
  qcCode: string
}): Promise<ActionResult> {
  const supabase = createServiceClient()
  const cryptoMod = await import('crypto')

  const user = await lookupUserByCode(params.actorUserCode)
  if (!user) return { ok: false, error: 'User code not found.' }

  // Validate the QC code
  const codeHash = cryptoMod.createHash('sha256').update(params.qcCode.trim()).digest('hex')
  const { data: qcCode } = await supabase
    .from('qc_codes')
    .select('*')
    .eq('code_hash', codeHash)
    .eq('redeemed', false)
    .eq('code_type', 'FIRST_OFF')
    .gt('expires_at', new Date().toISOString())
    .single()

  if (!qcCode) {
    // Log failed attempt
    await supabase.from('session_events').insert({
      session_id: params.sessionId,
      event_type: 'QC_CODE_REDEEMED_FAILED',
      actor_user_id: user.id,
      device_id: params.deviceId,
      metadata: { reason: 'invalid_or_expired', code_type: 'FIRST_OFF' },
    })
    return { ok: false, error: 'QC code invalid, expired, or already used.' }
  }

  // Fetch session to validate MO + machine match
  const { data: sess } = await supabase
    .from('sessions')
    .select('mo_number, machine_id')
    .eq('id', params.sessionId)
    .single()

  if (!sess) return { ok: false, error: 'Session not found.' }

  if (
    qcCode.mo_number !== sess.mo_number ||
    qcCode.machine_id !== sess.machine_id
  ) {
    await supabase.from('session_events').insert({
      session_id: params.sessionId,
      event_type: 'QC_CODE_REDEEMED_FAILED',
      actor_user_id: user.id,
      device_id: params.deviceId,
      metadata: { reason: 'mo_machine_mismatch', code_type: 'FIRST_OFF' },
    })
    return {
      ok: false,
      error: 'QC code does not match this job. Check MO number and machine.',
    }
  }

  // Mark code used
  await supabase
    .from('qc_codes')
    .update({ redeemed: true, redeemed_at: new Date().toISOString(), redeemed_by: user.id })
    .eq('id', qcCode.id)

  // Finish the session + approve first-off
  const { error: updateErr } = await supabase
    .from('sessions')
    .update({
      status: 'FINISHED',
      ended_at: new Date().toISOString(),
      first_off_approved: qcCode.result === 'PASS',
    })
    .eq('id', params.sessionId)
    .in('status', ['ACTIVE', 'PAUSED'])

  if (updateErr) return { ok: false, error: 'Could not finish session.' }

  // Log events
  await supabase.from('session_events').insert([
    {
      session_id: params.sessionId,
      event_type: 'QC_CODE_REDEEMED',
      actor_user_id: user.id,
      device_id: params.deviceId,
      metadata: { code_type: 'FIRST_OFF', result: qcCode.result },
    },
    {
      session_id: params.sessionId,
      event_type: 'SESSION_FINISH',
      actor_user_id: user.id,
      device_id: params.deviceId,
      metadata: { first_off_approved: qcCode.result === 'PASS' },
    },
  ])

  return { ok: true }
}

// Cancel a SETUP session without a First-Off QC code.
// Requires a SUPERVISOR or ADMIN badge code — abandons the setup so a fresh
// one can be started. Marks the session CANCELLED and logs who authorised it.
export async function cancelSetupSession(params: {
  sessionId: string
  supervisorCode: string
  deviceId: string
  reason?: string
}): Promise<ActionResult> {
  const supabase = createServiceClient()

  const supervisor = await lookupUserByCode(params.supervisorCode)
  if (!supervisor) return { ok: false, error: 'Supervisor code not found.' }
  if (supervisor.role !== 'SUPERVISOR' && supervisor.role !== 'ADMIN') {
    return { ok: false, error: 'Only a SUPERVISOR or ADMIN can cancel a setup.' }
  }

  // AUTO_CLOSED removes the row from the "one active per machine" unique index
  // so a fresh setup can be started immediately. The metadata flag lets
  // reporting tell a supervisor cancellation apart from a timed auto-close.
  const { error } = await supabase
    .from('sessions')
    .update({ status: 'AUTO_CLOSED', ended_at: new Date().toISOString() })
    .eq('id', params.sessionId)
    .eq('session_type', 'SETUP')
    .in('status', ['ACTIVE', 'PAUSED'])

  if (error) return { ok: false, error: 'Could not cancel setup.' }

  await supabase.from('session_events').insert({
    session_id: params.sessionId,
    event_type: 'SESSION_AUTO_CLOSE',
    actor_user_id: supervisor.id,
    device_id: params.deviceId,
    metadata: { cancelled_setup: true, supervisor_override: true, reason: params.reason ?? null },
  })

  return { ok: true }
}

// ---- Run session list for manage page ----

export async function getRunSessionsForStation(params: {
  deviceId: string
  allStations: boolean
}) {
  const supabase = createServiceClient()
  let query = supabase
    .from('sessions')
    .select('*, machine:machines(*), user:shopfloor_users!user_id(*), device:devices(*)')
    .in('session_type', ['RUN', 'UNMANNED'])
    .in('status', ['ACTIVE', 'PAUSED'])
    .order('started_at', { ascending: false })

  if (!params.allStations) {
    query = query.eq('device_id', params.deviceId)
  }

  const { data } = await query
  return (data ?? []) as Session[]
}

export async function finishRunSession(params: {
  sessionId: string
  actorUserCode: string
  deviceId: string
  qcCode: string
}): Promise<ActionResult> {
  const supabase = createServiceClient()
  const cryptoMod = await import('crypto')

  const user = await lookupUserByCode(params.actorUserCode)
  if (!user) return { ok: false, error: 'User code not found.' }

  // Validate the LAST_OFF code
  const codeHash = cryptoMod.createHash('sha256').update(params.qcCode.trim()).digest('hex')
  const { data: qcCode } = await supabase
    .from('qc_codes')
    .select('*')
    .eq('code_hash', codeHash)
    .eq('redeemed', false)
    .eq('code_type', 'LAST_OFF')
    .gt('expires_at', new Date().toISOString())
    .single()

  if (!qcCode) {
    await supabase.from('session_events').insert({
      session_id: params.sessionId,
      event_type: 'QC_CODE_REDEEMED_FAILED',
      actor_user_id: user.id,
      device_id: params.deviceId,
      metadata: { reason: 'invalid_or_expired', code_type: 'LAST_OFF' },
    })
    return { ok: false, error: 'Last-Off QC code invalid, expired, or already used.' }
  }

  // Validate MO + machine match against the session
  const { data: sess } = await supabase
    .from('sessions')
    .select('mo_number, machine_id')
    .eq('id', params.sessionId)
    .single()

  if (!sess) return { ok: false, error: 'Session not found.' }

  if (qcCode.mo_number !== sess.mo_number || qcCode.machine_id !== sess.machine_id) {
    await supabase.from('session_events').insert({
      session_id: params.sessionId,
      event_type: 'QC_CODE_REDEEMED_FAILED',
      actor_user_id: user.id,
      device_id: params.deviceId,
      metadata: { reason: 'mo_machine_mismatch', code_type: 'LAST_OFF' },
    })
    return {
      ok: false,
      error: 'Last-Off code does not match this job. Check MO number and machine.',
    }
  }

  // Mark code redeemed
  await supabase
    .from('qc_codes')
    .update({ redeemed: true, redeemed_at: new Date().toISOString(), redeemed_by: user.id })
    .eq('id', qcCode.id)

  // Finish the session
  const { error: updateErr } = await supabase
    .from('sessions')
    .update({ status: 'FINISHED', ended_at: new Date().toISOString() })
    .eq('id', params.sessionId)
    .in('status', ['ACTIVE', 'PAUSED'])

  if (updateErr) return { ok: false, error: 'Could not finish session.' }

  // Log events
  await supabase.from('session_events').insert([
    {
      session_id: params.sessionId,
      event_type: 'QC_CODE_REDEEMED',
      actor_user_id: user.id,
      device_id: params.deviceId,
      metadata: { code_type: 'LAST_OFF', result: qcCode.result },
    },
    {
      session_id: params.sessionId,
      event_type: 'SESSION_FINISH',
      actor_user_id: user.id,
      device_id: params.deviceId,
      metadata: { last_off_result: qcCode.result },
    },
  ])

  return { ok: true }
}

// ---- Pending QC code check ----

export async function getPendingQcCode(moNumber: string, machineId: string) {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('qc_codes')
    .select('*, machine:machines(*), issuer:shopfloor_users!issued_by(*)')
    .eq('mo_number', moNumber)
    .eq('machine_id', machineId)
    .eq('redeemed', false)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  return data ?? null
}

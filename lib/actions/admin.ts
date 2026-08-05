'use server'

import { createServiceClient } from '@/lib/supabase/service'
import type { ActionResult, Session, ShopfloorUser, Machine, ShiftPattern, PauseReason } from '@/lib/types'

// ---- Sessions ----

export async function getAllSessions(params?: {
  status?: string
  from?: string
  to?: string
  limit?: number
  machineId?: string
  mo?: string
  userId?: string
}) {
  const supabase = createServiceClient()
  let query = supabase
    .from('sessions')
    .select('*, machine:machines(*), user:shopfloor_users!user_id(*), device:devices(*), authoriser:shopfloor_users!authorised_by(*)')
    .order('started_at', { ascending: false })
    .limit(params?.limit ?? 100)

  if (params?.status && params.status !== 'ALL') query = query.eq('status', params.status)
  if (params?.from)      query = query.gte('started_at', params.from)
  if (params?.to)        query = query.lte('started_at', params.to + 'T23:59:59')
  if (params?.machineId) query = query.eq('machine_id', params.machineId)
  if (params?.mo)        query = query.ilike('mo_number', `%${params.mo}%`)
  if (params?.userId)    query = query.eq('user_id', params.userId)

  const { data } = await query
  return data ?? []
}

// ---- Machine Stoppages ----
// Returns all SESSION_PAUSE events for a given machine's sessions,
// paired with the following SESSION_RESUME (or session end) to calculate duration.
export async function getMachineStoppages(machineId: string) {
  const supabase = createServiceClient()

  // Get all session IDs for this machine
  const { data: sessionRows } = await supabase
    .from('sessions')
    .select('id, mo_number, ended_at, user_id')
    .eq('machine_id', machineId)
    .limit(200)

  if (!sessionRows || sessionRows.length === 0) return []

  const sessionIds = sessionRows.map(s => s.id)
  const sessionMap = new Map(sessionRows.map(s => [s.id, s]))

  // Get all PAUSE and RESUME events for those sessions, ordered ascending so we can pair them
  const { data: events } = await supabase
    .from('session_events')
    .select('id, session_id, event_type, occurred_at, actor_user_id, pause_reason_id')
    .in('session_id', sessionIds)
    .in('event_type', ['SESSION_PAUSE', 'SESSION_RESUME'])
    .order('occurred_at', { ascending: true })

  if (!events || events.length === 0) return []

  // Fetch pause reason labels
  const { data: pauseReasons } = await supabase
    .from('pause_reasons')
    .select('id, label')
  const reasonMap = new Map((pauseReasons ?? []).map(r => [r.id, r.label]))

  // Fetch actor user names
  const actorIds = [...new Set(events.map(e => e.actor_user_id).filter(Boolean))]
  const userMap = new Map<string, string>()
  if (actorIds.length > 0) {
    const { data: users } = await supabase
      .from('shopfloor_users')
      .select('id, display_name')
      .in('id', actorIds)
    for (const u of users ?? []) userMap.set(u.id, u.display_name)
  }

  // Pair each PAUSE with the next RESUME (or session end) to get duration
  const stoppages: Array<{
    id: string
    session_id: string
    mo_number: string
    paused_at: string
    resumed_at: string | null
    pause_reason: string | null
    operator: string | null
    duration_mins: number | null
  }> = []

  // Group events by session
  const bySession = new Map<string, typeof events>()
  for (const ev of events) {
    if (!bySession.has(ev.session_id)) bySession.set(ev.session_id, [])
    bySession.get(ev.session_id)!.push(ev)
  }

  for (const [sessionId, evs] of bySession) {
    const session = sessionMap.get(sessionId)
    for (let i = 0; i < evs.length; i++) {
      const ev = evs[i]
      if (ev.event_type !== 'SESSION_PAUSE') continue
      // Find the next resume for this session
      const resume = evs.slice(i + 1).find(e => e.event_type === 'SESSION_RESUME')
      const resumedAt = resume?.occurred_at ?? session?.ended_at ?? null
      const durationMins = resumedAt
        ? Math.round((new Date(resumedAt).getTime() - new Date(ev.occurred_at).getTime()) / 60000)
        : null

      stoppages.push({
        id: ev.id,
        session_id: sessionId,
        mo_number: session?.mo_number ?? '—',
        paused_at: ev.occurred_at,
        resumed_at: resumedAt,
        pause_reason: ev.pause_reason_id ? (reasonMap.get(ev.pause_reason_id) ?? null) : null,
        operator: ev.actor_user_id ? (userMap.get(ev.actor_user_id) ?? null) : null,
        duration_mins: durationMins,
      })
    }
  }

  // Sort newest first
  stoppages.sort((a, b) => new Date(b.paused_at).getTime() - new Date(a.paused_at).getTime())
  return stoppages
}

// ---- Machine QC Events (first offs, last offs) ----
export async function getMachineQcEvents(machineId: string) {
  const supabase = createServiceClient()

  const { data: qcCodes } = await supabase
    .from('qc_codes')
    .select('id, code_type, mo_number, result, issued_by, redeemed, redeemed_at, redeemed_by, created_at, expires_at')
    .eq('machine_id', machineId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (!qcCodes || qcCodes.length === 0) return []

  // Collect user IDs for issued_by and redeemed_by
  const userIds = [...new Set([
    ...qcCodes.map(q => q.issued_by),
    ...qcCodes.map(q => q.redeemed_by).filter(Boolean),
  ])]

  const userMap = new Map<string, string>()
  if (userIds.length > 0) {
    const { data: users } = await supabase
      .from('shopfloor_users')
      .select('id, display_name')
      .in('id', userIds)
    for (const u of users ?? []) userMap.set(u.id, u.display_name)
  }

  return qcCodes.map(q => ({
    id: q.id,
    code_type: q.code_type as 'FIRST_OFF' | 'LAST_OFF',
    mo_number: q.mo_number,
    result: q.result as 'PASS' | 'FAIL',
    issued_by: userMap.get(q.issued_by) ?? '—',
    redeemed: q.redeemed,
    redeemed_at: q.redeemed_at as string | null,
    redeemed_by: q.redeemed_by ? (userMap.get(q.redeemed_by) ?? '—') : null,
    created_at: q.created_at as string,
    expires_at: q.expires_at as string,
  }))
}

export async function getSessionDetail(sessionId: string) {
  const supabase = createServiceClient()
  const { data: session } = await supabase
    .from('sessions')
    .select('*, machine:machines(*), user:shopfloor_users!user_id(*), device:devices(*)')
    .eq('id', sessionId)
    .single()

  const { data: events } = await supabase
    .from('session_events')
    .select('*, pause_reason:pause_reasons(*), actor_user:shopfloor_users(*)')
    .eq('session_id', sessionId)
    .order('occurred_at', { ascending: true })

  return { session, events: events ?? [] }
}

export async function autoCloseSession(sessionId: string): Promise<ActionResult> {
  const supabase = createServiceClient()

  const { error } = await supabase
    .from('sessions')
    .update({
      status: 'AUTO_CLOSED',
      ended_at: new Date().toISOString(),
      auto_closed: true,
    })
    .eq('id', sessionId)
    .in('status', ['ACTIVE', 'PAUSED'])

  if (error) return { ok: false, error: error.message }

  await supabase.from('session_events').insert({
    session_id: sessionId,
    event_type: 'SESSION_AUTO_CLOSE',
    metadata: { reason: 'admin_manual' },
  })

  return { ok: true }
}

// ---- Devices ----

export async function getAllDevices() {
  const supabase = createServiceClient()
  const now = new Date().toISOString()

  const [{ data: devices }, { data: activeSessions }] = await Promise.all([
    supabase
      .from('devices')
      .select('id, station_name, machine_id, is_active, created_at, machine:machines(id, machine_code, description)')
      .order('station_name'),
    supabase
      .from('device_sessions')
      .select('device_id, created_at, expires_at')
      .eq('is_valid', true)
      .gt('expires_at', now),
  ])

  const sessionMap = new Map((activeSessions ?? []).map(s => [s.device_id, s]))

  return (devices ?? []).map(d => ({
    ...d,
    active_session: sessionMap.get(d.id) ?? null,
  }))
}

export async function createDevice(params: {
  stationName: string
  password: string
}): Promise<ActionResult> {
  const supabase = createServiceClient()
  const { error } = await supabase.rpc('upsert_device', {
    p_station_name: params.stationName.trim(),
    p_pin: params.password,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function updateDevice(params: {
  id: string
  stationName: string
  machineId: string | null
  isActive: boolean
}): Promise<ActionResult> {
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('devices')
    .update({ station_name: params.stationName.trim(), machine_id: params.machineId || null, is_active: params.isActive })
    .eq('id', params.id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function deleteDevice(id: string): Promise<ActionResult> {
  const supabase = createServiceClient()
  const { error } = await supabase.from('devices').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ---- Shopfloor Users ----

// ---- Machine Activity Log ----
// Merges sessions, stoppages (pause events) and QC events into one
// chronological array. All filters are applied server-side.
export async function getMachineActivityLog(
  machineId: string,
  filters?: { from?: string; to?: string; mo?: string; userId?: string }
) {
  const supabase = createServiceClient()
  const { from, to, mo, userId } = filters ?? {}

  // --- Sessions (use getAllSessions which is proven to work through RLS) ---
  const rawSessions = await getAllSessions({
    machineId,
    limit: 500,
    from,
    to,
    mo,
    userId,
  })

  const sessions = rawSessions.map((s: any) => ({
    id: s.id,
    session_type: s.session_type,
    status: s.status,
    mo_number: s.mo_number,
    started_at: s.started_at,
    ended_at: s.ended_at,
    qty_to_make: s.qty_to_make,
    qty_made: s.qty_made,
    qty_scrapped: s.qty_scrapped,
    user_id: s.user_id,
    user: s.user,
  }))

  const sessionIds = sessions.map((s: any) => s.id)

  // Build user map from joined user objects
  const userMap = new Map<string, { display_name: string; role: string }>()
  for (const s of sessions) {
    if (s.user_id && s.user) {
      userMap.set(s.user_id, { display_name: s.user.display_name, role: s.user.role })
    }
  }

  // --- Pause/Resume events ---
  let pauseEvents: any[] = []
  if (sessionIds.length > 0) {
    const { data: evRows } = await supabase
      .from('session_events')
      .select('id, session_id, event_type, occurred_at, actor_user_id, pause_reason_id')
      .in('session_id', sessionIds)
      .in('event_type', ['SESSION_PAUSE', 'SESSION_RESUME'])
      .order('occurred_at', { ascending: true })
    pauseEvents = evRows ?? []

    // Fetch pause reason labels
    const { data: reasons } = await supabase.from('pause_reasons').select('id, label')
    const reasonMap = new Map((reasons ?? []).map(r => [r.id, r.label]))

    // Fetch actor names for pause events
    const actorIds = [...new Set(pauseEvents.map(e => e.actor_user_id).filter(Boolean))]
    const actorMap = new Map<string, string>()
    if (actorIds.length > 0) {
      const { data: actors } = await supabase
        .from('shopfloor_users')
        .select('id, display_name')
        .in('id', actorIds)
      for (const a of actors ?? []) actorMap.set(a.id, a.display_name)
    }

    // Pair PAUSE → RESUME to compute duration
    const bySession = new Map<string, typeof pauseEvents>()
    for (const ev of pauseEvents) {
      if (!bySession.has(ev.session_id)) bySession.set(ev.session_id, [])
      bySession.get(ev.session_id)!.push(ev)
    }

    const stoppages: any[] = []
    for (const [sid, evs] of bySession) {
      const session = sessions.find(s => s.id === sid)
      for (let i = 0; i < evs.length; i++) {
        const ev = evs[i]
        if (ev.event_type !== 'SESSION_PAUSE') continue
        const resume = evs.slice(i + 1).find(e => e.event_type === 'SESSION_RESUME')
        const resumedAt = resume?.occurred_at ?? session?.ended_at ?? null
        const durationMins = resumedAt
          ? Math.round((new Date(resumedAt).getTime() - new Date(ev.occurred_at).getTime()) / 60000)
          : null
        stoppages.push({
          _type: 'STOPPAGE' as const,
          _time: ev.occurred_at,
          id: ev.id,
          mo_number: session?.mo_number ?? '—',
          operator: ev.actor_user_id ? (actorMap.get(ev.actor_user_id) ?? '—') : '—',
          pause_reason: ev.pause_reason_id ? (reasonMap.get(ev.pause_reason_id) ?? null) : null,
          paused_at: ev.occurred_at,
          resumed_at: resumedAt,
          duration_mins: durationMins,
        })
      }
    }
    // Replace pauseEvents array with the paired stoppages
    pauseEvents = stoppages
  }

  // --- QC Events ---
  let qcQuery = supabase
    .from('qc_codes')
    .select('id, code_type, mo_number, result, issued_by, redeemed, redeemed_at, redeemed_by, created_at')
    .eq('machine_id', machineId)
    .order('created_at', { ascending: false })
    .limit(500)
  if (from)   qcQuery = qcQuery.gte('created_at', from)
  if (to)     qcQuery = qcQuery.lte('created_at', to + 'T23:59:59')
  if (mo)     qcQuery = qcQuery.ilike('mo_number', `%${mo}%`)
  const { data: qcRows } = await qcQuery

  const qcUserIds = [...new Set([
    ...(qcRows ?? []).map((q: any) => q.issued_by),
    ...(qcRows ?? []).map((q: any) => q.redeemed_by).filter(Boolean),
  ])]
  const qcUserMap = new Map<string, string>()
  if (qcUserIds.length > 0) {
    const { data: qu } = await supabase
      .from('shopfloor_users')
      .select('id, display_name')
      .in('id', qcUserIds)
    for (const u of qu ?? []) qcUserMap.set(u.id, u.display_name)
  }

  const qcEvents = (qcRows ?? [])
    .filter((q: any) => !userId || q.issued_by === userId || q.redeemed_by === userId)
    .map((q: any) => ({
      _type: 'QC' as const,
      _time: q.created_at,
      id: q.id,
      code_type: q.code_type,
      mo_number: q.mo_number,
      result: q.result,
      issued_by: qcUserMap.get(q.issued_by) ?? '—',
      redeemed: q.redeemed,
      redeemed_at: q.redeemed_at ?? null,
      redeemed_by: q.redeemed_by ? (qcUserMap.get(q.redeemed_by) ?? '—') : null,
      created_at: q.created_at,
    }))

  // --- In-process Check Results ---
  let checkResultEvents: any[] = []
  if (sessionIds.length > 0) {
    const { data: checkRows } = await supabase
      .from('check_results')
      .select('id, mo_number, product_id, session_id, check_template_id, result, numeric_value, text_value, checked_by, checked_at, notes, template:check_templates(name, input_type, target_value, tolerance_plus, tolerance_minus, unit)')
      .in('session_id', sessionIds)
      .order('checked_at', { ascending: false })

    const checkUserIds = [...new Set((checkRows ?? []).map((r: any) => r.checked_by).filter(Boolean))]
    const checkUserMap = new Map<string, string>()
    if (checkUserIds.length > 0) {
      const { data: cu } = await supabase.from('shopfloor_users').select('id, display_name').in('id', checkUserIds)
      for (const u of cu ?? []) checkUserMap.set(u.id, u.display_name)
    }

    checkResultEvents = (checkRows ?? [])
      .filter((r: any) => !userId || r.checked_by === userId)
      .filter((r: any) => !mo || r.mo_number?.toLowerCase().includes(mo.toLowerCase()))
      .map((r: any) => ({
        _type: 'CHECK_RESULT' as const,
        _time: r.checked_at,
        id: r.id,
        mo_number: r.mo_number,
        product_id: r.product_id,
        result: r.result,
        numeric_value: r.numeric_value,
        text_value: r.text_value,
        notes: r.notes,
        operator: r.checked_by ? (checkUserMap.get(r.checked_by) ?? '—') : '—',
        template: r.template,
        checked_at: r.checked_at,
      }))
  }

  // --- Merge into one chronological array (newest first) ---
  const sessionEvents = sessions.map(s => ({
    _type: 'SESSION' as const,
    _time: s.started_at,
    ...s,
    operator: userMap.get(s.user_id) ?? null,
  }))

  const all = [
    ...sessionEvents,
    ...pauseEvents,
    ...qcEvents,
    ...checkResultEvents,
  ].sort((a, b) => new Date(b._time).getTime() - new Date(a._time).getTime())

  return {
    events: all,
    users: Array.from(
      new Map([
        ...Array.from(userMap.entries()).map(([id, u]) => [id, u.display_name] as [string, string]),
        ...Array.from(qcUserMap.entries()),
      ])
    ).map(([id, display_name]) => ({ id, display_name })),
  }
}

export async function getAllShopfloorUsers() {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('shopfloor_users')
    .select('*, shift:shift_patterns(id, shift_name:name, name, start_time, end_time, break_minutes)')
    .order('display_name')
  return data ?? []
}

export async function createShopfloorUser(params: {
  userCode: string
  displayName: string
  role: string
  shiftId?: string
}): Promise<ActionResult> {
  const supabase = createServiceClient()
  const { error } = await supabase.from('shopfloor_users').insert({
    user_code: params.userCode.trim(),
    display_name: params.displayName.trim(),
    role: params.role,
    shift_id: params.shiftId ?? null,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function toggleShopfloorUser(userId: string, isActive: boolean): Promise<ActionResult> {
  const supabase = createServiceClient()
  const { error } = await supabase.from('shopfloor_users').update({ is_active: isActive }).eq('id', userId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ---- Admin Console Users ----
// An "admin" = a Supabase Auth user (email/password) linked via admin_users
// to an ADMIN-role shopfloor_users record.

export async function getAdminUsers() {
  const supabase = createServiceClient()
  const { data: links } = await supabase
    .from('admin_users')
    .select('auth_uid, created_at, user:shopfloor_users(id, display_name, user_code, is_active, role)')
    .order('created_at', { ascending: true })
  if (!links) return []

  // Pull the email for each auth uid from Supabase Auth
  const result = []
  for (const link of links) {
    const { data: authData } = await supabase.auth.admin.getUserById(link.auth_uid)
    result.push({
      auth_uid: link.auth_uid,
      email: authData?.user?.email ?? '(unknown)',
      created_at: link.created_at,
      display_name: (link.user as any)?.display_name ?? '',
      user_code: (link.user as any)?.user_code ?? '',
      is_active: (link.user as any)?.is_active ?? false,
    })
  }
  return result
}

export async function createAdminUser(params: {
  email: string
  password: string
  displayName: string
  userCode: string
}): Promise<ActionResult> {
  const supabase = createServiceClient()
  const email = params.email.trim().toLowerCase()

  // 1. Create the Supabase Auth user (email confirmed so they can log in now)
  const { data: created, error: authErr } = await supabase.auth.admin.createUser({
    email,
    password: params.password,
    email_confirm: true,
  })
  if (authErr || !created?.user) {
    return { ok: false, error: authErr?.message ?? 'Could not create auth user.' }
  }
  const authUid = created.user.id

  // 2. Create the ADMIN-role shopfloor user
  const { data: sfUser, error: sfErr } = await supabase
    .from('shopfloor_users')
    .insert({
      user_code: params.userCode.trim(),
      display_name: params.displayName.trim(),
      role: 'ADMIN',
      is_active: true,
    })
    .select('id')
    .single()
  if (sfErr || !sfUser) {
    // Roll back the auth user so we don't leave an orphan
    await supabase.auth.admin.deleteUser(authUid)
    return { ok: false, error: sfErr?.message ?? 'Could not create shopfloor user.' }
  }

  // 3. Link them in admin_users
  const { error: linkErr } = await supabase
    .from('admin_users')
    .insert({ auth_uid: authUid, user_id: sfUser.id })
  if (linkErr) {
    await supabase.auth.admin.deleteUser(authUid)
    await supabase.from('shopfloor_users').delete().eq('id', sfUser.id)
    return { ok: false, error: linkErr.message }
  }

  return { ok: true }
}

export async function revokeAdminUser(authUid: string): Promise<ActionResult> {
  const supabase = createServiceClient()

  // Find the linked shopfloor user first
  const { data: link } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('auth_uid', authUid)
    .single()

  // Remove the link, then the shopfloor record, then the auth user
  await supabase.from('admin_users').delete().eq('auth_uid', authUid)
  if (link?.user_id) {
    await supabase.from('shopfloor_users').delete().eq('id', link.user_id)
  }
  const { error } = await supabase.auth.admin.deleteUser(authUid)
  if (error) return { ok: false, error: error.message }

  return { ok: true }
}

// ---- Shift Patterns ----

export async function getShiftPatterns() {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('shift_patterns')
    .select('id, shift_name:name, name, start_time, end_time, break_minutes')
    .order('start_time')
  return data ?? []
}

// ---- Pause Reasons ----

export async function getPauseReasonsAdmin() {
  const supabase = createServiceClient()
  const { data } = await supabase.from('pause_reasons').select('*').order('label')
  return data ?? []
}

export async function createPauseReason(label: string): Promise<ActionResult> {
  const supabase = createServiceClient()
  const { error } = await supabase.from('pause_reasons').insert({ label: label.trim() })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ---- Audit log ----

export async function getAuditLog(limit = 100) {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('audit_log')
    .select('*, actor_user:shopfloor_users(*), device:devices(station_name)')
    .order('occurred_at', { ascending: false })
    .limit(limit)
  return data ?? []
}

// ---- Shift closeout: auto-close stale sessions ----

export async function runShiftCloseout(): Promise<ActionResult<{ closed: number }>> {
  const supabase = createServiceClient()

  // Only close sessions left ACTIVE (running) at shift end. PAUSED sessions are
  // a deliberate hold — they must persist indefinitely until someone resumes or
  // finishes them, even across multiple days — so they are never auto-closed.
  const { data: staleSessions } = await supabase
    .from('sessions')
    .select('id')
    .eq('status', 'ACTIVE')

  if (!staleSessions?.length) return { ok: true, data: { closed: 0 } }

  const ids = staleSessions.map((s) => s.id)

  const { error } = await supabase
    .from('sessions')
    .update({
      status: 'AUTO_CLOSED',
      ended_at: new Date().toISOString(),
      auto_closed: true,
    })
    .in('id', ids)

  if (error) return { ok: false, error: error.message }

  // Bulk insert events
  await supabase.from('session_events').insert(
    ids.map((id) => ({
      session_id: id,
      event_type: 'SESSION_AUTO_CLOSE',
      metadata: { reason: 'shift_closeout' },
    }))
  )

  return { ok: true, data: { closed: ids.length } }
}

// ---- Machines ----

// ---- QC Check Templates ----

export async function getCheckTemplates() {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('check_templates')
    .select('*')
    .order('name')
  return data ?? []
}

export async function createCheckTemplate(params: {
  name: string
  description?: string
  input_type: 'PASS_FAIL' | 'NUMERIC' | 'TEXT'
  target_value?: number | null
  tolerance_plus?: number | null
  tolerance_minus?: number | null
  unit?: string
  product_id?: string
}): Promise<ActionResult> {
  const supabase = createServiceClient()
  const { error } = await supabase.from('check_templates').insert({
    name: params.name.trim(),
    description: params.description?.trim() || null,
    input_type: params.input_type,
    target_value: params.target_value ?? null,
    tolerance_plus: params.tolerance_plus ?? null,
    tolerance_minus: params.tolerance_minus ?? null,
    unit: params.unit?.trim() || null,
    product_id: params.product_id?.trim() || null,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function updateCheckTemplate(id: string, params: {
  name: string
  description?: string
  input_type: 'PASS_FAIL' | 'NUMERIC' | 'TEXT'
  target_value?: number | null
  tolerance_plus?: number | null
  tolerance_minus?: number | null
  unit?: string
  product_id?: string
  is_active: boolean
}): Promise<ActionResult> {
  const supabase = createServiceClient()
  const { error } = await supabase.from('check_templates').update({
    name: params.name.trim(),
    description: params.description?.trim() || null,
    input_type: params.input_type,
    target_value: params.target_value ?? null,
    tolerance_plus: params.tolerance_plus ?? null,
    tolerance_minus: params.tolerance_minus ?? null,
    unit: params.unit?.trim() || null,
    product_id: params.product_id?.trim() || null,
    is_active: params.is_active,
  }).eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ---- MO Check Assignments ----

export async function getMoCheckAssignments(moNumber: string) {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('mo_check_assignments')
    .select('*, template:check_templates(*)')
    .eq('mo_number', moNumber)
    .order('order_index')
  return data ?? []
}

export async function getAllMoAssignments() {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('mo_check_assignments')
    .select('mo_number, product_id')
    .order('mo_number')
  // Return unique MO numbers
  const seen = new Set<string>()
  const result: { mo_number: string; product_id: string | null }[] = []
  for (const row of data ?? []) {
    if (!seen.has(row.mo_number)) {
      seen.add(row.mo_number)
      result.push({ mo_number: row.mo_number, product_id: row.product_id })
    }
  }
  return result
}

export async function addMoCheckAssignment(params: {
  mo_number: string
  product_id?: string
  check_template_id: string
  required: boolean
}): Promise<ActionResult> {
  const supabase = createServiceClient()
  const { data: existing } = await supabase
    .from('mo_check_assignments')
    .select('order_index')
    .eq('mo_number', params.mo_number)
    .order('order_index', { ascending: false })
    .limit(1)
  const nextIndex = (existing?.[0]?.order_index ?? -1) + 1
  const { error } = await supabase.from('mo_check_assignments').insert({
    mo_number: params.mo_number.trim().toUpperCase(),
    product_id: params.product_id?.trim() || null,
    check_template_id: params.check_template_id,
    required: params.required,
    order_index: nextIndex,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function removeMoCheckAssignment(id: string): Promise<ActionResult> {
  const supabase = createServiceClient()
  const { error } = await supabase.from('mo_check_assignments').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// Bulk import from Excel: upserts templates and assignments
export async function importMoChecksFromExcel(rows: Array<{
  mo_number: string
  product_id: string
  check_name: string
  input_type: 'PASS_FAIL' | 'NUMERIC' | 'TEXT'
  target_value?: number | null
  tolerance_plus?: number | null
  tolerance_minus?: number | null
  unit?: string
  required?: boolean
}>): Promise<ActionResult<{ imported: number }>> {
  const supabase = createServiceClient()
  let imported = 0

  for (const row of rows) {
    // Upsert the check template by name + product_id
    const { data: existing } = await supabase
      .from('check_templates')
      .select('id')
      .eq('name', row.check_name.trim())
      .eq('product_id', row.product_id.trim())
      .maybeSingle()

    let templateId: string
    if (existing) {
      templateId = existing.id
    } else {
      const { data: created, error: cErr } = await supabase
        .from('check_templates')
        .insert({
          name: row.check_name.trim(),
          input_type: row.input_type,
          target_value: row.target_value ?? null,
          tolerance_plus: row.tolerance_plus ?? null,
          tolerance_minus: row.tolerance_minus ?? null,
          unit: row.unit?.trim() || null,
          product_id: row.product_id.trim(),
        })
        .select('id')
        .single()
      if (cErr || !created) continue
      templateId = created.id
    }

    // Upsert the assignment
    const { error: aErr } = await supabase
      .from('mo_check_assignments')
      .upsert({
        mo_number: row.mo_number.trim().toUpperCase(),
        product_id: row.product_id.trim(),
        check_template_id: templateId,
        required: row.required !== false,
      }, { onConflict: 'mo_number,check_template_id' })

    if (!aErr) imported++
  }

  return { ok: true, data: { imported } }
}

// ---- Check Results ----

export async function getCheckResults(filters?: {
  mo?: string
  product_id?: string
  machine_id?: string
  from?: string
  to?: string
}) {
  const supabase = createServiceClient()
  let query = supabase
    .from('check_results')
    .select('*, template:check_templates(*), checker:shopfloor_users(display_name, role), machine:machines(machine_code, description)')
    .order('checked_at', { ascending: false })
    .limit(500)

  if (filters?.mo)         query = query.ilike('mo_number', `%${filters.mo}%`)
  if (filters?.product_id) query = query.eq('product_id', filters.product_id)
  if (filters?.machine_id) query = query.eq('machine_id', filters.machine_id)
  if (filters?.from)       query = query.gte('checked_at', filters.from)
  if (filters?.to)         query = query.lte('checked_at', filters.to + 'T23:59:59')

  const { data } = await query
  return data ?? []
}

export async function submitCheckResult(params: {
  mo_number: string
  product_id?: string
  machine_id?: string
  session_id?: string
  check_template_id: string
  result?: 'PASS' | 'FAIL'
  numeric_value?: number | null
  text_value?: string | null
  checked_by: string
  notes?: string
}): Promise<ActionResult> {
  const supabase = createServiceClient()
  const { error } = await supabase.from('check_results').insert({
    mo_number: params.mo_number,
    product_id: params.product_id || null,
    machine_id: params.machine_id || null,
    session_id: params.session_id || null,
    check_template_id: params.check_template_id,
    result: params.result || null,
    numeric_value: params.numeric_value ?? null,
    text_value: params.text_value?.trim() || null,
    checked_by: params.checked_by,
    notes: params.notes?.trim() || null,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function getAllMachines() {
  const supabase = createServiceClient()
  const { data } = await supabase.from('machines').select('*').order('machine_code')
  return data ?? []
}

export async function createMachine(params: { machineCode: string; description: string }): Promise<ActionResult> {
  const supabase = createServiceClient()
  const { error } = await supabase.from('machines').insert({
    machine_code: params.machineCode.trim().toUpperCase(),
    description: params.description.trim() || null,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function updateMachine(params: {
  id: string
  machineCode: string
  description?: string
  isActive: boolean
}): Promise<ActionResult> {
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('machines')
    .update({
      machine_code: params.machineCode.trim().toUpperCase(),
      description: params.description?.trim() ?? null,
      is_active: params.isActive,
    })
    .eq('id', params.id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function deleteMachine(id: string): Promise<ActionResult> {
  const supabase = createServiceClient()
  const { error } = await supabase.from('machines').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ---- Shift Pattern CRUD ----

export async function createShiftPattern(params: {
  shiftName: string
  startTime: string
  endTime: string
  breakMinutes?: number
}): Promise<ActionResult> {
  const supabase = createServiceClient()
  const { error } = await supabase.from('shift_patterns').insert({
    name: params.shiftName.trim(),
    start_time: params.startTime,
    end_time: params.endTime,
    break_minutes: params.breakMinutes ?? 0,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function updateShiftPattern(params: {
  id: string
  shiftName: string
  startTime: string
  endTime: string
  breakMinutes?: number
  isActive: boolean
}): Promise<ActionResult> {
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('shift_patterns')
    .update({
      name: params.shiftName.trim(),
      start_time: params.startTime,
      end_time: params.endTime,
      break_minutes: params.breakMinutes ?? 0,
    })
    .eq('id', params.id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function deleteShiftPattern(id: string): Promise<ActionResult> {
  const supabase = createServiceClient()
  const { error } = await supabase.from('shift_patterns').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ---- Pause Reason CRUD ----

export async function updatePauseReason(params: {
  id: string
  label: string
  appliesTo: string[]
  isActive: boolean
}): Promise<ActionResult> {
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('pause_reasons')
    .update({ label: params.label.trim(), applies_to: params.appliesTo, is_active: params.isActive })
    .eq('id', params.id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function deletePauseReason(id: string): Promise<ActionResult> {
  const supabase = createServiceClient()
  const { error } = await supabase.from('pause_reasons').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ---- User CRUD (update + delete) ----

export async function updateShopfloorUser(params: {
  id: string
  displayName: string
  role: string
  shiftId?: string | null
  isActive: boolean
}): Promise<ActionResult> {
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('shopfloor_users')
    .update({
      display_name: params.displayName.trim(),
      role: params.role,
      shift_id: params.shiftId ?? null,
      is_active: params.isActive,
    })
    .eq('id', params.id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function deleteShopfloorUser(id: string): Promise<ActionResult> {
  const supabase = createServiceClient()
  const { error } = await supabase.from('shopfloor_users').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ---- Dashboard stats ----

export async function getDashboardStats() {
  const supabase = createServiceClient()
  const now = Date.now()

  const [{ data: activeSessions }, { data: recentAudit }] = await Promise.all([
    supabase
      .from('sessions')
    .select('*, machine:machines(*), user:shopfloor_users!user_id(*), device:devices(*), authoriser:shopfloor_users!authorised_by(*)')
      .in('status', ['ACTIVE', 'PAUSED'])
      .order('started_at', { ascending: false }),
    supabase
      .from('audit_log')
      .select('*, actor_user:shopfloor_users(display_name), device:devices(station_name)')
      .order('occurred_at', { ascending: false })
      .limit(20),
  ])

  const sessions = (activeSessions ?? []) as Session[]
  const longRunning = sessions.filter(s => {
    const elapsed = now - new Date(s.started_at).getTime()
    return elapsed > 4 * 60 * 60 * 1000
  })
  const paused = sessions.filter(s => s.status === 'PAUSED')
  const unmanned = sessions.filter(s => s.session_type === 'UNMANNED')

  return {
    activeSessions: sessions,
    longRunning,
    pausedSessions: paused,
    unmannedSessions: unmanned,
    recentAudit: recentAudit ?? [],
  }
}

// ---- Admin sign-out ----

export async function adminSignOut(): Promise<void> {
  'use server'
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  await supabase.auth.signOut()
}

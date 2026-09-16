'use server'

import { cookies } from 'next/headers'
import crypto from 'crypto'
import { createServiceClient } from '@/lib/supabase/service'
import { requireQcUser, UnauthorizedError } from '@/lib/auth/guards'
import type { ActionResult, ShopfloorUser } from '@/lib/types'

const QC_COOKIE = 'qc_session_token'
const QC_SESSION_DURATION_HOURS = 12

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export async function qcLogin(userCode: string): Promise<ActionResult<{ user: ShopfloorUser }>> {
  const supabase = createServiceClient()

  const { data: user } = await supabase
    .from('shopfloor_users')
    .select('*')
    .eq('user_code', userCode.trim())
    .eq('is_active', true)
    .single()

  if (!user || !['QC', 'ADMIN'].includes(user.role)) {
    return { ok: false, error: 'Code not recognised or not authorised for QC.' }
  }

  const token = crypto.randomBytes(32).toString('hex')
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + QC_SESSION_DURATION_HOURS * 60 * 60 * 1000).toISOString()

  const { error: sessionErr } = await supabase.from('qc_sessions').insert({
    user_id: user.id,
    token_hash: tokenHash,
    expires_at: expiresAt,
    is_valid: true,
  })

  if (sessionErr) {
    return { ok: false, error: 'Failed to create QC session.' }
  }

  const cookieStore = await cookies()
  cookieStore.set(QC_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: new Date(expiresAt),
    path: '/',
  })

  return { ok: true, data: { user } }
}

export async function qcLogout(): Promise<ActionResult> {
  const cookieStore = await cookies()
  const token = cookieStore.get(QC_COOKIE)?.value

  if (token) {
    const supabase = createServiceClient()
    const tokenHash = hashToken(token)
    await supabase.from('qc_sessions').update({ is_valid: false }).eq('token_hash', tokenHash)
    cookieStore.delete(QC_COOKIE)
  }

  return { ok: true }
}

export async function getQcSessionUser(): Promise<ShopfloorUser | null> {
  // requireQcUser() implements the session lookup (hashed token, is_valid,
  // not expired, user active + QC/ADMIN role); reuse it instead of
  // duplicating the cookie/token logic here.
  try {
    return await requireQcUser()
  } catch {
    return null
  }
}

export async function recordQcFail(params: {
  sessionId: string
  moNumber: string
  machineId: string
  reason: string
  issuedByUserId: string
}): Promise<ActionResult> {
  try {
    await requireQcUser()
  } catch {
    return { ok: false, error: 'Not authorised.' }
  }

  const supabase = createServiceClient()

  const { error } = await supabase.from('qc_events').insert({
    session_id: params.sessionId,
    mo_number: params.moNumber,
    machine_id: params.machineId,
    event_type: 'QC_FAIL',
    reason: params.reason,
    issued_by_user_id: params.issuedByUserId,
  })

  if (error) return { ok: false, error: error.message }

  await supabase.from('audit_log').insert({
    event_type: 'QC_FAIL',
    metadata: { session_id: params.sessionId, mo_number: params.moNumber, reason: params.reason },
  })

  return { ok: true }
}

export async function lookupQcUser(userCode: string): Promise<ShopfloorUser | null> {
  const supabase = createServiceClient()
  const { data: user } = await supabase
    .from('shopfloor_users')
    .select('*')
    .eq('user_code', userCode.trim())
    .eq('is_active', true)
    .single()

  return user ?? null
}

export async function lookupMachineByCode(machineCode: string) {
  try {
    await requireQcUser()
  } catch {
    return null
  }

  const supabase = createServiceClient()
  const { data: machine } = await supabase
    .from('machines')
    .select('*')
    .eq('machine_code', machineCode.trim())
    .eq('is_active', true)
    .single()

  return machine ?? null
}

export async function issueQcCode(params: {
  sessionId: string
  moNumber: string
  machineId: string
  issuedByUserId: string
  codeType: 'PASS' | 'FAIL'
}): Promise<ActionResult<{ code: string }>> {
  try {
    await requireQcUser()
  } catch {
    return { ok: false, error: 'Not authorised.' }
  }

  const supabase = createServiceClient()
  const code = Math.floor(100000 + Math.random() * 900000).toString()

  const { error } = await supabase.from('qc_codes').insert({
    code,
    session_id: params.sessionId,
    mo_number: params.moNumber,
    machine_id: params.machineId,
    issued_by_user_id: params.issuedByUserId,
    code_type: params.codeType,
    is_redeemed: false,
  })

  if (error) return { ok: false, error: error.message }

  return { ok: true, data: { code } }
}

export async function getQcHistory(params: { machineId?: string; limit?: number }) {
  try {
    await requireQcUser()
  } catch {
    return []
  }

  const supabase = createServiceClient()
  let query = supabase
    .from('qc_events')
    .select('*, machine:machines(machine_code, description), issued_by:shopfloor_users!issued_by_user_id(display_name)')
    .order('created_at', { ascending: false })
    .limit(params.limit ?? 50)

  if (params.machineId) query = query.eq('machine_id', params.machineId)

  const { data } = await query
  return data ?? []
}

export async function getActiveSessions() {
  try {
    await requireQcUser()
  } catch {
    return []
  }

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('sessions')
    .select('*, machine:machines(*), user:shopfloor_users!user_id(*)')
    .in('status', ['ACTIVE', 'PAUSED'])
    .order('started_at', { ascending: false })

  return data ?? []
}

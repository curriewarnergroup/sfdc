'use server'

import { createServiceClient } from '@/lib/supabase/service'
import { cookies } from 'next/headers'
import type { ActionResult, QcCode, ShopfloorUser } from '@/lib/types'
import crypto from 'crypto'

// ---- QC Auth ----

export async function qcLogin(userCode: string): Promise<ActionResult> {
  const supabase = createServiceClient()
  const { data: user } = await supabase
    .from('shopfloor_users')
    .select('id, role, is_active')
    .eq('user_code', userCode)
    .single()

  if (!user || !user.is_active) return { ok: false, error: 'User code not found or inactive.' }
  if (!['QC', 'ADMIN'].includes(user.role)) {
    return { ok: false, error: 'Access denied. QC or Admin role required.' }
  }

  const cookieStore = await cookies()
  cookieStore.set('qc_user_id', user.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 12, // 12 hours
  })
  return { ok: true }
}

export async function qcLogout(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete('qc_user_id')
}

export async function getQcSessionUser(): Promise<ShopfloorUser | null> {
  const cookieStore = await cookies()
  const userId = cookieStore.get('qc_user_id')?.value
  if (!userId) return null
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('shopfloor_users')
    .select('*')
    .eq('id', userId)
    .single()
  return data ?? null
}

// ---- QC Fail Recording ----

export async function recordQcFail(params: {
  codeType: 'FIRST_OFF' | 'LAST_OFF'
  moNumber: string
  machineId: string
  issuedByUserId: string
  notes?: string
}): Promise<ActionResult> {
  const supabase = createServiceClient()
  await supabase.from('session_events').insert({
    session_id: null,
    event_type: 'QC_CODE_ISSUED',
    actor_user_id: params.issuedByUserId,
    device_id: null,
    metadata: {
      code_type: params.codeType,
      mo_number: params.moNumber,
      machine_id: params.machineId,
      result: 'FAIL',
      notes: params.notes ?? null,
      code_issued: false,
    },
  })
  return { ok: true }
}

// ---- User lookup by code ----

export async function lookupQcUser(userCode: string): Promise<ShopfloorUser | null> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('shopfloor_users')
    .select('*')
    .eq('user_code', userCode.trim().toUpperCase())
    .eq('is_active', true)
    .single()
  return data ?? null
}

// ---- Machine lookup by code ----

export async function lookupMachineByCode(machineCode: string) {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('machines')
    .select('*')
    .eq('machine_code', machineCode.trim().toUpperCase())
    .eq('is_active', true)
    .single()
  return data ?? null
}

const QC_CODE_EXPIRY_MINUTES = 30

function generatePlainCode(codeType: 'FIRST_OFF' | 'LAST_OFF'): string {
  // FIRST_OFF: simple 4-digit numeric code (0000–9999)
  if (codeType === 'FIRST_OFF') {
    return crypto.randomInt(0, 10000).toString().padStart(4, '0')
  }
  // LAST_OFF: 8-char alphanumeric, uppercase
  return crypto.randomBytes(4).toString('hex').toUpperCase()
}

export async function issueQcCode(params: {
  codeType: 'FIRST_OFF' | 'LAST_OFF'
  moNumber: string
  machineId: string
  issuedByUserCode: string
  result: 'PASS' | 'FAIL'
}): Promise<ActionResult<{ plainCode: string; code: QcCode }>> {
  const supabase = createServiceClient()

  // Resolve QC user
  const { data: qcUser } = await supabase
    .from('shopfloor_users')
    .select('*')
    .eq('user_code', params.issuedByUserCode.trim())
    .eq('is_active', true)
    .single()

  if (!qcUser) return { ok: false, error: 'QC user code not found.' }
  if (!['QC', 'ADMIN'].includes(qcUser.role)) {
    return { ok: false, error: 'User does not have QC role.' }
  }

  // For FIRST_OFF: invalidate any existing unredeemed code for this MO+machine
  if (params.codeType === 'FIRST_OFF') {
    await supabase
      .from('qc_codes')
      .update({ redeemed: true, redeemed_at: new Date().toISOString() })
      .eq('mo_number', params.moNumber)
      .eq('machine_id', params.machineId)
      .eq('code_type', 'FIRST_OFF')
      .eq('redeemed', false)
  }

  const plainCode = generatePlainCode(params.codeType)
  const codeHash = crypto.createHash('sha256').update(plainCode).digest('hex')
  const expiresAt = new Date(
    Date.now() + QC_CODE_EXPIRY_MINUTES * 60 * 1000
  ).toISOString()

  const { data: code, error } = await supabase
    .from('qc_codes')
    .insert({
      code_hash: codeHash,
      code_type: params.codeType,
      mo_number: params.moNumber.trim().toUpperCase(),
      machine_id: params.machineId,
      issued_by: qcUser.id,
      result: params.result,
      expires_at: expiresAt,
    })
    .select('*, machine:machines(*), issuer:shopfloor_users!issued_by(*)')
    .single()

  if (error || !code) {
    return { ok: false, error: error?.message ?? 'Failed to issue QC code.' }
  }

  // Log event
  await supabase.from('session_events').insert({
    session_id: null,
    event_type: 'QC_CODE_ISSUED',
    actor_user_id: qcUser.id,
    device_id: null,
    metadata: {
      code_type: params.codeType,
      mo_number: params.moNumber,
      machine_id: params.machineId,
      result: params.result,
    },
  })

  return { ok: true, data: { plainCode, code } }
}

export async function getQcHistory(params?: {
  moNumber?: string
  machineId?: string
  limit?: number
}) {
  const supabase = createServiceClient()
  let query = supabase
    .from('qc_codes')
    .select(
      '*, machine:machines(*), issuer:shopfloor_users!issued_by(*), redeemer:shopfloor_users!redeemed_by(*)'
    )
    .order('created_at', { ascending: false })
    .limit(params?.limit ?? 50)

  if (params?.moNumber) query = query.eq('mo_number', params.moNumber.toUpperCase())
  if (params?.machineId) query = query.eq('machine_id', params.machineId)

  const { data } = await query
  return data ?? []
}

export async function getActiveSessions() {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('sessions')
    .select('*, machine:machines(*), user:shopfloor_users!user_id(*), device:devices(*)')
    .in('status', ['ACTIVE', 'PAUSED'])
    .order('started_at', { ascending: false })
  return data ?? []
}

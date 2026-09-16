// ============================================================
// Server action auth guards
// ------------------------------------------------------------
// Route layouts (app/reporting/layout.tsx, app/admin/layout.tsx,
// app/kiosk/layout.tsx, app/qc/layout.tsx) only gate page renders. Every
// exported function in lib/actions/*.ts marked 'use server' is a public POST
// endpoint that Next.js exposes independently of which page rendered it —
// layout redirects never run for a direct action call. Because of this, every
// exported server action MUST call the appropriate guard below as its very
// first statement. Do not rely on the layout to protect an action.
// ============================================================

import { cookies } from 'next/headers'
import crypto from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import type { Device, ShopfloorUser } from '@/lib/types'

export class UnauthorizedError extends Error {
  constructor(message = 'Not authorised.') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

const DEVICE_COOKIE = 'device_token'
const QC_COOKIE = 'qc_session_token'

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

// ---- Admin console / reporting (Supabase Auth) ----
// Same lookup as app/reporting/layout.tsx and app/admin/layout.tsx: the
// Supabase Auth user must be linked (via admin_users) to an active
// shopfloor_users record. ADMIN is the primary console role; SUPERVISOR is
// also accepted, matching the SUPERVISOR/ADMIN parity already used elsewhere
// in the app (e.g. unmanned-run authorisation, first-off overrides).
export async function requireAdmin(): Promise<ShopfloorUser> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new UnauthorizedError()

  const svc = createServiceClient()
  const { data: adminUser } = await svc
    .from('admin_users')
    .select('user_id, shopfloor_users(*)')
    .eq('auth_uid', user.id)
    .single()

  const shopfloorUser = (adminUser as any)?.shopfloor_users as ShopfloorUser | undefined
  if (
    !adminUser ||
    !shopfloorUser?.is_active ||
    (shopfloorUser.role !== 'ADMIN' && shopfloorUser.role !== 'SUPERVISOR')
  ) {
    throw new UnauthorizedError()
  }
  return shopfloorUser
}

// ---- Kiosk device (hashed device_sessions token) ----
// Same lookup as getDeviceFromCookie() in lib/actions/device-auth.ts: the
// device cookie must hash to a valid, non-expired device_sessions row for an
// active device.
export async function requireDevice(): Promise<Device> {
  const cookieStore = await cookies()
  const token = cookieStore.get(DEVICE_COOKIE)?.value
  if (!token) throw new UnauthorizedError()

  const supabase = createServiceClient()
  const tokenHash = hashToken(token)

  const { data: deviceSession } = await supabase
    .from('device_sessions')
    .select('device_id, expires_at, is_valid')
    .eq('token_hash', tokenHash)
    .eq('is_valid', true)
    .single()

  if (!deviceSession) throw new UnauthorizedError()

  if (deviceSession.expires_at && new Date(deviceSession.expires_at) < new Date()) {
    await supabase.from('device_sessions').update({ is_valid: false }).eq('token_hash', tokenHash)
    throw new UnauthorizedError()
  }

  const { data: device } = await supabase
    .from('devices')
    .select('*, machine:machines(id, machine_code, description, is_multi_setup)')
    .eq('id', deviceSession.device_id)
    .eq('is_active', true)
    .single()

  if (!device) throw new UnauthorizedError()
  return device as Device
}

// ---- QC console (hashed qc_sessions token) ----
export async function requireQcUser(): Promise<ShopfloorUser> {
  const cookieStore = await cookies()
  const token = cookieStore.get(QC_COOKIE)?.value
  if (!token) throw new UnauthorizedError()

  const supabase = createServiceClient()
  const tokenHash = hashToken(token)

  const { data: session } = await supabase
    .from('qc_sessions')
    .select('user_id, expires_at, is_valid')
    .eq('token_hash', tokenHash)
    .eq('is_valid', true)
    .single()

  if (!session) throw new UnauthorizedError()

  if (session.expires_at && new Date(session.expires_at) < new Date()) {
    await supabase.from('qc_sessions').update({ is_valid: false }).eq('token_hash', tokenHash)
    throw new UnauthorizedError()
  }

  const { data: user } = await supabase
    .from('shopfloor_users')
    .select('*')
    .eq('id', session.user_id)
    .eq('is_active', true)
    .single()

  if (!user || !['QC', 'ADMIN'].includes(user.role)) throw new UnauthorizedError()
  return user as ShopfloorUser
}

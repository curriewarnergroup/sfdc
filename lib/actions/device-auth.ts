'use server'

import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/service'
import crypto from 'crypto'
import type { ActionResult, Device } from '@/lib/types'

const DEVICE_COOKIE = 'device_token'
const SESSION_DURATION_HOURS = 12

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export async function loginDevice(
  stationName: string,
  password: string,
  // When true, any existing device session for this station is kicked off and
  // this login takes over. Job/machine state in `sessions` is left untouched,
  // so the kiosk stays exactly where the previous session left it.
  force = false
): Promise<ActionResult<{ device: Device }>> {
  const supabase = createServiceClient()

  // Look up device
  const { data: device, error } = await supabase
    .from('devices')
    .select('*')
    .eq('station_name', stationName.trim())
    .eq('is_active', true)
    .single()

  if (error || !device) {
    return { ok: false, error: 'Station not found or inactive.' }
  }

  // Verify PIN via SECURITY DEFINER function
  const { data: valid, error: cryptoErr } = await supabase.rpc('verify_device_pin', {
    p_device_id: device.id,
    p_pin: password,
  })

  if (cryptoErr || !valid) {
    return { ok: false, error: 'Incorrect password.' }
  }

  // Block login if this station already has an active session from another device/browser
  const { data: existingSession } = await supabase
    .from('device_sessions')
    .select('id, expires_at')
    .eq('device_id', device.id)
    .eq('is_valid', true)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (existingSession) {
    if (!force) {
      return {
        ok: false,
        error: `STATION_IN_USE:${device.station_name}`,
      }
    }
    // Force takeover: invalidate every existing device session for this station.
    // Only the kiosk login is ended — active job sessions are preserved.
    await supabase
      .from('device_sessions')
      .update({ is_valid: false })
      .eq('device_id', device.id)
      .eq('is_valid', true)

    await supabase.from('audit_log').insert({
      event_type: 'DEVICE_LOGOUT',
      device_id: device.id,
      metadata: { forced: true, reason: 'takeover' },
    })
  }

  // Create session token
  const token = crypto.randomBytes(32).toString('hex')
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + SESSION_DURATION_HOURS * 60 * 60 * 1000).toISOString()

  const { error: sessionErr } = await supabase.from('device_sessions').insert({
    device_id: device.id,
    token_hash: tokenHash,
    expires_at: expiresAt,
    is_valid: true,
  })

  if (sessionErr) {
    return { ok: false, error: 'Failed to create device session.' }
  }

  // Log audit event
  await supabase.from('audit_log').insert({
    event_type: 'DEVICE_LOGIN',
    device_id: device.id,
    metadata: { station_name: device.station_name },
  })

  // Set cookie
  const cookieStore = await cookies()
  cookieStore.set(DEVICE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: new Date(expiresAt),
    path: '/',
  })

  return { ok: true, data: { device } }
}

export async function logoutDevice(): Promise<ActionResult> {
  const cookieStore = await cookies()
  const token = cookieStore.get(DEVICE_COOKIE)?.value

  if (token) {
    const supabase = createServiceClient()
    const tokenHash = hashToken(token)

    await supabase
      .from('device_sessions')
      .update({ is_valid: false })
      .eq('token_hash', tokenHash)

    const { data: session } = await supabase
      .from('device_sessions')
      .select('device_id')
      .eq('token_hash', tokenHash)
      .single()

    if (session) {
      await supabase.from('audit_log').insert({
        event_type: 'DEVICE_LOGOUT',
        device_id: session.device_id,
        metadata: {},
      })
    }

    cookieStore.delete(DEVICE_COOKIE)
  }

  return { ok: true }
}

export async function forceEndDeviceSession(deviceId: string): Promise<ActionResult> {
  const supabase = createServiceClient()

  const { error } = await supabase
    .from('device_sessions')
    .update({ is_valid: false })
    .eq('device_id', deviceId)
    .eq('is_valid', true)

  if (error) return { ok: false, error: error.message }

  await supabase.from('audit_log').insert({
    event_type: 'DEVICE_LOGOUT',
    device_id: deviceId,
    metadata: { forced: true },
  })

  return { ok: true }
}

export async function getActiveDeviceSessions(): Promise<
  Array<{ device_id: string; started_at: string; expires_at: string }>
> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('device_sessions')
    .select('device_id, created_at, expires_at')
    .eq('is_valid', true)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })

  return (data ?? []).map(d => ({
    device_id: d.device_id,
    started_at: d.created_at,
    expires_at: d.expires_at,
  }))
}

export async function getDeviceFromCookie(): Promise<Device | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(DEVICE_COOKIE)?.value
  if (!token) return null

  const supabase = createServiceClient()
  const tokenHash = hashToken(token)

  const { data: deviceSession } = await supabase
    .from('device_sessions')
    .select('device_id, expires_at, is_valid')
    .eq('token_hash', tokenHash)
    .eq('is_valid', true)
    .single()

  if (!deviceSession) return null
  if (deviceSession.expires_at && new Date(deviceSession.expires_at) < new Date()) {
    await supabase.from('device_sessions').update({ is_valid: false }).eq('token_hash', tokenHash)
    return null
  }

  const { data: device } = await supabase
    .from('devices')
    .select('*, machine:machines(id, machine_code, description, is_multi_setup)')
    .eq('id', deviceSession.device_id)
    .eq('is_active', true)
    .single()

  return device ?? null
}

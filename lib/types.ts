// ============================================================
// Shopfloor Time-Capture — Shared Types
// ============================================================

export type UserRole = 'OPERATOR' | 'SETTER' | 'QC' | 'ADMIN' | 'SUPERVISOR'
export type SessionType = 'SETUP' | 'RUN' | 'UNMANNED'
export type SessionStatus = 'ACTIVE' | 'PAUSED' | 'FINISHED' | 'AUTO_CLOSED'
export type QcCodeType = 'FIRST_OFF' | 'LAST_OFF'
export type QcResult = 'PASS' | 'FAIL'
export type EventType =
  | 'SESSION_START'
  | 'SESSION_PAUSE'
  | 'SESSION_RESUME'
  | 'SESSION_FINISH'
  | 'SESSION_AUTO_CLOSE'
  | 'QC_CODE_ISSUED'
  | 'QC_CODE_REDEEMED'
  | 'QC_CODE_REDEEMED_FAILED'
  | 'BREAK_AUTO_DEDUCTED'
  | 'DEVICE_LOGIN'
  | 'DEVICE_LOGOUT'

// ---- DB row shapes (snake_case from Supabase) ----

export interface Device {
  id: string
  station_name: string
  machine_id: string | null
  is_active: boolean
  created_at: string
  // joined
  machine?: Machine
}

export interface ShopfloorUser {
  id: string
  user_code: string
  display_name: string
  role: UserRole
  shift_id: string | null
  is_active: boolean
  created_at: string
}

export interface Machine {
  id: string
  machine_code: string
  description: string | null
  is_active: boolean
  // When true, this machine may hold multiple concurrent setups / runs at once.
  is_multi_setup: boolean
}

export interface PauseReason {
  id: string
  label: string
  is_active: boolean
}

export interface ShiftPattern {
  id: string
  name: string
  start_time: string
  end_time: string
  break_start: string | null
  break_end: string | null
  break_minutes: number
}

export interface Session {
  id: string
  session_type: SessionType
  status: SessionStatus
  mo_number: string
  machine_id: string
  user_id: string
  device_id: string
  started_at: string
  ended_at: string | null
  first_off_approved: boolean
  break_deducted_minutes: number
  break_auto_deducted: boolean
  auto_closed: boolean
  notes: string | null
  qty_to_make: number | null
  qty_made: number | null
  qty_scrapped: number | null
  authorised_by: string | null
  // Denormalised copy of the machine's is_multi_setup flag at start time.
  allow_multi: boolean
  created_at: string
  // joined
  machine?: Machine
  user?: ShopfloorUser
  device?: Device
  authoriser?: ShopfloorUser
}

export interface SessionEvent {
  id: string
  session_id: string | null
  event_type: EventType
  actor_user_id: string | null
  device_id: string | null
  pause_reason_id: string | null
  metadata: Record<string, unknown>
  occurred_at: string
  // joined
  pause_reason?: PauseReason
  actor_user?: ShopfloorUser
}

export interface QcCode {
  id: string
  code_type: QcCodeType
  mo_number: string
  machine_id: string
  issued_by: string
  result: QcResult
  expires_at: string
  redeemed: boolean
  redeemed_at: string | null
  redeemed_by: string | null
  created_at: string
  // joined
  machine?: Machine
  issuer?: ShopfloorUser
  redeemer?: ShopfloorUser
}

// ---- Server-action return types ----

export interface ActionResult<T = undefined> {
  ok: boolean
  error?: string
  data?: T
}

// ---- Kiosk session state (client-side derived) ----

export interface KioskState {
  device: Device | null
  activeSession: Session | null
  activeUser: ShopfloorUser | null
  latestEvents: SessionEvent[]
  pendingQcCode: QcCode | null
}

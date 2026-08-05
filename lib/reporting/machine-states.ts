// ============================================================
// Machine states
// ------------------------------------------------------------
// Deliberately a plain module with NO 'use client'.
//
// These constants are imported by both the server page (to compute counts
// and filter) and the client filter component. Anything exported from a
// 'use client' file becomes a client reference proxy when a server
// component imports it — arrays stop being arrays, and you get
// "MACHINE_STATES.map is not a function" at render time. Shared values
// have to sit outside the boundary.
// ============================================================

export const MACHINE_STATES = [
  { key: 'RUNNING',     label: 'Running',     dot: 'bg-status-running',      chip: 'border-status-running/40 bg-status-running/10 text-status-running' },
  { key: 'IN_SETUP',    label: 'Setup',       dot: 'bg-blue-400',            chip: 'border-blue-400/40 bg-blue-400/10 text-blue-400' },
  { key: 'UNMANNED',    label: 'Unmanned',    dot: 'bg-purple-400',          chip: 'border-purple-400/40 bg-purple-400/10 text-purple-400' },
  { key: 'STOPPED',     label: 'Stopped',     dot: 'bg-status-paused',       chip: 'border-status-paused/40 bg-status-paused/10 text-status-paused' },
  { key: 'AWAITING_QC', label: 'Awaiting QC', dot: 'bg-amber-400',           chip: 'border-amber-400/40 bg-amber-400/10 text-amber-400' },
  { key: 'IDLE',        label: 'Idle',        dot: 'bg-muted-foreground/50', chip: 'border-border bg-muted text-muted-foreground' },
] as const

export type MachineState = (typeof MACHINE_STATES)[number]['key']

export const ALL_STATES: MachineState[] = MACHINE_STATES.map(s => s.key)

// Everything except IDLE — "machines being worked on", which is the view
// you want on the wall.
export const DEFAULT_STATES: MachineState[] = [
  'RUNNING',
  'IN_SETUP',
  'UNMANNED',
  'STOPPED',
  'AWAITING_QC',
]

export const STATE_STORAGE_KEY = 'shoptrack.machineStates'

export function parseStates(raw: string | undefined | null): MachineState[] {
  if (!raw) return []
  const valid = new Set<string>(ALL_STATES)
  return raw
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(s => valid.has(s)) as MachineState[]
}

export function stateMeta(state: MachineState) {
  return MACHINE_STATES.find(s => s.key === state) ?? MACHINE_STATES[MACHINE_STATES.length - 1]
}

// Machines being worked on first; idle sinks to the bottom.
export const GROUP_RANK: Record<MachineState, number> = {
  STOPPED: 0,
  RUNNING: 0,
  IN_SETUP: 0,
  UNMANNED: 0,
  AWAITING_QC: 1,
  IDLE: 2,
}

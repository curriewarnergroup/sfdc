import type { SessionStatus } from '@/lib/types'
import { cn } from '@/lib/utils'

type ExtendedStatus = SessionStatus | 'IDLE' | 'UNMANNED'

const CONFIG: Record<ExtendedStatus, { label: string; dot: string; text: string; bg: string }> = {
  ACTIVE: {
    label: 'RUNNING',
    dot: 'bg-status-running',
    text: 'text-status-running',
    bg: 'bg-status-running/10 border-status-running/30',
  },
  PAUSED: {
    label: 'PAUSED',
    dot: 'bg-status-paused',
    text: 'text-status-paused',
    bg: 'bg-status-paused/10 border-status-paused/30',
  },
  IDLE: {
    label: 'IDLE',
    dot: 'bg-status-idle',
    text: 'text-status-idle',
    bg: 'bg-status-idle/10 border-status-idle/30',
  },
  FINISHED: {
    label: 'FINISHED',
    dot: 'bg-status-idle',
    text: 'text-status-idle',
    bg: 'bg-status-idle/10 border-status-idle/30',
  },
  AUTO_CLOSED: {
    label: 'AUTO-CLOSED',
    dot: 'bg-status-error',
    text: 'text-status-error',
    bg: 'bg-status-error/10 border-status-error/30',
  },
  UNMANNED: {
    label: 'UNMANNED',
    dot: 'bg-blue-400',
    text: 'text-blue-400',
    bg: 'bg-blue-400/10 border-blue-400/30',
  },
}

export function StatusBadge({ status }: { status: ExtendedStatus }) {
  const c = CONFIG[status] ?? CONFIG['AUTO_CLOSED']
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-bold uppercase tracking-widest',
        c.bg,
        c.text
      )}
    >
      <span className={cn('w-2 h-2 rounded-full animate-pulse', c.dot)} />
      {c.label}
    </span>
  )
}

'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import { forceCloseSession, type ForceCloseReason } from '@/lib/actions/admin'
import { CrudModal } from './CrudModal'

const REASONS: {
  id: ForceCloseReason
  label: string
  desc: string
  danger?: boolean
}[] = [
  {
    id: 'JOB_FINISHED',
    label: 'Job has finished',
    desc: 'Keep all recorded time up to now and mark the job finished. It stops showing as active.',
  },
  {
    id: 'OTHER_PRIORITY',
    label: 'Other job takes priority',
    desc: 'Keep recorded time up to now and finish this job so another can take over. It stops showing as active.',
  },
  {
    id: 'ERROR',
    label: 'Started in error',
    desc: 'Discard this session completely. No time is kept and it is removed from records.',
    danger: true,
  },
]

interface Props {
  sessionId: string
  /** Short label shown for context, e.g. the MO number. */
  contextLabel?: string
  /** Class applied to the trigger button so it matches its surroundings. */
  className?: string
  children?: React.ReactNode
}

export function ForceCloseButton({ sessionId, contextLabel, className, children }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<ForceCloseReason | null>(null)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  function close() {
    setOpen(false)
    setReason(null)
    setError('')
  }

  function confirm() {
    if (!reason) {
      setError('Please choose a reason for closing.')
      return
    }
    setError('')
    startTransition(async () => {
      const res = await forceCloseSession(sessionId, reason)
      if (!res.ok) {
        setError(res.error ?? 'Could not close the session.')
        return
      }
      close()
      router.refresh()
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setError(''); setReason(null); setOpen(true) }}
        className={className ?? 'text-xs text-destructive hover:underline font-medium'}
      >
        {children ?? 'Force Close'}
      </button>

      <CrudModal title="Force Close Session" open={open} onClose={close}>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {contextLabel ? (
              <>Choose why <span className="font-mono font-semibold text-foreground">{contextLabel}</span> is being closed.</>
            ) : (
              'Choose why this session is being closed.'
            )}
          </p>

          <div className="space-y-2" role="radiogroup" aria-label="Closure reason">
            {REASONS.map(r => {
              const selected = reason === r.id
              return (
                <button
                  key={r.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => { setReason(r.id); setError('') }}
                  className={`w-full text-left rounded-xl border px-4 py-3 transition-colors ${
                    selected
                      ? r.danger
                        ? 'border-destructive bg-destructive/10'
                        : 'border-primary bg-primary/10'
                      : 'border-border bg-background hover:bg-muted/40'
                  }`}
                >
                  <span className={`flex items-center gap-2 text-sm font-semibold ${r.danger ? 'text-destructive' : 'text-foreground'}`}>
                    {r.danger && <AlertTriangle className="w-4 h-4 shrink-0" />}
                    {r.label}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">{r.desc}</span>
                </button>
              )
            })}
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex gap-3 pt-4 border-t border-border">
            <button
              type="button"
              onClick={close}
              disabled={pending}
              className="flex-1 h-10 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={pending || !reason}
              className={`flex-1 h-10 rounded-lg text-sm font-bold uppercase tracking-widest text-white disabled:opacity-40 transition-opacity ${
                reason === 'ERROR' ? 'bg-destructive' : 'bg-status-running'
              }`}
            >
              {pending ? 'Closing…' : reason === 'ERROR' ? 'Discard Session' : 'Close Session'}
            </button>
          </div>
        </div>
      </CrudModal>
    </>
  )
}

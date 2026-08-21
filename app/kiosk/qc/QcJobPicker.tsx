'use client'

import { useRouter } from 'next/navigation'

interface PickerSession {
  id: string
  mo_number: string
  status: string
  started_at: string
  user?: { id: string; display_name: string } | null
}

// Shown when a multi-setup machine has more than one live production run.
// The operator picks which MO the QC check applies to before continuing.
export function QcJobPicker({ sessions }: { sessions: PickerSession[] }) {
  const router = useRouter()

  return (
    <div className="flex flex-col min-h-full bg-background px-5 py-7 gap-6 max-w-2xl mx-auto w-full">
      <div className="w-full">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-2 h-8 rounded-full bg-primary" aria-hidden="true" />
          <h1 className="text-xl font-bold text-foreground uppercase tracking-widest">
            Which Job?
          </h1>
        </div>
        <p className="text-sm text-muted-foreground pl-5">
          This machine has several live runs. Select the job you&apos;re checking.
        </p>
      </div>

      <div className="flex flex-col gap-3" role="group" aria-label="Select a job to QC check">
        {sessions.map(s => (
          <button
            key={s.id}
            onClick={() => router.push(`/kiosk/qc?session=${s.id}`)}
            className="w-full text-left rounded-2xl border-2 border-border bg-card hover:border-primary/60 transition-all p-5 flex items-center justify-between gap-3 touch-manipulation"
            aria-label={`QC check for MO ${s.mo_number}`}
          >
            <div className="flex flex-col gap-0.5">
              <span className="font-mono font-bold text-xl text-foreground">{s.mo_number}</span>
              <span className="text-xs text-muted-foreground">
                {s.user?.display_name ?? '—'}
              </span>
            </div>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${
              s.status === 'ACTIVE'
                ? 'bg-status-running/20 text-status-running'
                : 'bg-status-paused/20 text-status-paused'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${s.status === 'ACTIVE' ? 'bg-status-running animate-pulse' : 'bg-status-paused'}`} />
              {s.status}
            </span>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => router.push('/kiosk')}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2 self-center"
      >
        Back to Home
      </button>
    </div>
  )
}

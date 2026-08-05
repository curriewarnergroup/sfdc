'use client'

import type { PauseReason } from '@/lib/types'

interface ReasonPickerProps {
  reasons: PauseReason[]
  selected: string | null
  onSelect: (id: string) => void
  disabled?: boolean
}

/**
 * ReasonPicker — displays pause reasons as large tap-target buttons.
 * Selected reason gets a highlighted border.
 */
export function ReasonPicker({ reasons, selected, onSelect, disabled = false }: ReasonPickerProps) {
  if (!reasons.length) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        No pause reasons configured.
      </p>
    )
  }

  return (
    <div
      role="group"
      aria-label="Select pause reason"
      className="grid grid-cols-2 gap-3"
    >
      {reasons.map((reason) => {
        const isSelected = reason.id === selected
        return (
          <button
            key={reason.id}
            type="button"
            onClick={() => onSelect(reason.id)}
            disabled={disabled}
            aria-pressed={isSelected}
            className={[
              'flex items-center justify-center text-center',
              'min-h-[72px] px-3 py-4 rounded-2xl border-2',
              'text-sm font-bold uppercase tracking-wide',
              'transition-all duration-150 active:scale-[0.97] touch-manipulation',
              'disabled:opacity-40 disabled:cursor-not-allowed',
              isSelected
                ? 'bg-status-paused/20 border-status-paused/60 text-status-paused'
                : 'bg-secondary border-border text-secondary-foreground hover:border-primary/40',
            ].join(' ')}
          >
            <span className="leading-snug">{reason.label}</span>
          </button>
        )
      })}
    </div>
  )
}

'use client'

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

interface CrudModalProps {
  title: string
  open: boolean
  onClose: () => void
  children: React.ReactNode
}

export function CrudModal({ title, open, onClose, children }: CrudModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        ref={dialogRef}
        className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 id="modal-title" className="text-base font-bold text-foreground">{title}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

// Shared form field
export function FormField({
  label, children, error,
}: {
  label: string
  children: React.ReactNode
  error?: string
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

// Shared text input style
export const inputCls = 'w-full h-10 px-3 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50'

// Shared select style
export const selectCls = 'w-full h-10 px-3 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50'

// Submit row
export function ModalFooter({
  onClose, pending, submitLabel = 'Save',
}: {
  onClose: () => void
  pending: boolean
  submitLabel?: string
}) {
  return (
    <div className="flex gap-3 pt-4 border-t border-border mt-4">
      <button
        type="button"
        onClick={onClose}
        className="flex-1 h-10 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={pending}
        className="flex-1 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-bold uppercase tracking-widest disabled:opacity-40 transition-opacity"
      >
        {pending ? 'Saving…' : submitLabel}
      </button>
    </div>
  )
}

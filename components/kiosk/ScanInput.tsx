'use client'

import { useRef, useEffect, useId, useCallback, useImperativeHandle, forwardRef, useState } from 'react'
import { X, Camera } from 'lucide-react'
import { CameraScanner } from './CameraScanner'

export interface ScanInputHandle {
  /** Programmatically focus the underlying input (e.g. after Enter on previous field) */
  focus: () => void
}

interface ScanInputProps {
  label: string
  value: string
  onChange: (value: string) => void
  onConfirm?: () => void   // called when Enter is pressed
  placeholder?: string
  autoFocus?: boolean
  disabled?: boolean
  hint?: string            // small helper text below the field
  transform?: (v: string) => string
  enableCamera?: boolean   // show a camera button to scan via device camera (default true)
}

/**
 * ScanInput — optimised for keyboard-wedge barcode scanners.
 *
 * - Captures Enter key to advance focus / trigger onConfirm.
 * - Has a Clear (×) button to wipe the field without a keyboard.
 * - Auto-focuses when autoFocus=true (useful for sequential scan fields).
 * - Applies an optional transform (e.g. toUpperCase) on every keystroke.
 * - Exposes a `focus()` handle via forwardRef for programmatic focus.
 */
export const ScanInput = forwardRef<ScanInputHandle, ScanInputProps>(function ScanInput({
  label,
  value,
  onChange,
  onConfirm,
  placeholder = 'Scan or type…',
  autoFocus = false,
  disabled = false,
  hint,
  transform = (v) => v.toUpperCase(),
  enableCamera = true,
}, ref) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [scannerOpen, setScannerOpen] = useState(false)

  // Expose focus() to parent via ref
  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }))

  // Auto-focus when the prop is set (or changes to true)
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus()
    }
  }, [autoFocus])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        onConfirm?.()
      }
    },
    [onConfirm]
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(transform(e.target.value))
    },
    [onChange, transform]
  )

  const handleClear = useCallback(() => {
    onChange('')
    inputRef.current?.focus()
  }, [onChange])

  const handleCameraScan = useCallback(
    (text: string) => {
      // Fill the field with the scanned value, then close and return to the form
      onChange(transform(text.trim()))
      setScannerOpen(false)
      // Return focus to the field on the same screen
      requestAnimationFrame(() => inputRef.current?.focus())
    },
    [onChange, transform]
  )

  const hasValue = value.length > 0

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={id}
        className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground"
      >
        {label}
      </label>

      <div className="relative flex items-center">
        {/* Scan icon */}
        <span
          aria-hidden="true"
          className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 7V5a2 2 0 0 1 2-2h2" />
            <path d="M17 3h2a2 2 0 0 1 2 2v2" />
            <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
            <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
            <line x1="8" y1="12" x2="8" y2="12.01" />
            <line x1="12" y1="8" x2="12" y2="16" />
            <line x1="16" y1="12" x2="16" y2="12.01" />
          </svg>
        </span>

        <input
          ref={inputRef}
          id={id}
          type="text"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck={false}
          inputMode="text"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className={[
            'w-full h-16 pl-12 rounded-xl',
            enableCamera ? 'pr-24' : 'pr-12',
            'bg-secondary border-2 border-border',
            'text-foreground text-xl font-mono placeholder:text-muted-foreground/50',
            'focus:outline-none focus:ring-0 focus:border-primary',
            'transition-colors duration-150',
            'disabled:opacity-40 disabled:cursor-not-allowed',
            hasValue ? 'border-primary/60' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        />

        {/* Clear button — only visible when there is a value */}
        {hasValue && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            aria-label={`Clear ${label}`}
            className={[
              'absolute top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-background transition-colors',
              enableCamera ? 'right-14' : 'right-3',
            ].join(' ')}
          >
            <X size={16} />
          </button>
        )}

        {/* Camera scan button */}
        {enableCamera && !disabled && (
          <button
            type="button"
            onClick={() => setScannerOpen(true)}
            aria-label={`Scan ${label} with camera`}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-lg bg-primary/15 text-primary hover:bg-primary/25 transition-colors"
          >
            <Camera size={20} />
          </button>
        )}
      </div>

      {scannerOpen && (
        <CameraScanner
          label={label}
          onScan={handleCameraScan}
          onClose={() => setScannerOpen(false)}
        />
      )}

      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground pl-1">
          {hint}
        </p>
      )}
    </div>
  )
})

ScanInput.displayName = 'ScanInput'

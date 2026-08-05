'use client'

import { forwardRef } from 'react'

type BigButtonVariant = 'primary' | 'success' | 'warning' | 'danger' | 'secondary'

interface BigButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BigButtonVariant
  icon?: React.ReactNode
  sublabel?: string        // smaller line below the main label
  loading?: boolean
}

const variantClasses: Record<BigButtonVariant, string> = {
  primary:   'bg-primary text-primary-foreground border-primary/60 hover:bg-primary/90',
  success:   'bg-status-running/20 text-status-running border-status-running/40 hover:bg-status-running/30',
  warning:   'bg-status-paused/20 text-status-paused border-status-paused/40 hover:bg-status-paused/30',
  danger:    'bg-status-error/20 text-status-error border-status-error/40 hover:bg-status-error/30',
  secondary: 'bg-secondary text-secondary-foreground border-border hover:bg-secondary/80',
}

/**
 * BigButton — large, glove-friendly tap target for the kiosk home screen.
 * Min-height 88px with generous padding. Supports an icon slot and a sublabel.
 */
export const BigButton = forwardRef<HTMLButtonElement, BigButtonProps>(
  (
    {
      variant = 'secondary',
      icon,
      sublabel,
      loading,
      children,
      disabled,
      className = '',
      ...rest
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={[
          'relative flex flex-col items-center justify-center gap-1.5',
          'w-full min-h-[88px] px-4 py-5 rounded-2xl border-2',
          'font-bold text-lg uppercase tracking-widest',
          'transition-all duration-150 active:scale-[0.97]',
          'disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100',
          'touch-manipulation select-none',
          variantClasses[variant],
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...rest}
      >
        {loading ? (
          <span className="animate-spin w-6 h-6 border-2 border-current border-t-transparent rounded-full" />
        ) : (
          <>
            {icon && (
              <span aria-hidden="true" className="text-current opacity-80">
                {icon}
              </span>
            )}
            <span>{children}</span>
            {sublabel && (
              <span className="text-xs font-normal normal-case tracking-normal opacity-70">
                {sublabel}
              </span>
            )}
          </>
        )}
      </button>
    )
  }
)

BigButton.displayName = 'BigButton'

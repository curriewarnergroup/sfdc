'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

export function QueryParamSelect({
  param,
  value,
  options,
  label,
}: {
  param: string
  value: string
  options: Array<{ value: string; label: string }>
  label: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()

  function onChange(next: string) {
    const q = new URLSearchParams(params.toString())
    if (next) q.set(param, next)
    else q.delete(param)
    startTransition(() => router.push(`${pathname}?${q.toString()}`))
  }

  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground print:hidden">
      {label}
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`h-8 rounded-lg border border-border bg-card px-2 text-xs text-foreground ${pending ? 'opacity-60' : ''}`}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

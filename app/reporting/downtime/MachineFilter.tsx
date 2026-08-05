'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

export function MachineFilter({
  machines,
  selected,
}: {
  machines: Array<{ id: string; machine_code: string; description?: string | null }>
  selected: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()

  function onChange(value: string) {
    const next = new URLSearchParams(params.toString())
    if (value) next.set('machineId', value)
    else next.delete('machineId')
    startTransition(() => router.push(`${pathname}?${next.toString()}`))
  }

  const sorted = [...machines].sort((a, b) =>
    a.machine_code.localeCompare(b.machine_code, undefined, { numeric: true, sensitivity: 'base' }),
  )

  return (
    <select
      value={selected}
      onChange={e => onChange(e.target.value)}
      aria-label="Filter by machine"
      className={`h-8 rounded-lg border border-border bg-card px-2 text-xs text-foreground print:hidden ${
        pending ? 'opacity-60' : ''
      }`}
    >
      <option value="">All machines</option>
      {sorted.map(m => (
        <option key={m.id} value={m.id}>
          {m.machine_code}
          {m.description ? ` — ${m.description}` : ''}
        </option>
      ))}
    </select>
  )
}

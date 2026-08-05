'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Search } from 'lucide-react'

export function MoSearch({ initial }: { initial: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [value, setValue] = useState(initial)
  const [pending, startTransition] = useTransition()

  function submit() {
    const next = new URLSearchParams(params.toString())
    const v = value.trim()
    if (v) next.set('mo', v)
    else next.delete('mo')
    startTransition(() => router.push(`${pathname}?${next.toString()}`))
  }

  return (
    <div className={`inline-flex items-center gap-1.5 print:hidden ${pending ? 'opacity-60' : ''}`}>
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') submit()
          }}
          placeholder="Search MO…"
          aria-label="Search by MO number"
          className="h-8 w-44 rounded-lg border border-border bg-card pl-8 pr-2 text-xs text-foreground"
        />
      </div>
      <button
        onClick={submit}
        className="h-8 px-3 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        Search
      </button>
    </div>
  )
}

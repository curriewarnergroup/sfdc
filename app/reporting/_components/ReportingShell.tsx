'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Cpu, Users, LogOut, Wrench, CalendarDays, ClipboardCheck } from 'lucide-react'

const NAV = [
  { href: '/reporting',          label: 'Machines',  icon: Cpu    },
  { href: '/reporting/setup',    label: 'Setup Time', icon: Wrench },
  { href: '/reporting/pass-off', label: 'Pass-Off Times', icon: ClipboardCheck },
  { href: '/reporting/operators',label: 'Operators', icon: Users  },
  { href: '/reporting/daily',    label: 'Daily Work', icon: CalendarDays },
]

export function ReportingShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function handleSignOut() {
    startTransition(async () => {
      const supabase = createClient()
      await supabase.auth.signOut()
      router.push('/reporting/login')
      router.refresh()
    })
  }

  return (
    <div className="min-h-screen flex bg-background font-sans">
      <aside className="w-56 shrink-0 bg-card border-r border-border flex flex-col">
        <div className="h-16 flex items-center px-4 border-b border-border gap-2">
          <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/ChatGPT%20Image%20Mar%203%2C%202026%2C%2003_15_14%20PM-t6QO2pHj18qAGkSrh9JXCZzecEHZd4.png" alt="C&W ShopTrack" className="h-8 w-auto object-contain" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground border border-border rounded px-1.5 py-0.5 shrink-0">Reports</span>
        </div>
        <nav className="flex-1 py-3 overflow-y-auto" aria-label="Reporting navigation">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === '/reporting' ? pathname === '/reporting' : pathname.startsWith(href)
            return (
              <Link key={href} href={href}
                className={`flex items-center gap-3 px-5 py-2.5 text-sm font-medium transition-colors ${active ? 'bg-primary/10 text-primary border-r-2 border-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                aria-current={active ? 'page' : undefined}>
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </Link>
            )
          })}
        </nav>
        <div className="p-3 border-t border-border">
          <Link href="/admin" className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors mb-1">
            Back to Admin
          </Link>
          <button onClick={handleSignOut} disabled={pending}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50">
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>
    </div>
  )
}

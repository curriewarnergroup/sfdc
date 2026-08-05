'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { adminSignOut } from '@/lib/actions/admin'
import {
  LayoutDashboard, Users, Cpu, Clock, PauseCircle,
  ClipboardList, Settings, LogOut, Monitor, BarChart2, ClipboardCheck, ShieldCheck,
} from 'lucide-react'
import { useTransition } from 'react'

const NAV = [
  { href: '/admin',              label: 'Dashboard',     icon: LayoutDashboard },
  { href: '/admin/sessions',     label: 'Sessions',      icon: ClipboardList   },
  { href: '/admin/users',        label: 'Users',         icon: Users           },
  { href: '/admin/admins',       label: 'Admins',        icon: ShieldCheck     },
  { href: '/admin/machines',     label: 'Machines',      icon: Cpu             },
  { href: '/admin/devices',      label: 'Devices',       icon: Monitor         },
  { href: '/admin/shifts',       label: 'Shifts',        icon: Clock           },
  { href: '/admin/pause-reasons',label: 'Pause Reasons', icon: PauseCircle     },
  { href: '/admin/qc',           label: 'QC Checks',     icon: ClipboardCheck  },
  { href: '/admin/audit',        label: 'Audit Log',     icon: Settings        },
  { href: '/reporting/login',    label: 'Reporting',     icon: BarChart2       },
]

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function handleSignOut() {
    startTransition(async () => {
      await adminSignOut()
      router.push('/admin/login')
      router.refresh()
    })
  }

  return (
    <div className="min-h-screen flex bg-background font-sans">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 bg-card border-r border-border flex flex-col">
        {/* Brand */}
        <div className="h-16 flex items-center px-4 border-b border-border gap-2">
          <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/ChatGPT%20Image%20Mar%203%2C%202026%2C%2003_15_14%20PM-t6QO2pHj18qAGkSrh9JXCZzecEHZd4.png" alt="C&W ShopTrack" className="h-8 w-auto object-contain" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground border border-border rounded px-1.5 py-0.5 shrink-0">Admin</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 overflow-y-auto" aria-label="Admin navigation">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === '/admin'
              ? pathname === '/admin'
              : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-5 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-primary/10 text-primary border-r-2 border-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </Link>
            )
          })}
        </nav>

        {/* Sign out */}
        <div className="p-3 border-t border-border">
          <button
            onClick={handleSignOut}
            disabled={pending}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}

// Reusable page header
export function PageHeader({
  title, subtitle, action,
}: {
  title: string
  subtitle?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between px-8 py-6 border-b border-border">
      <div>
        <h1 className="text-xl font-bold text-foreground tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}

// Small stat card
export function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-card rounded-xl border border-border p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="text-3xl font-bold text-foreground mt-1">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  )
}

// Status badge
export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ACTIVE:      'bg-status-running/20 text-status-running',
    PAUSED:      'bg-status-paused/20 text-status-paused',
    FINISHED:    'bg-muted text-muted-foreground',
    AUTO_CLOSED: 'bg-destructive/20 text-destructive',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide ${map[status] ?? 'bg-muted text-muted-foreground'}`}>
      {status.replace('_', ' ')}
    </span>
  )
}

// elapsedStr has moved to admin-utils.ts (no 'use client') so it can be
// used in both Server and Client Components without errors.

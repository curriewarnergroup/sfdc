'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, Loader2 } from 'lucide-react'

export default function ReportingLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    startTransition(async () => {
      const supabase = createClient()
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
      if (signInErr) { setError(signInErr.message); return }
      router.push('/reporting')
      router.refresh()
    })
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6 py-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-2 md:gap-4 mb-5 md:mb-8 text-center">
          <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/ChatGPT%20Image%20Mar%203%2C%202026%2C%2003_41_27%20PM-hC3ntkzEMOxRGfNw6IhG03wBc5EfyC.png" alt="C&W ShopTrack" className="h-28 md:h-44 w-auto object-contain" />
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-foreground">Production Reporting</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground">Email Address</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@example.com" autoFocus required disabled={pending}
              className="w-full h-12 px-4 rounded-xl bg-card border border-border text-foreground text-base focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50" />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground">Password</label>
            <div className="relative">
              <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required disabled={pending}
                className="w-full h-12 px-4 pr-12 rounded-xl bg-card border border-border text-foreground text-base focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50" />
              <button type="button" onClick={() => setShowPw(v => !v)}
                className="absolute inset-y-0 right-0 w-12 flex items-center justify-center text-muted-foreground hover:text-foreground"
                aria-label={showPw ? 'Hide password' : 'Show password'}>
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          {error && <div className="rounded-lg bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">{error}</div>}
          <button type="submit" disabled={pending || !email || !password}
            className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold uppercase tracking-widest text-sm flex items-center justify-center gap-2 disabled:opacity-40 transition-opacity">
            {pending && <Loader2 className="w-4 h-4 animate-spin" />}
            {pending ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}

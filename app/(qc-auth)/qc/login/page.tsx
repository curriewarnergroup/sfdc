'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { qcLogin } from '@/lib/actions/qc'

export default function QcLoginPage() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    start(async () => {
      const res = await qcLogin(code.trim().toUpperCase())
      if (res.ok) {
        router.replace('/qc')
      } else {
        setError(res.error ?? 'Login failed.')
        setCode('')
        inputRef.current?.focus()
      }
    })
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6 py-4">
      <div className="w-full max-w-sm space-y-4 md:space-y-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-2 md:gap-4 text-center">
          <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/ChatGPT%20Image%20Mar%203%2C%202026%2C%2003_41_27%20PM-hC3ntkzEMOxRGfNw6IhG03wBc5EfyC.png" alt="C&W ShopTrack" className="h-28 md:h-44 w-auto object-contain" />
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-foreground">Quality Control Console</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              Badge / User Code
            </label>
            <input
              ref={inputRef}
              type="text"
              autoComplete="off"
              autoCapitalize="characters"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. QC001"
              required
              className="w-full h-14 px-4 rounded-lg bg-card border border-border text-foreground text-xl font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive-foreground bg-destructive/20 border border-destructive/30 rounded-lg px-4 py-3">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending || !code}
            className="w-full h-14 rounded-xl bg-primary text-primary-foreground font-bold text-base uppercase tracking-widest disabled:opacity-40 transition-opacity"
          >
            {pending ? 'Verifying…' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          Only QC and Admin users can access this console.
        </p>
      </div>
    </div>
  )
}

'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createAdminUser, revokeAdminUser } from '@/lib/actions/admin'
import { CrudModal, FormField, inputCls, ModalFooter } from '../_components/CrudModal'
import { Plus, Trash2, ShieldCheck } from 'lucide-react'

type Admin = {
  auth_uid: string
  email: string
  display_name: string
  user_code: string
  is_active: boolean
  created_at: string
}

export function AdminsClient({ admins }: { admins: Admin[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')

  // Add modal
  const [addOpen, setAddOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')

  function resetAdd() {
    setEmail(''); setPassword(''); setName(''); setCode('')
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    startTransition(async () => {
      const res = await createAdminUser({
        email, password, displayName: name, userCode: code,
      })
      if (!res.ok) { setError(res.error ?? 'Failed'); return }
      setAddOpen(false); resetAdd(); router.refresh()
    })
  }

  function handleRevoke(authUid: string, email: string) {
    if (!confirm(`Revoke admin access for "${email}"? This deletes their login and cannot be undone.`)) return
    startTransition(async () => {
      await revokeAdminUser(authUid)
      router.refresh()
    })
  }

  return (
    <div className="p-8 space-y-5">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {admins.length} admin{admins.length === 1 ? '' : 's'} can sign in with email &amp; password.
        </p>
        <button
          onClick={() => { setAddOpen(true); setError('') }}
          className="h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-bold flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Add Admin
        </button>
      </div>

      {/* Admins table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              {['Email', 'Name', 'Code', 'Status', ''].map(h => (
                <th key={h} className="text-left text-xs font-semibold uppercase tracking-widest text-muted-foreground px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {admins.map(a => (
              <tr key={a.auth_uid} className="bg-card hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
                    <span className="font-medium text-foreground">{a.email}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-foreground">{a.display_name}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{a.user_code}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold rounded px-2 py-0.5 ${a.is_active ? 'bg-status-running/20 text-status-running' : 'bg-muted text-muted-foreground'}`}>
                    {a.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end">
                    <button
                      onClick={() => handleRevoke(a.auth_uid, a.email)}
                      disabled={pending}
                      className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
                      aria-label="Revoke admin"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {admins.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">No admins yet.</p>
        )}
      </div>

      {/* Add modal */}
      <CrudModal title="Add Admin" open={addOpen} onClose={() => setAddOpen(false)}>
        <form onSubmit={handleAdd} className="space-y-4">
          <FormField label="Email Address">
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className={inputCls} placeholder="person@company.com" />
          </FormField>
          <FormField label="Temporary Password">
            <input type="text" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} className={inputCls} placeholder="At least 6 characters" />
          </FormField>
          <FormField label="Display Name">
            <input value={name} onChange={e => setName(e.target.value)} required className={inputCls} placeholder="Jane Doe" />
          </FormField>
          <FormField label="User Code">
            <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} required className={inputCls} placeholder="ADMIN3" />
          </FormField>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <ModalFooter onClose={() => setAddOpen(false)} pending={pending} submitLabel="Add Admin" />
        </form>
      </CrudModal>
    </div>
  )
}

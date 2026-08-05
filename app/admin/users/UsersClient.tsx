'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  createShopfloorUser, updateShopfloorUser,
  deleteShopfloorUser, toggleShopfloorUser,
} from '@/lib/actions/admin'
import { CrudModal, FormField, inputCls, selectCls, ModalFooter } from '../_components/CrudModal'
import { Plus, Pencil, Trash2, Search } from 'lucide-react'

const ROLES = ['OPERATOR', 'SETTER', 'QC', 'SUPERVISOR', 'ADMIN']

type User = {
  id: string; user_code: string; display_name: string
  role: string; is_active: boolean; shift_id?: string | null
  shift?: { id: string; shift_name: string } | null
}
type Shift = { id: string; shift_name: string }

export function UsersClient({ users, shifts }: { users: User[]; shifts: Shift[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')

  // Add modal
  const [addOpen, setAddOpen] = useState(false)
  const [addCode, setAddCode] = useState('')
  const [addName, setAddName] = useState('')
  const [addRole, setAddRole] = useState('OPERATOR')
  const [addShift, setAddShift] = useState('')

  // Edit modal
  const [editUser, setEditUser] = useState<User | null>(null)
  const [editName, setEditName] = useState('')
  const [editRole, setEditRole] = useState('')
  const [editShift, setEditShift] = useState('')
  const [editActive, setEditActive] = useState(true)

  function openEdit(u: User) {
    setEditUser(u)
    setEditName(u.display_name)
    setEditRole(u.role)
    setEditShift(u.shift_id ?? '')
    setEditActive(u.is_active)
    setError('')
  }

  const matchesSearch = (u: User) =>
    u.display_name.toLowerCase().includes(search.toLowerCase()) ||
    u.user_code.toLowerCase().includes(search.toLowerCase()) ||
    u.role.toLowerCase().includes(search.toLowerCase())

  const naturalSort = (a: User, b: User) =>
    a.display_name.localeCompare(b.display_name, undefined, { sensitivity: 'base' })

  const activeUsers = users.filter(u => u.is_active && matchesSearch(u)).sort(naturalSort)
  const inactiveUsers = users.filter(u => !u.is_active && matchesSearch(u)).sort(naturalSort)

  const [showInactive, setShowInactive] = useState(false)

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    startTransition(async () => {
      const res = await createShopfloorUser({
        userCode: addCode, displayName: addName,
        role: addRole, shiftId: addShift || undefined,
      })
      if (!res.ok) { setError(res.error ?? 'Failed'); return }
      setAddOpen(false); setAddCode(''); setAddName(''); setAddRole('OPERATOR'); setAddShift('')
      router.refresh()
    })
  }

  function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editUser) return
    setError('')
    startTransition(async () => {
      const res = await updateShopfloorUser({
        id: editUser.id, displayName: editName,
        role: editRole, shiftId: editShift || null, isActive: editActive,
      })
      if (!res.ok) { setError(res.error ?? 'Failed'); return }
      setEditUser(null); router.refresh()
    })
  }

  function handleDelete(id: string, name: string) {
    if (!confirm(`Delete user "${name}"? This cannot be undone.`)) return
    startTransition(async () => {
      await deleteShopfloorUser(id)
      router.refresh()
    })
  }

  function handleToggle(id: string, current: boolean) {
    startTransition(async () => {
      await toggleShopfloorUser(id, !current)
      router.refresh()
    })
  }

  // CSV export
  function handleCsvExport() {
    const rows = [
      ['User Code', 'Display Name', 'Role', 'Shift', 'Active'],
      ...users.map(u => [u.user_code, u.display_name, u.role, u.shift?.shift_name ?? '', u.is_active ? 'Yes' : 'No']),
    ]
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'users.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-8 space-y-5">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search users…"
            className="w-full h-10 pl-9 pr-3 rounded-lg bg-card border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <button onClick={handleCsvExport} className="h-10 px-4 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors">
          Export CSV
        </button>
        <button onClick={() => { setAddOpen(true); setError('') }} className="h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-bold flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add User
        </button>
      </div>

      {/* Active users table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              {['Code', 'Name', 'Role', 'Shift', ''].map(h => (
                <th key={h} className="text-left text-xs font-semibold uppercase tracking-widest text-muted-foreground px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {activeUsers.map(u => (
              <tr key={u.id} className="bg-card hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-foreground">{u.user_code}</td>
                <td className="px-4 py-3 font-medium text-foreground">{u.display_name}</td>
                <td className="px-4 py-3">
                  <span className="text-xs font-semibold text-muted-foreground border border-border rounded px-2 py-0.5">{u.role}</span>
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs w-full">{u.shift?.shift_name ?? '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 justify-end">
                    <button onClick={() => openEdit(u)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" aria-label="Edit user">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(u.id, u.display_name)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" aria-label="Delete user">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {activeUsers.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">No active users found.</p>
        )}
      </div>

      {/* Inactive users — collapsible */}
      {inactiveUsers.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => setShowInactive(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
          >
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Inactive Users ({inactiveUsers.length})
            </span>
            <svg
              className={`w-4 h-4 text-muted-foreground transition-transform ${showInactive ? 'rotate-180' : ''}`}
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          {showInactive && (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {inactiveUsers.map(u => (
                  <tr key={u.id} className="bg-card/50 opacity-60 hover:opacity-80 transition-opacity">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{u.user_code}</td>
                    <td className="px-4 py-3 font-medium text-muted-foreground">{u.display_name}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-semibold text-muted-foreground border border-border rounded px-2 py-0.5">{u.role}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs w-full">{u.shift?.shift_name ?? '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <button onClick={() => openEdit(u)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" aria-label="Edit user">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(u.id, u.display_name)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" aria-label="Delete user">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Add modal */}
      <CrudModal title="Add User" open={addOpen} onClose={() => setAddOpen(false)}>
        <form onSubmit={handleAdd} className="space-y-4">
          <FormField label="User Code"><input value={addCode} onChange={e => setAddCode(e.target.value.toUpperCase())} required className={inputCls} placeholder="OP003" /></FormField>
          <FormField label="Display Name"><input value={addName} onChange={e => setAddName(e.target.value)} required className={inputCls} placeholder="John Smith" /></FormField>
          <FormField label="Role">
            <select value={addRole} onChange={e => setAddRole(e.target.value)} className={selectCls}>
              {ROLES.map(r => <option key={r}>{r}</option>)}
            </select>
          </FormField>
          <FormField label="Shift (optional)">
            <select value={addShift} onChange={e => setAddShift(e.target.value)} className={selectCls}>
              <option value="">— None —</option>
              {shifts.map(s => <option key={s.id} value={s.id}>{s.shift_name}</option>)}
            </select>
          </FormField>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <ModalFooter onClose={() => setAddOpen(false)} pending={pending} submitLabel="Add User" />
        </form>
      </CrudModal>

      {/* Edit modal */}
      <CrudModal title="Edit User" open={!!editUser} onClose={() => setEditUser(null)}>
        <form onSubmit={handleEdit} className="space-y-4">
          <FormField label="User Code">
            <input value={editUser?.user_code ?? ''} disabled className={inputCls + ' opacity-50'} />
          </FormField>
          <FormField label="Display Name"><input value={editName} onChange={e => setEditName(e.target.value)} required className={inputCls} /></FormField>
          <FormField label="Role">
            <select value={editRole} onChange={e => setEditRole(e.target.value)} className={selectCls}>
              {ROLES.map(r => <option key={r}>{r}</option>)}
            </select>
          </FormField>
          <FormField label="Shift">
            <select value={editShift} onChange={e => setEditShift(e.target.value)} className={selectCls}>
              <option value="">— None —</option>
              {shifts.map(s => <option key={s.id} value={s.id}>{s.shift_name}</option>)}
            </select>
          </FormField>
          <FormField label="Status">
            <select value={editActive ? 'active' : 'inactive'} onChange={e => setEditActive(e.target.value === 'active')} className={selectCls}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </FormField>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <ModalFooter onClose={() => setEditUser(null)} pending={pending} />
        </form>
      </CrudModal>
    </div>
  )
}

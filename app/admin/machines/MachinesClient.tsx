'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createMachine, updateMachine, deleteMachine } from '@/lib/actions/admin'
import { CrudModal, FormField, inputCls, ModalFooter } from '../_components/CrudModal'
import { Plus, Pencil, Trash2, Search } from 'lucide-react'

type Machine = { id: string; machine_code: string; description?: string | null; is_active: boolean }

export function MachinesClient({ machines }: { machines: Machine[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')

  // Add
  const [addOpen, setAddOpen] = useState(false)
  const [addCode, setAddCode] = useState('')
  const [addDesc, setAddDesc] = useState('')

  // Edit
  const [editM, setEditM] = useState<Machine | null>(null)
  const [editCode, setEditCode] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editActive, setEditActive] = useState(true)

  function openEdit(m: Machine) {
    setEditM(m); setEditCode(m.machine_code); setEditDesc(m.description ?? ''); setEditActive(m.is_active); setError('')
  }

  const naturalSort = (a: Machine, b: Machine) =>
    a.machine_code.localeCompare(b.machine_code, undefined, { numeric: true, sensitivity: 'base' })

  const matchesSearch = (m: Machine) =>
    m.machine_code.toLowerCase().includes(search.toLowerCase()) ||
    (m.description ?? '').toLowerCase().includes(search.toLowerCase())

  const activeMachines = machines.filter(m => m.is_active && matchesSearch(m)).sort(naturalSort)
  const inactiveMachines = machines.filter(m => !m.is_active && matchesSearch(m)).sort(naturalSort)

  const [showInactive, setShowInactive] = useState(false)

  function handleAdd(e: React.FormEvent) {
    e.preventDefault(); setError('')
    startTransition(async () => {
      const res = await createMachine({ machineCode: addCode, description: addDesc })
      if (!res.ok) { setError(res.error ?? 'Failed'); return }
      setAddOpen(false); setAddCode(''); setAddDesc(''); router.refresh()
    })
  }

  function handleEdit(e: React.FormEvent) {
    e.preventDefault(); if (!editM) return; setError('')
    startTransition(async () => {
      const res = await updateMachine({ id: editM.id, machineCode: editCode, description: editDesc, isActive: editActive })
      if (!res.ok) { setError(res.error ?? 'Failed'); return }
      setEditM(null); router.refresh()
    })
  }

  // Delete
  const [deleteM, setDeleteM] = useState<Machine | null>(null)

  function handleDelete() {
    if (!deleteM) return
    setError('')
    startTransition(async () => {
      const res = await deleteMachine(deleteM.id)
      if (!res.ok) {
        setError(res.error?.includes('foreign key') || res.error?.includes('violates')
          ? `Cannot delete "${deleteM.machine_code}" — it has existing sessions. Set it to Inactive instead.`
          : (res.error ?? 'Failed to delete.'))
        return
      }
      setDeleteM(null)
      router.refresh()
    })
  }

  function handleCsvExport() {
    const rows = [['Machine Code', 'Description', 'Active'], ...machines.map(m => [m.machine_code, m.description ?? '', m.is_active ? 'Yes' : 'No'])]
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'machines.csv'; a.click()
  }

  return (
    <div className="p-8 space-y-5">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search machines…"
            className="w-full h-10 pl-9 pr-3 rounded-lg bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <button onClick={handleCsvExport} className="h-10 px-4 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors">Export CSV</button>
        <button onClick={() => { setAddOpen(true); setError('') }} className="h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-bold flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Machine
        </button>
      </div>

      {/* Active machines */}
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>{['Code', 'Description', ''].map(h => (
              <th key={h} className="text-left text-xs font-semibold uppercase tracking-widest text-muted-foreground px-4 py-3">{h}</th>
            ))}</tr>
          </thead>
          <tbody className="divide-y divide-border">
            {activeMachines.map(m => (
              <tr key={m.id} className="bg-card hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-mono font-semibold text-foreground">{m.machine_code}</td>
                <td className="px-4 py-3 text-muted-foreground w-full">{m.description ?? '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => openEdit(m)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground" aria-label="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => { setDeleteM(m); setError('') }} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive" aria-label="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {activeMachines.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No active machines found.</p>}
      </div>

      {/* Inactive machines — collapsible */}
      {inactiveMachines.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => setShowInactive(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
          >
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Inactive Machines ({inactiveMachines.length})
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
                {inactiveMachines.map(m => (
                  <tr key={m.id} className="bg-card/50 opacity-60 hover:opacity-80 transition-opacity">
                    <td className="px-4 py-3 font-mono font-semibold text-muted-foreground">{m.machine_code}</td>
                    <td className="px-4 py-3 text-muted-foreground w-full">{m.description ?? '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => openEdit(m)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground" aria-label="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => { setDeleteM(m); setError('') }} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive" aria-label="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <CrudModal title="Add Machine" open={addOpen} onClose={() => setAddOpen(false)}>
        <form onSubmit={handleAdd} className="space-y-4">
          <FormField label="Machine Code"><input value={addCode} onChange={e => setAddCode(e.target.value.toUpperCase())} required className={inputCls} placeholder="M003" /></FormField>
          <FormField label="Description"><input value={addDesc} onChange={e => setAddDesc(e.target.value)} className={inputCls} placeholder="CNC Lathe — Bay 3" /></FormField>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <ModalFooter onClose={() => setAddOpen(false)} pending={pending} submitLabel="Add Machine" />
        </form>
      </CrudModal>

      <CrudModal title="Delete Machine" open={!!deleteM} onClose={() => { setDeleteM(null); setError('') }}>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Are you sure you want to permanently delete{' '}
            <span className="font-mono font-bold text-foreground">{deleteM?.machine_code}</span>?
            This cannot be undone. If this machine has sessions, set it to <strong>Inactive</strong> instead.
          </p>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-3 pt-2 border-t border-border">
            <button type="button" onClick={() => { setDeleteM(null); setError('') }} disabled={pending}
              className="flex-1 h-10 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors disabled:opacity-40">
              Cancel
            </button>
            <button type="button" onClick={handleDelete} disabled={pending}
              className="flex-1 h-10 rounded-lg bg-destructive text-destructive-foreground text-sm font-bold uppercase tracking-widest disabled:opacity-40 transition-opacity">
              {pending ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      </CrudModal>

      <CrudModal title="Edit Machine" open={!!editM} onClose={() => setEditM(null)}>
        <form onSubmit={handleEdit} className="space-y-4">
          <FormField label="Machine Code"><input value={editCode} onChange={e => setEditCode(e.target.value.toUpperCase())} required className={inputCls} /></FormField>
          <FormField label="Description"><input value={editDesc} onChange={e => setEditDesc(e.target.value)} className={inputCls} /></FormField>
          <FormField label="Status">
            <select value={editActive ? 'active' : 'inactive'} onChange={e => setEditActive(e.target.value === 'active')} className="w-full h-10 px-3 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </FormField>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <ModalFooter onClose={() => setEditM(null)} pending={pending} />
        </form>
      </CrudModal>
    </div>
  )
}

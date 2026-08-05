'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createPauseReason, updatePauseReason, deletePauseReason } from '@/lib/actions/admin'
import { CrudModal, FormField, inputCls, ModalFooter } from '../_components/CrudModal'
import { Plus, Pencil, Trash2 } from 'lucide-react'

type Reason = { id: string; label: string; applies_to?: string[] | null; is_active: boolean }

const SESSION_TYPES = ['SETUP', 'RUN']

export function PauseReasonsClient({ reasons }: { reasons: Reason[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')

  // Add
  const [addOpen, setAddOpen] = useState(false)
  const [addLabel, setAddLabel] = useState('')
  const [addApplies, setAddApplies] = useState<string[]>(['SETUP', 'RUN'])

  // Edit
  const [editR, setEditR] = useState<Reason | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editApplies, setEditApplies] = useState<string[]>([])
  const [editActive, setEditActive] = useState(true)

  function openEdit(r: Reason) {
    setEditR(r); setEditLabel(r.label); setEditApplies(r.applies_to ?? ['SETUP', 'RUN']); setEditActive(r.is_active); setError('')
  }

  function toggleApplies(arr: string[], set: (v: string[]) => void, val: string) {
    set(arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val])
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault(); setError('')
    startTransition(async () => {
      const res = await createPauseReason(addLabel)
      if (!res.ok) { setError(res.error ?? 'Failed'); return }
      setAddOpen(false); setAddLabel(''); router.refresh()
    })
  }

  function handleEdit(e: React.FormEvent) {
    e.preventDefault(); if (!editR) return; setError('')
    startTransition(async () => {
      const res = await updatePauseReason({ id: editR.id, label: editLabel, appliesTo: editApplies, isActive: editActive })
      if (!res.ok) { setError(res.error ?? 'Failed'); return }
      setEditR(null); router.refresh()
    })
  }

  function handleDelete(id: string, label: string) {
    if (!confirm(`Delete pause reason "${label}"?`)) return
    startTransition(async () => { await deletePauseReason(id); router.refresh() })
  }

  return (
    <div className="p-8 space-y-5">
      <div className="flex justify-end">
        <button onClick={() => { setAddOpen(true); setError('') }} className="h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-bold flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Reason
        </button>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>{['Label', 'Applies To', 'Status', ''].map(h => (
              <th key={h} className="text-left text-xs font-semibold uppercase tracking-widest text-muted-foreground px-4 py-3">{h}</th>
            ))}</tr>
          </thead>
          <tbody className="divide-y divide-border">
            {reasons.map(r => (
              <tr key={r.id} className="bg-card hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-medium text-foreground">{r.label}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1.5 flex-wrap">
                    {(r.applies_to ?? ['SETUP', 'RUN']).map(t => (
                      <span key={t} className="text-[11px] font-semibold px-2 py-0.5 rounded bg-primary/10 text-primary">{t}</span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${r.is_active ? 'bg-status-running/20 text-status-running' : 'bg-muted text-muted-foreground'}`}>
                    {r.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => openEdit(r)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground" aria-label="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => handleDelete(r.id, r.label)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive" aria-label="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {reasons.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No pause reasons yet.</p>}
      </div>

      {/* Add */}
      <CrudModal title="Add Pause Reason" open={addOpen} onClose={() => setAddOpen(false)}>
        <form onSubmit={handleAdd} className="space-y-4">
          <FormField label="Label"><input value={addLabel} onChange={e => setAddLabel(e.target.value)} required className={inputCls} placeholder="Awaiting Materials" /></FormField>
          <FormField label="Applies To">
            <div className="flex gap-3 mt-1">
              {SESSION_TYPES.map(t => (
                <label key={t} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={addApplies.includes(t)} onChange={() => toggleApplies(addApplies, setAddApplies, t)}
                    className="w-4 h-4 rounded border-border accent-primary" />
                  <span className="text-sm text-foreground">{t}</span>
                </label>
              ))}
            </div>
          </FormField>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <ModalFooter onClose={() => setAddOpen(false)} pending={pending} submitLabel="Add Reason" />
        </form>
      </CrudModal>

      {/* Edit */}
      <CrudModal title="Edit Pause Reason" open={!!editR} onClose={() => setEditR(null)}>
        <form onSubmit={handleEdit} className="space-y-4">
          <FormField label="Label"><input value={editLabel} onChange={e => setEditLabel(e.target.value)} required className={inputCls} /></FormField>
          <FormField label="Applies To">
            <div className="flex gap-3 mt-1">
              {SESSION_TYPES.map(t => (
                <label key={t} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={editApplies.includes(t)} onChange={() => toggleApplies(editApplies, setEditApplies, t)}
                    className="w-4 h-4 rounded border-border accent-primary" />
                  <span className="text-sm text-foreground">{t}</span>
                </label>
              ))}
            </div>
          </FormField>
          <FormField label="Status">
            <select value={editActive ? 'active' : 'inactive'} onChange={e => setEditActive(e.target.value === 'active')} className="w-full h-10 px-3 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="active">Active</option><option value="inactive">Inactive</option>
            </select>
          </FormField>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <ModalFooter onClose={() => setEditR(null)} pending={pending} />
        </form>
      </CrudModal>
    </div>
  )
}

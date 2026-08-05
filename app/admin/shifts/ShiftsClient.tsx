'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createShiftPattern, updateShiftPattern, deleteShiftPattern } from '@/lib/actions/admin'
import { CrudModal, FormField, inputCls, ModalFooter } from '../_components/CrudModal'
import { Plus, Pencil, Trash2 } from 'lucide-react'

type Shift = { id: string; name: string; start_time: string; end_time: string; break_minutes: number }

export function ShiftsClient({ shifts }: { shifts: Shift[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')

  // Add
  const [addOpen, setAddOpen] = useState(false)
  const [addName, setAddName] = useState('')
  const [addStart, setAddStart] = useState('06:00')
  const [addEnd, setAddEnd] = useState('14:00')
  const [addBreak, setAddBreak] = useState(30)

  // Edit
  const [editS, setEditS] = useState<Shift | null>(null)
  const [editName, setEditName] = useState('')
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')
  const [editBreak, setEditBreak] = useState(30)


  function openEdit(s: Shift) {
    setEditS(s); setEditName(s.name); setEditStart(s.start_time.slice(0, 5)); setEditEnd(s.end_time.slice(0, 5)); setEditBreak(s.break_minutes ?? 0); setError('')
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault(); setError('')
    startTransition(async () => {
      const res = await createShiftPattern({ shiftName: addName, startTime: addStart, endTime: addEnd, breakMinutes: addBreak })
      if (!res.ok) { setError(res.error ?? 'Failed'); return }
      setAddOpen(false); setAddName(''); setAddBreak(30); router.refresh()
    })
  }

  function handleEdit(e: React.FormEvent) {
    e.preventDefault(); if (!editS) return; setError('')
    startTransition(async () => {
      const res = await updateShiftPattern({ id: editS.id, shiftName: editName, startTime: editStart, endTime: editEnd, breakMinutes: editBreak, isActive: true })
      if (!res.ok) { setError(res.error ?? 'Failed'); return }
      setEditS(null); router.refresh()
    })
  }

  function handleDelete(id: string, name: string) {
    if (!confirm(`Delete shift "${name}"?`)) return
    startTransition(async () => { await deleteShiftPattern(id); router.refresh() })
  }

  return (
    <div className="p-8 space-y-5">
      <div className="flex justify-end">
        <button onClick={() => { setAddOpen(true); setError('') }} className="h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-bold flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Shift
        </button>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>{['Shift Name', 'Start', 'End', 'Duration', 'Break', ''].map(h => (
              <th key={h} className="text-left text-xs font-semibold uppercase tracking-widest text-muted-foreground px-4 py-3">{h}</th>
            ))}</tr>
          </thead>
          <tbody className="divide-y divide-border">
            {shifts.map(s => {
              const [sh, sm] = s.start_time.split(':').map(Number)
              const [eh, em] = s.end_time.split(':').map(Number)
              const dur = ((eh * 60 + em) - (sh * 60 + sm) + 1440) % 1440
              const durStr = `${Math.floor(dur / 60)}h ${dur % 60}m`
              return (
                <tr key={s.id} className="bg-card hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-semibold text-foreground">{s.name}</td>
                  <td className="px-4 py-3 font-mono text-foreground">{s.start_time.slice(0, 5)}</td>
                  <td className="px-4 py-3 font-mono text-foreground">{s.end_time.slice(0, 5)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{durStr}</td>
                  <td className="px-4 py-3 text-muted-foreground">{s.break_minutes ? `${s.break_minutes}m` : '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground" aria-label="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDelete(s.id, s.name)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive" aria-label="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {shifts.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No shift patterns yet.</p>}
      </div>

      <CrudModal title="Add Shift" open={addOpen} onClose={() => setAddOpen(false)}>
        <form onSubmit={handleAdd} className="space-y-4">
          <FormField label="Shift Name"><input value={addName} onChange={e => setAddName(e.target.value)} required className={inputCls} placeholder="Morning Shift" /></FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Start Time"><input type="time" value={addStart} onChange={e => setAddStart(e.target.value)} required className={inputCls} /></FormField>
            <FormField label="End Time"><input type="time" value={addEnd} onChange={e => setAddEnd(e.target.value)} required className={inputCls} /></FormField>
          </div>
          <FormField label="Break Duration (minutes)">
            <input type="number" min={0} max={120} value={addBreak} onChange={e => setAddBreak(Number(e.target.value))} className={inputCls} />
          </FormField>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <ModalFooter onClose={() => setAddOpen(false)} pending={pending} submitLabel="Add Shift" />
        </form>
      </CrudModal>

      <CrudModal title="Edit Shift" open={!!editS} onClose={() => setEditS(null)}>
        <form onSubmit={handleEdit} className="space-y-4">
          <FormField label="Shift Name"><input value={editName} onChange={e => setEditName(e.target.value)} required className={inputCls} /></FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Start Time"><input type="time" value={editStart} onChange={e => setEditStart(e.target.value)} required className={inputCls} /></FormField>
            <FormField label="End Time"><input type="time" value={editEnd} onChange={e => setEditEnd(e.target.value)} required className={inputCls} /></FormField>
          </div>
          <FormField label="Break Duration (minutes)">
            <input type="number" min={0} max={120} value={editBreak} onChange={e => setEditBreak(Number(e.target.value))} className={inputCls} />
          </FormField>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <ModalFooter onClose={() => setEditS(null)} pending={pending} />
        </form>
      </CrudModal>
    </div>
  )
}

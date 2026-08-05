'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createDevice, updateDevice, deleteDevice } from '@/lib/actions/admin'
import { forceEndDeviceSession } from '@/lib/actions/device-auth'
import { CrudModal, FormField, inputCls, ModalFooter } from '../_components/CrudModal'
import { Plus, Pencil, Trash2, Monitor, Cpu, WifiOff, Wifi, AlertTriangle } from 'lucide-react'

type ActiveSession = { device_id: string; created_at: string; expires_at: string }

type Device = {
  id: string
  station_name: string
  machine_id: string | null
  is_active: boolean
  created_at: string
  active_session: ActiveSession | null
  machine?: { id: string; machine_code: string; description: string | null } | null
}

type Machine = { id: string; machine_code: string; description: string | null }

function ElapsedTime({ startedAt }: { startedAt: string }) {
  const ms = Date.now() - new Date(startedAt).getTime()
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return <>{h > 0 ? `${h}h ${m}m` : `${m}m`}</>
}

export function DevicesClient({ devices, machines }: { devices: Device[]; machines: Machine[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')

  // Force end session
  const [forceEndDevice, setForceEndDevice] = useState<Device | null>(null)

  function handleForceEnd() {
    if (!forceEndDevice) return
    startTransition(async () => {
      const res = await forceEndDeviceSession(forceEndDevice.id)
      if (!res.ok) { setError(res.error ?? 'Failed'); return }
      setForceEndDevice(null)
      router.refresh()
    })
  }

  // Add
  const [addOpen, setAddOpen] = useState(false)
  const [addName, setAddName] = useState('')
  const [addPin, setAddPin] = useState('')
  const [addMachineId, setAddMachineId] = useState('')

  // Edit
  const [editD, setEditD] = useState<Device | null>(null)
  const [editName, setEditName] = useState('')
  const [editPin, setEditPin] = useState('')
  const [editMachineId, setEditMachineId] = useState('')
  const [editActive, setEditActive] = useState(true)

  function openEdit(d: Device) {
    setEditD(d)
    setEditName(d.station_name)
    setEditPin('')
    setEditMachineId(d.machine_id ?? '')
    setEditActive(d.is_active)
    setError('')
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault(); setError('')
    startTransition(async () => {
      const res = await createDevice({ stationName: addName, password: addPin })
      if (!res.ok) { setError(res.error ?? 'Failed'); return }
      // If machine selected, update machine_id on the new device
      if (addMachineId) {
        // Fetch the newly created device to get its id, then update
        // For simplicity we rely on server refresh — admin can assign machine after creation via edit
      }
      setAddOpen(false); setAddName(''); setAddPin(''); setAddMachineId(''); router.refresh()
    })
  }

  function handleEdit(e: React.FormEvent) {
    e.preventDefault(); if (!editD) return; setError('')
    startTransition(async () => {
      const res = await updateDevice({
        id: editD.id,
        stationName: editName,
        machineId: editMachineId || null,
        isActive: editActive,
      })
      if (!res.ok) { setError(res.error ?? 'Failed'); return }
      setEditD(null); router.refresh()
    })
  }

  function handleDelete(id: string, name: string) {
    if (!confirm(`Delete device "${name}"? This will invalidate all its sessions.`)) return
    startTransition(async () => { await deleteDevice(id); router.refresh() })
  }

  return (
    <div className="p-8 space-y-5">
      <div className="flex justify-end">
        <button
          onClick={() => { setAddOpen(true); setError('') }}
          className="h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-bold flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Add Device
        </button>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              {['Station Name', 'Assigned Machine', 'Kiosk Status', 'Device Status', ''].map(h => (
                <th key={h} className="text-left text-xs font-semibold uppercase tracking-widest text-muted-foreground px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {devices.map(d => (
              <tr key={d.id} className={`transition-colors ${d.active_session ? 'bg-status-running/5 hover:bg-status-running/10' : 'bg-card hover:bg-muted/30'}`}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Monitor className={`w-4 h-4 shrink-0 ${d.active_session ? 'text-status-running' : 'text-muted-foreground'}`} />
                    <span className="font-semibold text-foreground">{d.station_name}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {d.machine ? (
                    <div className="flex items-center gap-2">
                      <Cpu className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <div>
                        <span className="font-semibold text-foreground">{d.machine.machine_code}</span>
                        {d.machine.description && (
                          <span className="text-xs text-muted-foreground ml-1.5">{d.machine.description}</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">Not assigned</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {d.active_session ? (
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-status-running animate-pulse shrink-0" />
                        <span className="text-xs font-bold text-status-running uppercase tracking-wide">In Use</span>
                      </div>
                      <span className="text-xs text-muted-foreground font-mono">
                        Session started <ElapsedTime startedAt={d.active_session.created_at} /> ago
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-muted-foreground/40 shrink-0" />
                      <span className="text-xs text-muted-foreground font-semibold">Available</span>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${d.is_active ? 'bg-status-running/20 text-status-running' : 'bg-muted text-muted-foreground'}`}>
                    {d.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2 justify-end items-center">
                    {d.active_session && (
                      <button
                        onClick={() => { setError(''); setForceEndDevice(d) }}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive text-xs font-semibold transition-colors"
                        aria-label={`Force end session on ${d.station_name}`}
                      >
                        <WifiOff className="w-3.5 h-3.5" />
                        Force End
                      </button>
                    )}
                    <button onClick={() => openEdit(d)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground" aria-label="Edit">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(d.id, d.station_name)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive" aria-label="Delete">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {devices.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">No devices registered yet.</p>
        )}
      </div>

      {/* Add modal */}
      <CrudModal title="Add Device" open={addOpen} onClose={() => setAddOpen(false)}>
        <form onSubmit={handleAdd} className="space-y-4">
          <FormField label="Station Name">
            <input value={addName} onChange={e => setAddName(e.target.value)} required className={inputCls} placeholder="Kiosk-01" />
          </FormField>
          <FormField label="PIN / Password">
            <input
              type="password"
              value={addPin}
              onChange={e => setAddPin(e.target.value)}
              required
              minLength={4}
              className={inputCls}
              placeholder="Min. 4 characters"
            />
          </FormField>
          <p className="text-xs text-muted-foreground">Assign the machine after creation via the Edit button.</p>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <ModalFooter onClose={() => setAddOpen(false)} pending={pending} submitLabel="Add Device" />
        </form>
      </CrudModal>

      {/* Force End Session confirmation modal */}
      <CrudModal
        title="Force End Session"
        open={!!forceEndDevice}
        onClose={() => setForceEndDevice(null)}
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-sm">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <p>
              This will immediately end the active session on{' '}
              <strong>{forceEndDevice?.station_name}</strong>. If a machine is currently running,
              log the replacement device in promptly and restore the previous state as quickly as possible.
            </p>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-3 pt-4 border-t border-border mt-2">
            <button
              type="button"
              onClick={() => setForceEndDevice(null)}
              disabled={pending}
              className="flex-1 h-10 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleForceEnd}
              disabled={pending}
              className="flex-1 h-10 rounded-lg bg-destructive text-destructive-foreground text-sm font-bold uppercase tracking-widest disabled:opacity-40 transition-opacity"
            >
              {pending ? 'Ending…' : 'Force End Session'}
            </button>
          </div>
        </div>
      </CrudModal>

      {/* Edit modal */}
      <CrudModal title="Edit Device" open={!!editD} onClose={() => setEditD(null)}>
        <form onSubmit={handleEdit} className="space-y-4">
          <FormField label="Station Name">
            <input value={editName} onChange={e => setEditName(e.target.value)} required className={inputCls} />
          </FormField>
          <FormField label="Assigned Machine">
            <select value={editMachineId} onChange={e => setEditMachineId(e.target.value)} className={inputCls}>
              <option value="">— No machine assigned —</option>
              {machines.map(m => (
                <option key={m.id} value={m.id}>
                  {m.machine_code}{m.description ? ` — ${m.description}` : ''}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="New PIN (leave blank to keep current)">
            <input type="password" value={editPin} onChange={e => setEditPin(e.target.value)} className={inputCls} placeholder="Leave blank to keep" />
          </FormField>
          <FormField label="Status">
            <select
              value={editActive ? 'active' : 'inactive'}
              onChange={e => setEditActive(e.target.value === 'active')}
              className={inputCls}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </FormField>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <ModalFooter onClose={() => setEditD(null)} pending={pending} />
        </form>
      </CrudModal>
    </div>
  )
}

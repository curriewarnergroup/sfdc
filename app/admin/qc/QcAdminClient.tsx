'use client'

import { useState, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'
import {
  createCheckTemplate,
  updateCheckTemplate,
  importMoChecksFromExcel,
  getMoCheckAssignments,
  addMoCheckAssignment,
  removeMoCheckAssignment,
} from '@/lib/actions/admin'

// ---- Types ----
interface CheckTemplate {
  id: string
  name: string
  description: string | null
  input_type: 'PASS_FAIL' | 'NUMERIC' | 'TEXT'
  target_value: number | null
  tolerance_plus: number | null
  tolerance_minus: number | null
  unit: string | null
  product_id: string | null
  is_active: boolean
  created_at: string
}

interface CheckResult {
  id: string
  mo_number: string
  product_id: string | null
  result: 'PASS' | 'FAIL' | null
  numeric_value: number | null
  checked_at: string
  template: { name: string; input_type: string; target_value: number | null; tolerance_plus: number | null; tolerance_minus: number | null; unit: string | null } | null
  checker: { display_name: string } | null
  machine: { machine_code: string } | null
}

interface MoSummary {
  mo_number: string
  product_id: string | null
}

interface Assignment {
  id: string
  mo_number: string
  product_id: string | null
  required: boolean
  order_index: number
  template: CheckTemplate | null
}

interface Props {
  templates: CheckTemplate[]
  results: CheckResult[]
  moList: MoSummary[]
}

const INPUT_TYPE_LABELS: Record<string, string> = {
  PASS_FAIL: 'Pass / Fail',
  NUMERIC: 'Numeric',
  TEXT: 'Text',
}

// ---- Template form modal ----
function TemplateModal({
  initial,
  onClose,
  onSaved,
}: {
  initial?: CheckTemplate
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    description: initial?.description ?? '',
    input_type: initial?.input_type ?? 'PASS_FAIL' as 'PASS_FAIL' | 'NUMERIC' | 'TEXT',
    target_value: initial?.target_value?.toString() ?? '',
    tolerance_plus: initial?.tolerance_plus?.toString() ?? '',
    tolerance_minus: initial?.tolerance_minus?.toString() ?? '',
    unit: initial?.unit ?? '',
    product_id: initial?.product_id ?? '',
    is_active: initial?.is_active ?? true,
  })
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    startTransition(async () => {
      const payload = {
        name: form.name,
        description: form.description,
        input_type: form.input_type,
        target_value: form.target_value ? parseFloat(form.target_value) : null,
        tolerance_plus: form.tolerance_plus ? parseFloat(form.tolerance_plus) : null,
        tolerance_minus: form.tolerance_minus ? parseFloat(form.tolerance_minus) : null,
        unit: form.unit,
        product_id: form.product_id,
        is_active: form.is_active,
      }
      const result = initial
        ? await updateCheckTemplate(initial.id, payload)
        : await createCheckTemplate(payload)
      if (!result.ok) { setError(result.error ?? 'Failed'); return }
      onSaved()
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg p-6 flex flex-col gap-5">
        <h2 className="text-lg font-bold text-foreground">{initial ? 'Edit Check Template' : 'New Check Template'}</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Check Name *</label>
              <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Product ID</label>
              <input value={form.product_id} onChange={e => setForm(f => ({ ...f, product_id: e.target.value }))}
                placeholder="e.g. PART-001"
                className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Input Type *</label>
              <select value={form.input_type} onChange={e => setForm(f => ({ ...f, input_type: e.target.value as any }))}
                className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground">
                <option value="PASS_FAIL">Pass / Fail</option>
                <option value="NUMERIC">Numeric</option>
                <option value="TEXT">Text</option>
              </select>
            </div>
            {form.input_type === 'NUMERIC' && (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Target Value</label>
                  <input type="number" step="any" value={form.target_value} onChange={e => setForm(f => ({ ...f, target_value: e.target.value }))}
                    className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Unit</label>
                  <input value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                    placeholder="mm, kg, N·m…"
                    className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Tolerance +</label>
                  <input type="number" step="any" value={form.tolerance_plus} onChange={e => setForm(f => ({ ...f, tolerance_plus: e.target.value }))}
                    className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Tolerance -</label>
                  <input type="number" step="any" value={form.tolerance_minus} onChange={e => setForm(f => ({ ...f, tolerance_minus: e.target.value }))}
                    className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground" />
                </div>
              </>
            )}
            <div className="col-span-2 flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Description</label>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={2} className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground resize-none" />
            </div>
            {initial && (
              <div className="col-span-2 flex items-center gap-2">
                <input type="checkbox" id="is_active" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="w-4 h-4" />
                <label htmlFor="is_active" className="text-sm text-foreground">Active</label>
              </div>
            )}
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 h-10 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted/30">Cancel</button>
            <button type="submit" disabled={pending} className="flex-1 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
              {pending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---- Excel Import ----
function ExcelImport({ onImported }: { onImported: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<any[]>([])
  const [importing, startImport] = useTransition()
  const [msg, setMsg] = useState('')

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target?.result, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' })
      setPreview(rows.slice(0, 5))
      setMsg(`${rows.length} rows found. Click Import to proceed.`)

      startImport(async () => {
        const mapped = rows.map(r => ({
          mo_number: String(r['mo_number'] ?? r['MO Number'] ?? r['MO'] ?? '').trim(),
          product_id: String(r['product_id'] ?? r['Product ID'] ?? r['Part Number'] ?? '').trim(),
          check_name: String(r['check_name'] ?? r['Check Name'] ?? r['Check'] ?? '').trim(),
          input_type: (String(r['input_type'] ?? r['Input Type'] ?? 'PASS_FAIL').trim().toUpperCase().replace(' ', '_') || 'PASS_FAIL') as any,
          target_value: r['target_value'] ?? r['Target'] ? parseFloat(r['target_value'] ?? r['Target']) : null,
          tolerance_plus: r['tolerance_plus'] ?? r['Tol+'] ? parseFloat(r['tolerance_plus'] ?? r['Tol+']) : null,
          tolerance_minus: r['tolerance_minus'] ?? r['Tol-'] ? parseFloat(r['tolerance_minus'] ?? r['Tol-']) : null,
          unit: String(r['unit'] ?? r['Unit'] ?? '').trim(),
          required: String(r['required'] ?? r['Required'] ?? 'true').toLowerCase() !== 'false',
        })).filter(r => r.mo_number && r.check_name)

        const result = await importMoChecksFromExcel(mapped)
        if (result.ok) {
          setMsg(`Imported ${result.data?.imported ?? 0} check assignments successfully.`)
          onImported()
        } else {
          setMsg(`Import failed: ${result.error}`)
        }
      })
    }
    reader.readAsArrayBuffer(file)
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-foreground">Excel Import</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Columns: <span className="font-mono">mo_number, product_id, check_name, input_type, target_value, tolerance_plus, tolerance_minus, unit, required</span>
          </p>
        </div>
        <button onClick={() => fileRef.current?.click()}
          className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90">
          Choose File
        </button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
      </div>
      {msg && <p className="text-sm text-foreground">{msg}</p>}
      {preview.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="text-xs w-full">
            <thead className="bg-muted/50">
              <tr>{Object.keys(preview[0]).map(k => <th key={k} className="px-3 py-2 text-left text-muted-foreground font-semibold">{k}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {preview.map((r, i) => (
                <tr key={i}>{Object.values(r).map((v, j) => <td key={j} className="px-3 py-1.5 text-foreground">{String(v)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---- MO Assignments Tab ----
function MoAssignmentsTab({ templates, moList }: { templates: CheckTemplate[]; moList: MoSummary[] }) {
  const router = useRouter()
  const [activeMo, setActiveMo] = useState<string | null>(null)
  const [productInput, setProductInput] = useState('')
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(false)
  const [addTemplateId, setAddTemplateId] = useState('')
  const [addRequired, setAddRequired] = useState(true)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  // New MO form
  const [showNewForm, setShowNewForm] = useState(false)
  const [newMo, setNewMo] = useState('')
  const [newProduct, setNewProduct] = useState('')

  async function loadMo(mo: string, product?: string) {
    setLoading(true)
    setActiveMo(mo)
    const data = await getMoCheckAssignments(mo)
    setAssignments(data as any)
    if (product) {
      setProductInput(product)
    } else if (data.length > 0 && (data[0] as any).product_id) {
      setProductInput((data[0] as any).product_id)
    } else {
      setProductInput('')
    }
    setAddTemplateId('')
    setError('')
    setLoading(false)
  }

  function handleNewMoOpen() {
    setShowNewForm(true)
    setNewMo('')
    setNewProduct('')
  }

  function handleNewMoConfirm() {
    const mo = newMo.trim().toUpperCase()
    if (!mo) return
    setShowNewForm(false)
    loadMo(mo, newProduct.trim())
  }

  function handleAdd() {
    if (!activeMo || !addTemplateId) return
    setError('')
    startTransition(async () => {
      const result = await addMoCheckAssignment({
        mo_number: activeMo,
        product_id: productInput.trim() || undefined,
        check_template_id: addTemplateId,
        required: addRequired,
      })
      if (!result.ok) { setError(result.error ?? 'Failed'); return }
      await loadMo(activeMo)
      router.refresh()
    })
  }

  function handleRemove(id: string) {
    startTransition(async () => {
      await removeMoCheckAssignment(id)
      setAssignments(prev => prev.filter(a => a.id !== id))
      router.refresh()
    })
  }

  const activeTemplates = templates.filter(t => t.is_active)

  return (
    <div className="flex flex-col gap-0 h-full">
      {/* Two-column layout: sidebar MO list + main panel */}
      <div className="flex flex-1 min-h-0">

        {/* Left sidebar — MO list */}
        <div className="w-56 shrink-0 border-r border-border flex flex-col">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">MO Numbers</span>
            <button
              onClick={handleNewMoOpen}
              className="h-7 px-2.5 rounded-md bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors"
            >
              + New MO
            </button>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-border">
            {moList.length === 0 && !showNewForm && (
              <div className="px-4 py-6 text-center">
                <p className="text-xs text-muted-foreground mb-3">No MOs yet</p>
                <button
                  onClick={handleNewMoOpen}
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  + Add your first MO
                </button>
              </div>
            )}
            {/* New MO inline form in sidebar */}
            {showNewForm && (
              <div className="p-3 flex flex-col gap-2 bg-muted/30 border-b border-border">
                <input
                  autoFocus
                  value={newMo}
                  onChange={e => setNewMo(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && handleNewMoConfirm()}
                  placeholder="MO number e.g. MO-2401"
                  className="h-8 w-full rounded-md border border-primary bg-background px-2 text-xs text-foreground font-mono placeholder:text-muted-foreground focus:outline-none"
                />
                <input
                  value={newProduct}
                  onChange={e => setNewProduct(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleNewMoConfirm()}
                  placeholder="Product ID (optional)"
                  className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground font-mono placeholder:text-muted-foreground focus:outline-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleNewMoConfirm}
                    disabled={!newMo.trim()}
                    className="flex-1 h-7 rounded-md bg-primary text-primary-foreground text-xs font-bold disabled:opacity-40 hover:bg-primary/90"
                  >
                    Open
                  </button>
                  <button
                    onClick={() => setShowNewForm(false)}
                    className="flex-1 h-7 rounded-md bg-muted text-muted-foreground text-xs font-semibold hover:bg-muted/70"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {moList.map(m => (
              <button
                key={m.mo_number}
                onClick={() => loadMo(m.mo_number, m.product_id ?? '')}
                className={`w-full text-left px-4 py-3 flex flex-col gap-0.5 transition-colors ${
                  activeMo === m.mo_number
                    ? 'bg-primary/10 border-l-2 border-primary'
                    : 'hover:bg-muted/30 border-l-2 border-transparent'
                }`}
              >
                <span className={`text-sm font-mono font-semibold ${activeMo === m.mo_number ? 'text-primary' : 'text-foreground'}`}>
                  {m.mo_number}
                </span>
                {m.product_id && (
                  <span className="text-[11px] text-muted-foreground">{m.product_id}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Right panel — assignments */}
        <div className="flex-1 flex flex-col min-h-0 overflow-auto">
          {!activeMo ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-12">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="text-muted-foreground">
                  <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                </svg>
              </div>
              <div>
                <p className="font-semibold text-foreground">Select or create an MO</p>
                <p className="text-sm text-muted-foreground mt-1">Choose an MO from the list, or click <strong>+ New MO</strong> to set up checks for a new job.</p>
              </div>
              <button
                onClick={handleNewMoOpen}
                className="mt-2 h-9 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90"
              >
                + New MO
              </button>
            </div>
          ) : loading ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
          ) : (
            <div className="flex flex-col h-full">
              {/* Panel header */}
              <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0">
                <div>
                  <h3 className="font-semibold text-foreground">
                    Checks for <span className="font-mono text-primary">{activeMo}</span>
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {assignments.length} check{assignments.length !== 1 ? 's' : ''} assigned
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground font-semibold uppercase tracking-widest">Product ID</label>
                  <input
                    value={productInput}
                    onChange={e => setProductInput(e.target.value)}
                    placeholder="e.g. PART-001"
                    className="h-8 w-36 rounded-lg border border-border bg-background px-2 text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Assignment table */}
              <div className="flex-1 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b border-border sticky top-0">
                    <tr>
                      {['#', 'Check Name', 'Type', 'Target / Tolerance', 'Required', ''].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {assignments.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground text-sm">
                          No checks assigned yet — use the form below to add the first one.
                        </td>
                      </tr>
                    )}
                    {assignments.map((a, i) => (
                      <tr key={a.id} className="bg-card hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 text-muted-foreground text-xs font-mono">{i + 1}</td>
                        <td className="px-4 py-3 font-semibold text-foreground">{a.template?.name ?? '—'}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-muted text-foreground">
                            {INPUT_TYPE_LABELS[a.template?.input_type ?? ''] ?? a.template?.input_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                          {a.template?.input_type === 'NUMERIC' && a.template?.target_value != null
                            ? `${a.template.target_value}${a.template.unit ? ' ' + a.template.unit : ''} +${a.template.tolerance_plus ?? 0} / -${a.template.tolerance_minus ?? 0}`
                            : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-bold ${a.required ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                            {a.required ? 'Yes' : 'No'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleRemove(a.id)}
                            disabled={pending}
                            className="text-xs text-destructive hover:underline font-semibold disabled:opacity-50"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Add check footer */}
              <div className="px-6 py-4 border-t border-border bg-muted/20 shrink-0 flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1 flex-1 min-w-48">
                  <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Add Check Template</label>
                  <select
                    value={addTemplateId}
                    onChange={e => setAddTemplateId(e.target.value)}
                    className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">Select a check template…</option>
                    {activeTemplates.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name}{t.product_id ? ` — ${t.product_id}` : ''}{t.input_type === 'NUMERIC' && t.target_value != null ? ` (${t.target_value}${t.unit ? t.unit : ''})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2 pb-1">
                  <input
                    type="checkbox"
                    id="add-required"
                    checked={addRequired}
                    onChange={e => setAddRequired(e.target.checked)}
                    className="w-4 h-4 accent-primary"
                  />
                  <label htmlFor="add-required" className="text-sm text-foreground">Required</label>
                </div>
                <button
                  onClick={handleAdd}
                  disabled={!addTemplateId || pending}
                  className="h-9 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {pending ? 'Adding…' : '+ Add Check'}
                </button>
                {error && <p className="text-xs text-destructive w-full">{error}</p>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---- Main Client ----
export function QcAdminClient({ templates, results, moList }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<'templates' | 'assignments' | 'results' | 'import'>('templates')
  const [modalTemplate, setModalTemplate] = useState<CheckTemplate | 'new' | null>(null)

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">QC Checks</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Manage check templates, MO assignments and results</p>
        </div>
        <button onClick={() => setModalTemplate('new')}
          className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90">
          + New Template
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border px-6">
        {(['templates', 'assignments', 'results', 'import'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`py-3 px-4 text-sm font-semibold uppercase tracking-widest transition-colors border-b-2 -mb-px ${
              tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}>
            {t === 'templates'   ? `Templates (${templates.length})`
           : t === 'assignments' ? `MO Assignments (${moList.length})`
           : t === 'results'     ? `Results (${results.length})`
           : 'Import Excel'}
          </button>
        ))}
      </div>

      <div className="p-6 flex flex-col gap-4">
        {/* Templates tab */}
        {tab === 'templates' && (
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  {['Name', 'Product ID', 'Type', 'Target / Tolerance', 'Active', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {templates.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">No check templates yet. Create one or import from Excel.</td></tr>
                )}
                {templates.map(t => (
                  <tr key={t.id} className="bg-card hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-semibold text-foreground">{t.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{t.product_id ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-muted text-foreground">{INPUT_TYPE_LABELS[t.input_type]}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                      {t.input_type === 'NUMERIC' && t.target_value != null
                        ? `${t.target_value}${t.unit ? ' ' + t.unit : ''} +${t.tolerance_plus ?? 0} / -${t.tolerance_minus ?? 0}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold ${t.is_active ? 'text-status-running' : 'text-muted-foreground'}`}>
                        {t.is_active ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => setModalTemplate(t)}
                        className="text-xs text-primary hover:underline font-semibold">Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Results tab */}
        {tab === 'results' && (
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  {['Time', 'MO', 'Product', 'Check', 'Operator', 'Machine', 'Result', 'Value'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {results.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">No check results recorded yet.</td></tr>
                )}
                {results.map(r => (
                  <tr key={r.id} className="bg-card hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(r.checked_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3 font-mono font-semibold text-foreground">{r.mo_number}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.product_id ?? '—'}</td>
                    <td className="px-4 py-3 text-foreground">{(r as any).template?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-foreground">{(r as any).checker?.display_name ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{(r as any).machine?.machine_code ?? '—'}</td>
                    <td className="px-4 py-3">
                      {r.result ? (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${r.result === 'PASS' ? 'bg-status-running/20 text-status-running' : 'bg-destructive/20 text-destructive'}`}>
                          {r.result}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-foreground">
                      {r.numeric_value != null
                        ? `${r.numeric_value}${(r as any).template?.unit ? ' ' + (r as any).template.unit : ''}`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Assignments tab */}
        {tab === 'assignments' && (
          <MoAssignmentsTab templates={templates} moList={moList} />
        )}

        {/* Import tab */}
        {tab === 'import' && (
          <ExcelImport onImported={() => router.refresh()} />
        )}
      </div>

      {/* Template modal */}
      {modalTemplate && (
        <TemplateModal
          initial={modalTemplate === 'new' ? undefined : modalTemplate}
          onClose={() => setModalTemplate(null)}
          onSaved={() => router.refresh()}
        />
      )}
    </div>
  )
}

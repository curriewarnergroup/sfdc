'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Printer, Search, X } from 'lucide-react'
import type { PassOffRow } from '@/lib/actions/reporting'

function fmtDate(dt: string | null) {
  if (!dt) return '—'
  return new Date(dt).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function durationStr(mins: number | null) {
  if (mins == null) return '—'
  if (mins >= 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`
  return `${mins}m`
}

type Machine = { id: string; machine_code: string }
type User = { id: string; display_name: string; role: string }

type Filters = {
  from?: string
  to?: string
  mo?: string
  machineId?: string
  submittedBy?: string
  passedBy?: string
  result?: string
}

export function PassOffClient({
  rows,
  machines,
  users,
  initialFilters,
}: {
  rows: PassOffRow[]
  machines: Machine[]
  users: User[]
  initialFilters: Filters
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [from, setFrom]               = useState(initialFilters.from ?? '')
  const [to, setTo]                   = useState(initialFilters.to ?? '')
  const [mo, setMo]                   = useState(initialFilters.mo ?? '')
  const [machineId, setMachineId]     = useState(initialFilters.machineId ?? '')
  const [submittedBy, setSubmittedBy] = useState(initialFilters.submittedBy ?? '')
  const [passedBy, setPassedBy]       = useState(initialFilters.passedBy ?? '')
  const [result, setResult]           = useState(initialFilters.result ?? '')

  function push(next: Filters) {
    const params = new URLSearchParams()
    if (next.from)        params.set('from', next.from)
    if (next.to)          params.set('to', next.to)
    if (next.mo)          params.set('mo', next.mo.trim())
    if (next.machineId)   params.set('machineId', next.machineId)
    if (next.submittedBy) params.set('submittedBy', next.submittedBy)
    if (next.passedBy)    params.set('passedBy', next.passedBy)
    if (next.result)      params.set('result', next.result)
    startTransition(() => router.push(`?${params.toString()}`))
  }

  function applyFilters() {
    push({ from, to, mo, machineId, submittedBy, passedBy, result })
  }

  function clearFilters() {
    setFrom(''); setTo(''); setMo(''); setMachineId('')
    setSubmittedBy(''); setPassedBy(''); setResult('')
    startTransition(() => router.push('?'))
  }

  const hasFilters = from || to || mo || machineId || submittedBy || passedBy || result

  const machineName = machines.find(m => m.id === machineId)?.machine_code ?? machineId
  const submitterName = users.find(u => u.id === submittedBy)?.display_name ?? submittedBy
  const passerName = users.find(u => u.id === passedBy)?.display_name ?? passedBy

  return (
    <div className="p-8 flex flex-col gap-6">

      {/* Filter bar */}
      <div className="print:hidden flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="From">
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inputCls} />
          </Field>

          <Field label="To">
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className={inputCls} />
          </Field>

          <Field label="MO Number">
            <input
              type="text"
              value={mo}
              onChange={e => setMo(e.target.value)}
              onKeyDown={e => {
                if (e.nativeEvent.isComposing || e.keyCode === 229) return
                if (e.key === 'Enter') applyFilters()
              }}
              placeholder="e.g. PC-0000477"
              className={`${inputCls} w-44 font-mono`}
            />
          </Field>

          <Field label="Machine">
            <select value={machineId} onChange={e => setMachineId(e.target.value)} className={inputCls}>
              <option value="">All machines</option>
              {machines.map(m => (
                <option key={m.id} value={m.id}>{m.machine_code}</option>
              ))}
            </select>
          </Field>

          <Field label="Submitted By">
            <select value={submittedBy} onChange={e => setSubmittedBy(e.target.value)} className={inputCls}>
              <option value="">Anyone</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.display_name}</option>
              ))}
            </select>
          </Field>

          <Field label="Passed By">
            <select value={passedBy} onChange={e => setPassedBy(e.target.value)} className={inputCls}>
              <option value="">Anyone</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.display_name}</option>
              ))}
            </select>
          </Field>

          <Field label="Result">
            <select value={result} onChange={e => setResult(e.target.value)} className={inputCls}>
              <option value="">Pass &amp; Fail</option>
              <option value="PASS">Pass only</option>
              <option value="FAIL">Fail only</option>
            </select>
          </Field>

          <div className="flex items-center gap-2 pb-0.5">
            <button
              onClick={applyFilters}
              disabled={isPending}
              className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold flex items-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Search className="w-3.5 h-3.5" />
              Apply
            </button>
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="h-9 px-3 rounded-lg bg-muted text-muted-foreground text-sm font-semibold flex items-center gap-1.5 hover:text-foreground transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Clear
              </button>
            )}
          </div>

          <div className="ml-auto pb-0.5">
            <button
              onClick={() => window.print()}
              className="h-9 px-4 rounded-lg bg-card border border-border text-sm font-semibold flex items-center gap-2 text-foreground hover:bg-muted transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              Print PDF
            </button>
          </div>
        </div>

        {/* Active filter pills */}
        {hasFilters && (
          <div className="flex flex-wrap gap-2">
            {from        && <FilterPill label={`From: ${from}`}              onRemove={() => { setFrom('');        push({ from: '', to, mo, machineId, submittedBy, passedBy, result }) }} />}
            {to          && <FilterPill label={`To: ${to}`}                  onRemove={() => { setTo('');          push({ from, to: '', mo, machineId, submittedBy, passedBy, result }) }} />}
            {mo          && <FilterPill label={`MO: ${mo}`}                  onRemove={() => { setMo('');          push({ from, to, mo: '', machineId, submittedBy, passedBy, result }) }} />}
            {machineId   && <FilterPill label={`Machine: ${machineName}`}    onRemove={() => { setMachineId('');   push({ from, to, mo, machineId: '', submittedBy, passedBy, result }) }} />}
            {submittedBy && <FilterPill label={`Submitted: ${submitterName}`} onRemove={() => { setSubmittedBy(''); push({ from, to, mo, machineId, submittedBy: '', passedBy, result }) }} />}
            {passedBy    && <FilterPill label={`Passed: ${passerName}`}      onRemove={() => { setPassedBy('');    push({ from, to, mo, machineId, submittedBy, passedBy: '', result }) }} />}
            {result      && <FilterPill label={`Result: ${result}`}          onRemove={() => { setResult('');      push({ from, to, mo, machineId, submittedBy, passedBy, result: '' }) }} />}
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground print:text-gray-500">
        {rows.length} submission{rows.length !== 1 ? 's' : ''}{hasFilters ? ' matching filters' : ' total'}
      </p>

      {/* Table */}
      {rows.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border border-border rounded-xl print:border-gray-300">
          No first-off submissions found for the selected filters.
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-x-auto print:border-gray-300 print:rounded-none">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border print:bg-gray-100 print:border-gray-300">
              <tr>
                {['MO Number', 'Machine', 'Result', 'Submitted', 'Submitted By', 'Passed Off', 'Passed By', 'Time to Pass Off', 'Redeemed', 'Redeemed By', 'Total to Redeem'].map(h => (
                  <th key={h} className="text-left text-xs font-semibold uppercase tracking-widest text-muted-foreground px-4 py-3 whitespace-nowrap print:text-gray-600">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border print:divide-gray-200">
              {rows.map(r => (
                <tr key={r.id} className="bg-card hover:bg-muted/30 transition-colors print:bg-white">
                  <td className="px-4 py-3 font-mono font-semibold text-foreground whitespace-nowrap print:text-black">
                    {r.mo_number}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap print:text-gray-600">
                    {r.machine_code}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded print:border print:bg-transparent ${
                      r.result === 'PASS'
                        ? 'bg-emerald-500/20 text-emerald-400 print:text-emerald-700 print:border-emerald-300'
                        : 'bg-red-500/20 text-red-400 print:text-red-700 print:border-red-300'
                    }`}>
                      {r.result}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap print:text-gray-500">
                    {r.submitted_at ? fmtDate(r.submitted_at) : (
                      <span className="text-orange-400 print:text-orange-700">Not recorded</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-foreground whitespace-nowrap print:text-black">
                    {r.submitted_by ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap print:text-gray-500">
                    {fmtDate(r.passed_at)}
                  </td>
                  <td className="px-4 py-3 text-foreground whitespace-nowrap print:text-black">
                    {r.passed_by}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="font-mono text-xs font-semibold text-purple-400 print:text-purple-700">
                      {durationStr(r.wait_mins)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap print:text-gray-500">
                    {r.redeemed_at ? fmtDate(r.redeemed_at) : (
                      <span className="text-orange-400 print:text-orange-700">Pending</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-foreground whitespace-nowrap print:text-black">
                    {r.redeemed_by ?? '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="font-mono text-xs text-foreground print:text-black">
                      {durationStr(r.redeem_mins)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const inputCls =
  'h-9 px-3 rounded-lg bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary transition-colors'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}

function FilterPill({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
      {label}
      <button onClick={onRemove} aria-label={`Remove filter ${label}`} className="hover:text-primary/60 transition-colors">
        <X className="w-3 h-3" />
      </button>
    </span>
  )
}

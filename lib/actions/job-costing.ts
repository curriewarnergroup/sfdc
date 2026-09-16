'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin } from '@/lib/auth/guards'
import { computeSessionTiming, fetchTimingEvents } from '@/lib/reporting/timing'
import {
  computeJobCostRow,
  isReadyToComplete,
  normalizeMo,
  type JobActualsInput,
  type JobCostRow,
  type JobQuoteInput,
} from '@/lib/job-costing/engine'
import {
  diffAgainstExisting,
  parseQuoteRows,
  parseWorkbook,
  type ImportPreview,
  type ImportRowResult,
  type NormalizedQuoteRecord,
} from '@/lib/job-costing/import'

type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

// ============================================================
// Import
// ============================================================

type QuoteRow = NormalizedQuoteRecord & { completed_at: string | null }

async function loadExistingQuotes(supabase: ReturnType<typeof createServiceClient>): Promise<Map<string, QuoteRow>> {
  const { data } = await supabase
    .from('job_quotes')
    .select(
      'mo_number, part_no, total_order_qty, qty_made, qty_scrapped, cycle_time_secs, setup_time_secs, run_labour_rate, run_overhead_rate, setup_labour_rate, setup_overhead_rate, sales_price_per_part, material_cost_per_part, completed_at',
    )
  const map = new Map<string, QuoteRow>()
  for (const row of data ?? []) {
    map.set(normalizeMo(row.mo_number), row as QuoteRow)
  }
  return map
}

export async function previewJobQuoteImport(
  formData: FormData,
): Promise<ActionResult<ImportPreview & { fileName: string }>> {
  await requireAdmin()

  const file = formData.get('file')
  if (!(file instanceof File)) return { success: false, error: 'No file was uploaded.' }
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    return { success: false, error: 'Upload a .xlsx spreadsheet.' }
  }

  const buffer = await file.arrayBuffer()
  const parsed = parseWorkbook(buffer)
  if ('error' in parsed) return { success: false, error: parsed.error }

  const { rowResults, headerError } = parseQuoteRows(parsed.rows)
  if (headerError) return { success: false, error: headerError }
  if (rowResults.length === 0) return { success: false, error: 'The file has no data rows.' }

  const supabase = createServiceClient()
  const existing = await loadExistingQuotes(supabase)
  const preview = diffAgainstExisting(rowResults, existing)

  return { success: true, data: { ...preview, fileName: file.name } }
}

export async function confirmJobQuoteImport(
  fileName: string,
  rows: NormalizedQuoteRecord[],
): Promise<ActionResult<{ batchId: string; counts: ImportPreview['counts'] }>> {
  const admin = await requireAdmin()

  if (!Array.isArray(rows) || rows.length === 0) {
    return { success: false, error: 'No rows to import.' }
  }

  // Defense in depth: re-derive NEW/UPDATE/UNCHANGED/ERROR from the current
  // database state rather than trusting the statuses the client sent back —
  // the preview may be stale by the time the admin confirms.
  const asRowResults: ImportRowResult[] = rows.map((record, i) => ({
    rowNumber: i + 2,
    status: 'NEW',
    mo_number: normalizeMo(record.mo_number),
    part_no: record.part_no,
    record: { ...record, mo_number: normalizeMo(record.mo_number) },
    errors: [],
    changes: [],
  }))

  const supabase = createServiceClient()
  const existing = await loadExistingQuotes(supabase)
  const preview = diffAgainstExisting(asRowResults, existing)

  const toWrite = preview.rows.filter((r) => r.status === 'NEW' || r.status === 'UPDATE').map((r) => r.record)
  const rowErrors = preview.rows
    .filter((r) => r.status === 'ERROR')
    .map((r) => ({ row: r.rowNumber, mo_number: r.mo_number, errors: r.errors }))

  if (toWrite.length === 0) {
    return { success: false, error: 'No rows require an import — nothing changed.' }
  }

  const { data: batchId, error } = await supabase.rpc('import_job_quotes', {
    batch: {
      file_name: fileName,
      imported_by: admin.id,
      rows_total: rows.length,
      rows_inserted: preview.counts.new,
      rows_updated: preview.counts.update,
      rows_unchanged: preview.counts.unchanged,
      rows_failed: preview.counts.error,
      errors: rowErrors,
    },
    rows: toWrite,
  })

  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/job-quotes')
  revalidatePath('/reporting/job-costing')

  return { success: true, data: { batchId: batchId as string, counts: preview.counts } }
}

export async function getImportHistory() {
  await requireAdmin()
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('job_quote_imports')
    .select('id, file_name, imported_at, rows_total, rows_inserted, rows_updated, rows_unchanged, rows_failed, errors, imported_by:shopfloor_users(display_name)')
    .order('imported_at', { ascending: false })
    .limit(50)
  return data ?? []
}

// ============================================================
// Quotes list (admin)
// ============================================================

export async function getJobQuotes(search?: string) {
  await requireAdmin()
  const supabase = createServiceClient()
  let query = supabase
    .from('job_quotes')
    .select(
      'mo_number, part_no, total_order_qty, qty_made, qty_scrapped, sales_price_per_part, completed_at, updated_at',
    )
    .order('updated_at', { ascending: false })

  if (search && search.trim()) {
    const term = search.trim()
    query = query.or(`mo_number.ilike.%${term}%,part_no.ilike.%${term}%`)
  }

  const { data } = await query.limit(500)
  return data ?? []
}

// ============================================================
// Shared actuals loader — used by both the bulk report and drilldown
// ============================================================

async function loadActualsForMos(
  supabase: ReturnType<typeof createServiceClient>,
  moNumbers: string[],
): Promise<Map<string, JobActualsInput & { sessionRows: any[] }>> {
  const result = new Map<string, JobActualsInput & { sessionRows: any[] }>()
  if (moNumbers.length === 0) return result

  const { data: sessions } = await supabase
    .from('sessions')
    .select(
      'id, mo_number, session_type, status, machine_id, started_at, ended_at, break_deducted_minutes, qty_made, qty_scrapped, machine:machines(machine_code), user:shopfloor_users!user_id(shift:shift_patterns(end_time))',
    )
    .in('session_type', ['SETUP', 'RUN', 'UNMANNED'])

  if (!sessions || sessions.length === 0) return result

  const wanted = new Set(moNumbers)
  const relevant = sessions.filter((s) => s.mo_number && wanted.has(normalizeMo(s.mo_number)))
  if (relevant.length === 0) return result

  const { events: eventsBySession, overrunAuthorised } = await fetchTimingEvents(
    supabase,
    relevant.map((s) => s.id),
  )

  for (const s of relevant) {
    const mo = normalizeMo(s.mo_number!)
    const timing = computeSessionTiming(
      s.started_at,
      s.ended_at,
      s.break_deducted_minutes ?? 0,
      eventsBySession.get(s.id) ?? [],
      {
        endTime: (s.user as any)?.shift?.end_time ?? null,
        startMs: new Date(s.started_at).getTime(),
        overrunAuthorised: overrunAuthorised.has(s.id),
      },
    )

    const entry = result.get(mo) ?? {
      actual_setup_secs: 0,
      attended_run_secs: 0,
      unmanned_run_secs: 0,
      shopfloor_qty_made: 0,
      shopfloor_qty_scrapped: 0,
      machine_codes: [] as string[],
      has_any_session: false,
      has_active_or_paused_session: false,
      sessionRows: [] as any[],
    }

    entry.has_any_session = true
    if (s.status === 'ACTIVE' || s.status === 'PAUSED') entry.has_active_or_paused_session = true

    const netSecs = timing.netMs / 1000
    if (s.session_type === 'SETUP') entry.actual_setup_secs += netSecs
    else if (s.session_type === 'RUN') entry.attended_run_secs += netSecs
    else if (s.session_type === 'UNMANNED') entry.unmanned_run_secs += netSecs

    // qty is recorded once per session (on the RUN/UNMANNED session that made
    // the parts), so summing across a job's sessions gives the shop-floor total.
    entry.shopfloor_qty_made += s.qty_made ?? 0
    entry.shopfloor_qty_scrapped += s.qty_scrapped ?? 0

    const machineCode = (s.machine as any)?.machine_code
    if (machineCode && !entry.machine_codes.includes(machineCode)) entry.machine_codes.push(machineCode)

    entry.sessionRows.push({ ...s, timing })
    result.set(mo, entry)
  }

  return result
}

function toQuoteInput(row: QuoteRow): JobQuoteInput {
  return {
    mo_number: row.mo_number,
    part_no: row.part_no,
    total_order_qty: row.total_order_qty,
    qty_made: row.qty_made,
    qty_scrapped: row.qty_scrapped,
    cycle_time_secs: row.cycle_time_secs,
    setup_time_secs: row.setup_time_secs,
    run_labour_rate: row.run_labour_rate,
    run_overhead_rate: row.run_overhead_rate,
    setup_labour_rate: row.setup_labour_rate,
    setup_overhead_rate: row.setup_overhead_rate,
    sales_price_per_part: row.sales_price_per_part,
    material_cost_per_part: row.material_cost_per_part,
    completed_at: row.completed_at,
  }
}

async function writeHistorySnapshot(
  supabase: ReturnType<typeof createServiceClient>,
  quote: QuoteRow,
  row: JobCostRow,
  completedBy: string,
) {
  const completedAt = new Date().toISOString()

  await supabase.from('job_cost_history').upsert(
    {
      mo_number: row.mo_number,
      part_no: row.part_no,
      completed_at: completedAt,
      machine_codes: row.machine_codes,
      total_order_qty: row.total_order_qty,
      qty_made: row.qty_made,
      qty_scrapped: row.qty_scrapped,
      quoted_setup_secs: row.quoted_setup_secs,
      actual_setup_secs: row.actual_setup_secs,
      quoted_cycle_secs: quote.cycle_time_secs,
      actual_cycle_secs: row.current_cycle_secs,
      expected_labour_hours: row.expected_labour_hours,
      actual_labour_hours: row.actual_labour_hours,
      revenue: row.revenue,
      material_cost: row.material_cost,
      expected_cost: row.expected_cost,
      actual_cost: row.actual_cost,
      expected_profit: row.expected_profit,
      actual_profit: row.actual_profit,
      actual_margin_pct: row.actual_margin_pct,
      expected_margin_pct: row.expected_margin_pct,
      scrap_pct: row.scrap_pct,
      material_included: row.material_included,
      quote_snapshot: quote,
    },
    { onConflict: 'mo_number' },
  )

  await supabase
    .from('job_quotes')
    .update({ completed_at: completedAt, completed_by: completedBy })
    .eq('mo_number', row.mo_number)
}

// ============================================================
// Main quote-vs-actual report
// ============================================================

export async function getJobCostRows(): Promise<JobCostRow[]> {
  const admin = await requireAdmin()
  const supabase = createServiceClient()

  const { data: quotes } = await supabase
    .from('job_quotes')
    .select(
      'mo_number, part_no, total_order_qty, qty_made, qty_scrapped, cycle_time_secs, setup_time_secs, run_labour_rate, run_overhead_rate, setup_labour_rate, setup_overhead_rate, sales_price_per_part, material_cost_per_part, completed_at',
    )
    .is('completed_at', null)

  if (!quotes || quotes.length === 0) return []

  const moNumbers = quotes.map((q) => normalizeMo(q.mo_number))
  const actualsByMo = await loadActualsForMos(supabase, moNumbers)

  const rows: JobCostRow[] = []
  for (const quoteRaw of quotes) {
    const quote = { ...quoteRaw, mo_number: normalizeMo(quoteRaw.mo_number) } as QuoteRow
    const actuals =
      actualsByMo.get(quote.mo_number) ?? {
        actual_setup_secs: 0,
        attended_run_secs: 0,
        unmanned_run_secs: 0,
        shopfloor_qty_made: 0,
        shopfloor_qty_scrapped: 0,
        machine_codes: [],
        has_any_session: false,
        has_active_or_paused_session: false,
        sessionRows: [],
      }

    const row = computeJobCostRow(toQuoteInput(quote), actuals)

    if (isReadyToComplete(toQuoteInput(quote), actuals, row.qty_made)) {
      await writeHistorySnapshot(supabase, quote, row, admin.id)
      continue // now historical — excluded from the live report
    }

    if (row.status === 'RUNNING' || row.status === 'IN_SETUP') rows.push(row)
  }

  return rows
}

export async function getJobCostingExceptions(): Promise<{
  noActivity: { mo_number: string; part_no: string; total_order_qty: number; first_imported_at: string }[]
  noQuote: { mo_number: string; machine_codes: string[] }[]
}> {
  await requireAdmin()
  const supabase = createServiceClient()

  const { data: quotes } = await supabase
    .from('job_quotes')
    .select('mo_number, part_no, total_order_qty, first_imported_at')
    .is('completed_at', null)

  const { data: sessions } = await supabase
    .from('sessions')
    .select('mo_number, machine:machines(machine_code)')
    .in('session_type', ['SETUP', 'RUN', 'UNMANNED'])

  const quoteMap = new Map((quotes ?? []).map((q) => [normalizeMo(q.mo_number), q]))
  const sessionMoSet = new Map<string, Set<string>>()
  for (const s of sessions ?? []) {
    if (!s.mo_number) continue
    const mo = normalizeMo(s.mo_number)
    const set = sessionMoSet.get(mo) ?? new Set<string>()
    const code = (s.machine as any)?.machine_code
    if (code) set.add(code)
    sessionMoSet.set(mo, set)
  }

  const noActivity = (quotes ?? [])
    .filter((q) => !sessionMoSet.has(normalizeMo(q.mo_number)))
    .map((q) => ({ ...q, mo_number: normalizeMo(q.mo_number) }))

  const noQuote = [...sessionMoSet.entries()]
    .filter(([mo]) => !quoteMap.has(mo))
    .map(([mo, machines]) => ({ mo_number: mo, machine_codes: [...machines] }))

  return { noActivity, noQuote }
}

// ============================================================
// Drilldown
// ============================================================

export async function getJobCostDetail(moNumber: string) {
  await requireAdmin()
  const supabase = createServiceClient()
  const mo = normalizeMo(moNumber)

  const { data: quoteRaw } = await supabase
    .from('job_quotes')
    .select(
      'mo_number, part_no, total_order_qty, qty_made, qty_scrapped, cycle_time_secs, setup_time_secs, run_labour_rate, run_overhead_rate, setup_labour_rate, setup_overhead_rate, sales_price_per_part, material_cost_per_part, completed_at',
    )
    .eq('mo_number', mo)
    .maybeSingle()

  if (!quoteRaw) return null
  const quote = { ...quoteRaw, mo_number: mo } as QuoteRow

  if (quote.completed_at) {
    const { data: history } = await supabase.from('job_cost_history').select('*').eq('mo_number', mo).maybeSingle()
    return { quote, history: history ?? null, row: null, sessions: [] as any[] }
  }

  const actualsByMo = await loadActualsForMos(supabase, [mo])
  const actuals =
    actualsByMo.get(mo) ?? {
      actual_setup_secs: 0,
      attended_run_secs: 0,
      unmanned_run_secs: 0,
      shopfloor_qty_made: 0,
      shopfloor_qty_scrapped: 0,
      machine_codes: [],
      has_any_session: false,
      has_active_or_paused_session: false,
      sessionRows: [],
    }

  const row = computeJobCostRow(toQuoteInput(quote), actuals)

  const pauseByReason: Record<string, number> = {}
  for (const s of actuals.sessionRows) {
    for (const [label, ms] of Object.entries(s.timing.pauseByReason as Record<string, number>)) {
      pauseByReason[label] = (pauseByReason[label] ?? 0) + ms
    }
  }

  return {
    quote,
    history: null,
    row,
    sessions: actuals.sessionRows.map((s) => ({
      id: s.id,
      session_type: s.session_type,
      status: s.status,
      machine_code: (s.machine as any)?.machine_code ?? null,
      started_at: s.started_at,
      ended_at: s.ended_at,
      net_secs: s.timing.netMs / 1000,
      paused_secs: s.timing.pausedMs / 1000,
    })),
    pauseByReason,
  }
}

export async function getPartHistory(partNo: string, excludeMo?: string) {
  await requireAdmin()
  const supabase = createServiceClient()
  let query = supabase
    .from('job_cost_history')
    .select(
      'mo_number, completed_at, qty_made, quoted_setup_secs, actual_setup_secs, expected_profit, actual_profit, actual_margin_pct, expected_margin_pct',
    )
    .eq('part_no', partNo)
    .order('completed_at', { ascending: false })
    .limit(20)

  if (excludeMo) query = query.neq('mo_number', normalizeMo(excludeMo))

  const { data } = await query
  return data ?? []
}

// ============================================================
// Manual completion / reopen
// ============================================================

export async function markJobComplete(moNumber: string): Promise<ActionResult<null>> {
  const admin = await requireAdmin()
  const supabase = createServiceClient()
  const mo = normalizeMo(moNumber)

  const { data: quoteRaw } = await supabase
    .from('job_quotes')
    .select(
      'mo_number, part_no, total_order_qty, qty_made, qty_scrapped, cycle_time_secs, setup_time_secs, run_labour_rate, run_overhead_rate, setup_labour_rate, setup_overhead_rate, sales_price_per_part, material_cost_per_part, completed_at',
    )
    .eq('mo_number', mo)
    .maybeSingle()

  if (!quoteRaw) return { success: false, error: 'Quote not found.' }
  if (quoteRaw.completed_at) return { success: false, error: 'Job is already complete.' }

  const quote = { ...quoteRaw, mo_number: mo } as QuoteRow
  const actualsByMo = await loadActualsForMos(supabase, [mo])
  const actuals = actualsByMo.get(mo)
  if (!actuals) return { success: false, error: 'No shop floor activity recorded for this MO yet.' }
  if (actuals.has_active_or_paused_session) {
    return { success: false, error: 'This MO has a session still running or paused on the shop floor.' }
  }

  const row = computeJobCostRow(toQuoteInput(quote), actuals)
  await writeHistorySnapshot(supabase, quote, row, admin.id)

  revalidatePath('/reporting/job-costing')
  return { success: true, data: null }
}

export async function reopenJob(moNumber: string): Promise<ActionResult<null>> {
  await requireAdmin()
  const supabase = createServiceClient()
  const mo = normalizeMo(moNumber)

  await supabase.from('job_quotes').update({ completed_at: null, completed_by: null }).eq('mo_number', mo)
  await supabase.from('job_cost_history').delete().eq('mo_number', mo)

  revalidatePath('/reporting/job-costing')
  return { success: true, data: null }
}

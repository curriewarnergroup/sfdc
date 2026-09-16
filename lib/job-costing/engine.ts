// ============================================================
// Job Costing — pure calculation engine
// ------------------------------------------------------------
// No database access. Given a quote row and the shop-floor time/quantity
// figures already computed for its MO (via computeSessionTiming /
// fetchTimingEvents in lib/actions/reporting.ts), this module derives every
// quote-vs-actual figure shown in the manager report and drill-down.
//
// Scrap earns nothing: only qty_made drives revenue and expected time, while
// actual time already includes time spent making scrap — so scrap reduces
// profit automatically without a separate penalty term.
// ============================================================

// MO numbers are compared trimmed and UPPERCASE everywhere in job costing.
export function normalizeMo(value: string): string {
  return value.trim().toUpperCase()
}

export type JobCostStatus = 'NOT_STARTED' | 'IN_SETUP' | 'RUNNING' | 'COMPLETE'

export interface JobQuoteInput {
  mo_number: string
  part_no: string
  total_order_qty: number
  qty_made: number | null // job_quotes override; null = use shop floor count
  qty_scrapped: number | null // job_quotes override; null = use shop floor count
  cycle_time_secs: number
  setup_time_secs: number
  run_labour_rate: number
  run_overhead_rate: number
  setup_labour_rate: number
  setup_overhead_rate: number
  sales_price_per_part: number
  material_cost_per_part: number | null
  completed_at: string | null
}

export interface JobActualsInput {
  actual_setup_secs: number
  attended_run_secs: number
  unmanned_run_secs: number
  shopfloor_qty_made: number
  shopfloor_qty_scrapped: number
  machine_codes: string[]
  has_any_session: boolean
  has_active_or_paused_session: boolean
}

export interface JobCostRow {
  mo_number: string
  part_no: string
  machine_codes: string[]
  status: JobCostStatus
  low_confidence: boolean

  total_order_qty: number
  qty_made: number
  qty_scrapped: number
  qty_made_source: 'QUOTE' | 'SHOPFLOOR'
  qty_scrapped_source: 'QUOTE' | 'SHOPFLOOR'
  percent_complete: number
  scrap_pct: number | null
  current_cycle_secs: number | null

  quoted_setup_secs: number
  actual_setup_secs: number
  setup_variance_secs: number
  setup_variance_cost: number
  setup_over_quote: boolean
  quoted_setup_cost: number
  actual_setup_cost: number

  attended_run_secs: number
  unmanned_run_secs: number

  material_included: boolean

  // null for IN_SETUP / NOT_STARTED — never coerced to 0
  share: number | null
  revenue: number | null
  material_cost: number | null
  expected_run_secs: number | null
  expected_run_cost: number | null
  actual_run_cost: number | null
  expected_cost: number | null
  actual_cost: number | null
  expected_profit: number | null
  actual_profit: number | null
  actual_margin_pct: number | null
  expected_margin_pct: number | null
  profit_vs_quote: number | null

  expected_labour_hours: number | null
  actual_labour_hours: number | null
  expected_labour_cost: number | null
  actual_labour_cost: number | null
}

const LOW_CONFIDENCE_QTY = 10
const LOW_CONFIDENCE_SHARE = 0.05

function deriveStatus(quote: JobQuoteInput, actuals: JobActualsInput, qtyMade: number): JobCostStatus {
  if (quote.completed_at) return 'COMPLETE'
  if (!actuals.has_any_session) return 'NOT_STARTED'
  if (qtyMade === 0) return 'IN_SETUP'
  return 'RUNNING'
}

export function isReadyToComplete(quote: JobQuoteInput, actuals: JobActualsInput, qtyMade: number): boolean {
  return (
    !quote.completed_at &&
    qtyMade >= quote.total_order_qty &&
    !actuals.has_active_or_paused_session
  )
}

export function computeJobCostRow(quote: JobQuoteInput, actuals: JobActualsInput): JobCostRow {
  const qtyMade = quote.qty_made ?? actuals.shopfloor_qty_made
  const qtyMadeSource: 'QUOTE' | 'SHOPFLOOR' = quote.qty_made != null ? 'QUOTE' : 'SHOPFLOOR'
  const qtyScrapped = quote.qty_scrapped ?? actuals.shopfloor_qty_scrapped
  const qtyScrappedSource: 'QUOTE' | 'SHOPFLOOR' = quote.qty_scrapped != null ? 'QUOTE' : 'SHOPFLOOR'

  const status = deriveStatus(quote, actuals, qtyMade)
  const lowConfidence =
    status === 'RUNNING' &&
    (qtyMade < LOW_CONFIDENCE_QTY || qtyMade < LOW_CONFIDENCE_SHARE * quote.total_order_qty)

  const setupRateSum = quote.setup_labour_rate + quote.setup_overhead_rate
  const quotedSetupCost = (quote.setup_time_secs / 3600) * setupRateSum
  const actualSetupCost = (actuals.actual_setup_secs / 3600) * setupRateSum
  const setupVarianceSecs = actuals.actual_setup_secs - quote.setup_time_secs
  const setupVarianceCost = actualSetupCost - quotedSetupCost
  const setupOverQuote = actuals.actual_setup_secs > quote.setup_time_secs

  const percentComplete = quote.total_order_qty > 0 ? qtyMade / quote.total_order_qty : 0
  const scrapDenominator = qtyMade + qtyScrapped
  const scrapPct = scrapDenominator > 0 ? qtyScrapped / scrapDenominator : null
  const currentCycleSecs =
    scrapDenominator > 0 ? (actuals.attended_run_secs + actuals.unmanned_run_secs) / scrapDenominator : null

  const materialIncluded = quote.material_cost_per_part != null

  const runEligible = status === 'RUNNING' || status === 'COMPLETE'

  let share: number | null = null
  let revenue: number | null = null
  let materialCost: number | null = null
  let expectedRunSecs: number | null = null
  let expectedRunCost: number | null = null
  let actualRunCost: number | null = null
  let expectedCost: number | null = null
  let actualCost: number | null = null
  let expectedProfit: number | null = null
  let actualProfit: number | null = null
  let actualMarginPct: number | null = null
  let expectedMarginPct: number | null = null
  let profitVsQuote: number | null = null
  let expectedLabourHours: number | null = null
  let actualLabourHours: number | null = null
  let expectedLabourCost: number | null = null
  let actualLabourCost: number | null = null

  if (runEligible) {
    share = Math.min(1, quote.total_order_qty > 0 ? qtyMade / quote.total_order_qty : 0)
    revenue = qtyMade * quote.sales_price_per_part
    materialCost = qtyMade * (quote.material_cost_per_part ?? 0)
    expectedRunSecs = qtyMade * quote.cycle_time_secs
    expectedRunCost = (expectedRunSecs / 3600) * (quote.run_labour_rate + quote.run_overhead_rate)
    actualRunCost =
      (actuals.attended_run_secs / 3600) * (quote.run_labour_rate + quote.run_overhead_rate) +
      (actuals.unmanned_run_secs / 3600) * quote.run_overhead_rate
    expectedCost = expectedRunCost + quotedSetupCost * share + materialCost
    actualCost = actualRunCost + actualSetupCost * share + materialCost
    expectedProfit = revenue - expectedCost
    actualProfit = revenue - actualCost
    actualMarginPct = revenue !== 0 ? actualProfit / revenue : null
    expectedMarginPct = revenue !== 0 ? expectedProfit / revenue : null
    profitVsQuote = actualProfit - expectedProfit

    expectedLabourHours = (quote.setup_time_secs * share) / 3600 + expectedRunSecs / 3600
    actualLabourHours = (actuals.actual_setup_secs * share) / 3600 + actuals.attended_run_secs / 3600
    expectedLabourCost =
      ((quote.setup_time_secs * share) / 3600) * quote.setup_labour_rate +
      (expectedRunSecs / 3600) * quote.run_labour_rate
    actualLabourCost =
      ((actuals.actual_setup_secs * share) / 3600) * quote.setup_labour_rate +
      (actuals.attended_run_secs / 3600) * quote.run_labour_rate
  }

  return {
    mo_number: quote.mo_number,
    part_no: quote.part_no,
    machine_codes: actuals.machine_codes,
    status,
    low_confidence: lowConfidence,

    total_order_qty: quote.total_order_qty,
    qty_made: qtyMade,
    qty_scrapped: qtyScrapped,
    qty_made_source: qtyMadeSource,
    qty_scrapped_source: qtyScrappedSource,
    percent_complete: percentComplete,
    scrap_pct: scrapPct,
    current_cycle_secs: currentCycleSecs,

    quoted_setup_secs: quote.setup_time_secs,
    actual_setup_secs: actuals.actual_setup_secs,
    setup_variance_secs: setupVarianceSecs,
    setup_variance_cost: setupVarianceCost,
    setup_over_quote: setupOverQuote,
    quoted_setup_cost: quotedSetupCost,
    actual_setup_cost: actualSetupCost,

    attended_run_secs: actuals.attended_run_secs,
    unmanned_run_secs: actuals.unmanned_run_secs,

    material_included: materialIncluded,

    share,
    revenue,
    material_cost: materialCost,
    expected_run_secs: expectedRunSecs,
    expected_run_cost: expectedRunCost,
    actual_run_cost: actualRunCost,
    expected_cost: expectedCost,
    actual_cost: actualCost,
    expected_profit: expectedProfit,
    actual_profit: actualProfit,
    actual_margin_pct: actualMarginPct,
    expected_margin_pct: expectedMarginPct,
    profit_vs_quote: profitVsQuote,

    expected_labour_hours: expectedLabourHours,
    actual_labour_hours: actualLabourHours,
    expected_labour_cost: expectedLabourCost,
    actual_labour_cost: actualLabourCost,
  }
}

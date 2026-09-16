import { describe, expect, it } from 'vitest'
import { computeJobCostRow, type JobActualsInput, type JobQuoteInput } from './engine'

function round2(n: number | null): number | null {
  if (n === null) return null
  return Math.round(n * 100) / 100
}

const baseQuote: JobQuoteInput = {
  mo_number: 'MO-1',
  part_no: 'PART-1',
  total_order_qty: 500,
  qty_made: null,
  qty_scrapped: null,
  cycle_time_secs: 120,
  setup_time_secs: 7200,
  run_labour_rate: 30,
  run_overhead_rate: 45,
  setup_labour_rate: 35,
  setup_overhead_rate: 45,
  sales_price_per_part: 12,
  material_cost_per_part: 8,
  completed_at: null,
}

const baseActuals: JobActualsInput = {
  actual_setup_secs: 10800,
  attended_run_secs: 6000,
  unmanned_run_secs: 0,
  shopfloor_qty_made: 40,
  shopfloor_qty_scrapped: 2,
  machine_codes: ['BH1'],
  has_any_session: true,
  has_active_or_paused_session: true,
}

describe('computeJobCostRow', () => {
  it('matches the RUNNING acceptance figures', () => {
    const row = computeJobCostRow(baseQuote, baseActuals)

    expect(row.status).toBe('RUNNING')
    expect(row.low_confidence).toBe(false)
    expect(round2(row.share)).toBe(0.08)
    expect(round2(row.revenue)).toBe(480)
    expect(round2(row.material_cost)).toBe(320)
    expect(round2(row.expected_run_cost)).toBe(100)
    expect(round2(row.actual_run_cost)).toBe(125)
    expect(round2(row.quoted_setup_cost)).toBe(160)
    expect(round2(row.actual_setup_cost)).toBe(240)
    expect(row.setup_variance_secs).toBe(3600)
    expect(round2(row.setup_variance_cost)).toBe(80)
    expect(row.setup_over_quote).toBe(true)
    expect(round2(row.expected_profit)).toBe(47.2)
    expect(round2(row.actual_profit)).toBe(15.8)
    expect(round2((row.actual_margin_pct ?? 0) * 100)).toBe(3.29)
    expect(round2((row.expected_margin_pct ?? 0) * 100)).toBe(9.83)
    expect(round2(row.percent_complete * 100)).toBe(8)
    expect(round2((row.scrap_pct ?? 0) * 100)).toBe(4.76)
    expect(round2(row.current_cycle_secs)).toBe(142.86)
  })

  it('reports IN_SETUP with null run/profit fields when no parts have been made', () => {
    const actuals: JobActualsInput = {
      ...baseActuals,
      actual_setup_secs: 3000,
      shopfloor_qty_made: 0,
      shopfloor_qty_scrapped: 0,
    }
    const row = computeJobCostRow(baseQuote, actuals)

    expect(row.status).toBe('IN_SETUP')
    expect(row.setup_variance_secs).toBe(-4200)
    expect(row.setup_over_quote).toBe(false)
    expect(row.share).toBeNull()
    expect(row.revenue).toBeNull()
    expect(row.material_cost).toBeNull()
    expect(row.expected_run_cost).toBeNull()
    expect(row.actual_run_cost).toBeNull()
    expect(row.expected_cost).toBeNull()
    expect(row.actual_cost).toBeNull()
    expect(row.expected_profit).toBeNull()
    expect(row.actual_profit).toBeNull()
    expect(row.actual_margin_pct).toBeNull()
    expect(row.expected_margin_pct).toBeNull()
  })
})

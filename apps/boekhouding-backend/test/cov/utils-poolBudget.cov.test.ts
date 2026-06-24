import { describe, it, expect } from 'vitest'
import { poolBudgetWarning } from '../../src/utils/poolBudget.js'

describe('poolBudgetWarning', () => {
  it('returns null for the safe default (1 worker, pool 9 → 2 pods × 9 = 18 ≤ 20)', () => {
    expect(poolBudgetWarning(null, 9)).toBeNull()
  })

  it('warns when the per-worker pool is too large (pool 15 → 2 × 1 × 15 = 30 > 20)', () => {
    const warning = poolBudgetWarning(null, 15)
    expect(warning).toContain('30')
    expect(warning).toContain('20')
  })

  it('counts the worker count (2 workers, pool 9 → 2 × 2 × 9 = 36 > 20)', () => {
    expect(poolBudgetWarning(2, 9)).toContain('36')
  })

  it('returns null exactly at the cap (2 pods × 1 × 10 = 20)', () => {
    expect(poolBudgetWarning(1, 10)).toBeNull()
  })

  it('honours custom cap and surgePods (no rolling overlap, higher cap)', () => {
    expect(poolBudgetWarning(1, 40, 50, 1)).toBeNull()
    expect(poolBudgetWarning(1, 40, 50, 2)).toContain('80')
  })
})

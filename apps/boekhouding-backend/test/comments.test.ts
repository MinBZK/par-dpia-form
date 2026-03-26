import { describe, it, expect } from 'vitest'
import { computeLastModifiedAt } from '../src/utils/comments.js'

describe('computeLastModifiedAt', () => {
  it('returns null when there are no dates', () => {
    expect(computeLastModifiedAt([])).toBeNull()
  })

  it('returns the single date when there is one', () => {
    const date = new Date('2026-03-20T12:00:00Z')
    expect(computeLastModifiedAt([date])).toBe(date)
  })

  it('returns the latest date from multiple dates', () => {
    const oldest = new Date('2026-03-18T10:00:00Z')
    const newest = new Date('2026-03-20T14:00:00Z')
    const middle = new Date('2026-03-19T08:00:00Z')

    expect(computeLastModifiedAt([oldest, newest, middle])).toBe(newest)
  })

  it('handles dates in reverse order', () => {
    const newest = new Date('2026-03-20T14:00:00Z')
    const oldest = new Date('2026-03-18T10:00:00Z')

    expect(computeLastModifiedAt([newest, oldest])).toBe(newest)
  })
})

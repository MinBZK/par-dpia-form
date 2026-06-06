import { describe, it, expect } from 'vitest'
import { computeLastModifiedAt } from '../../src/utils/comments.js'

describe('computeLastModifiedAt', () => {
  it('returns null for an empty list', () => {
    expect(computeLastModifiedAt([])).toBeNull()
  })

  it('returns the only date for a single-element list', () => {
    const only = new Date('2024-01-01T00:00:00Z')
    expect(computeLastModifiedAt([only])).toBe(only)
  })

  it('returns the most recent date when a later date follows the seed (ternary true branch)', () => {
    const earlier = new Date('2024-01-01T00:00:00Z')
    const later = new Date('2024-06-01T00:00:00Z')
    expect(computeLastModifiedAt([earlier, later])).toBe(later)
  })

  it('keeps the running max when a later element is older (ternary false branch)', () => {
    const later = new Date('2024-06-01T00:00:00Z')
    const earlier = new Date('2024-01-01T00:00:00Z')
    expect(computeLastModifiedAt([later, earlier])).toBe(later)
  })

  it('finds the maximum regardless of position in a longer unordered list', () => {
    const d1 = new Date('2024-02-01T00:00:00Z')
    const d2 = new Date('2024-09-15T12:30:00Z')
    const d3 = new Date('2024-03-10T00:00:00Z')
    const d4 = new Date('2024-01-01T00:00:00Z')
    expect(computeLastModifiedAt([d1, d2, d3, d4])).toBe(d2)
  })

  it('treats equal dates without replacing the seed (not strictly greater)', () => {
    const a = new Date('2024-05-05T00:00:00Z')
    const b = new Date('2024-05-05T00:00:00Z')
    expect(computeLastModifiedAt([a, b])).toBe(a)
  })
})

import { describe, it, expect } from 'vitest'
import { parsePagination } from '../../src/utils/pagination.js'

const opts = { defaultSize: 100, maxSize: 500 }

describe('parsePagination', () => {
  it('uses defaults when no params are given', () => {
    expect(parsePagination({}, opts)).toEqual({ limit: 100, offset: 0, page: 1, pageSize: 100 })
  })

  it('honours explicit page and pageSize', () => {
    expect(parsePagination({ page: '3', pageSize: '20' }, opts)).toEqual({
      limit: 20, offset: 40, page: 3, pageSize: 20,
    })
  })

  it('clamps pageSize to maxSize', () => {
    const p = parsePagination({ pageSize: '99999' }, opts)
    expect(p.pageSize).toBe(500)
    expect(p.limit).toBe(500)
  })

  it('falls back to defaults for non-numeric or non-positive values', () => {
    expect(parsePagination({ page: 'abc', pageSize: 'x' }, opts)).toMatchObject({ page: 1, pageSize: 100 })
    expect(parsePagination({ page: '0', pageSize: '-5' }, opts)).toMatchObject({ page: 1, pageSize: 100 })
  })
})

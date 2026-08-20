import { describe, it, expect } from 'vitest'
import { parsePagination, pageQuerySchema } from '../../src/utils/pagination.js'

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

  it('clamps an oversized page so the offset cannot overflow', () => {
    const p = parsePagination({ page: '2000000' }, opts)
    expect(p.page).toBe(1_000_000)
    expect(p.offset).toBe((1_000_000 - 1) * 100)
  })

  it('accepts already-coerced numbers from the querystring schema', () => {
    expect(parsePagination({ page: 3, pageSize: 20 }, opts)).toEqual({
      limit: 20, offset: 40, page: 3, pageSize: 20,
    })
  })
})

describe('pageQuerySchema', () => {
  it('documents page and pageSize with the endpoint cap', () => {
    const s = pageQuerySchema(opts)
    expect(s.properties.page.minimum).toBe(1)
    expect(s.properties.pageSize.maximum).toBe(500)
    expect(s.properties.pageSize.default).toBe(100)
  })
})

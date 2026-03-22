import { describe, it, expect } from 'vitest'
import { isImageValue } from '../src/stores/answers'

describe('isImageValue', () => {
  it('returns true for minimal ImageValue with data URI', () => {
    expect(isImageValue({ data: 'data:image/png;base64,abc' })).toBe(true)
  })

  it('returns true for ImageValue with all optional fields', () => {
    expect(isImageValue({
      data: 'data:image/jpeg;base64,xyz',
      title: 'Test',
      source: 'foo',
    })).toBe(true)
  })

  it('returns false for null', () => {
    expect(isImageValue(null)).toBe(false)
  })

  it('returns false for a string', () => {
    expect(isImageValue('hello')).toBe(false)
  })

  it('returns false for an array', () => {
    expect(isImageValue(['a', 'b'])).toBe(false)
  })

  it('returns false for object with data that does not start with data:image/', () => {
    expect(isImageValue({ data: 'not-a-data-uri' })).toBe(false)
  })

  it('returns false for object without data property', () => {
    expect(isImageValue({ title: 'no data field' })).toBe(false)
  })

  it('returns false for Answer wrapper (has value, not data)', () => {
    expect(isImageValue({ value: 'data:image/png;base64,abc' })).toBe(false)
  })

  it('returns false for SVG data URI (XSS prevention)', () => {
    expect(isImageValue({ data: 'data:image/svg+xml;base64,PHN2Zy...' })).toBe(false)
  })

  it('returns true for WebP data URI', () => {
    expect(isImageValue({ data: 'data:image/webp;base64,UklGR...' })).toBe(true)
  })
})

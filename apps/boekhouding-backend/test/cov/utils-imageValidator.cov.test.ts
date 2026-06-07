import { describe, it, expect } from 'vitest'
import { isAllowedImageData, hasOnlyAllowedImages } from '../../src/utils/imageValidator.js'

describe('isAllowedImageData', () => {
  it.each([
    'data:image/webp;base64,UklGRg==',
    'data:image/png;base64,iVBORw0KGgo=',
    'data:image/jpeg;base64,/9j/4AAQ',
    'data:image/jpg;base64,/9j/4AAQ',
    'data:image/gif;base64,R0lGODlh',
  ])('accepts allowed raster format: %s', (data) => {
    expect(isAllowedImageData(data)).toBe(true)
  })

  it.each([
    'data:image/svg+xml;base64,PHN2Zz4=', // SVG — XSS vector, must be rejected
    'data:text/html;base64,PGgxPg==',
    'data:application/json;base64,e30=',
    'javascript:alert(1)',
    'data:image/png', // no ;base64, segment
    'data:image/png;base64', // missing trailing comma
    'data:image/png;base64,', // empty payload
    'not-a-data-uri',
    '',
  ])('rejects disallowed data: %s', (data) => {
    expect(isAllowedImageData(data)).toBe(false)
  })

  it.each([
    'data:image/png;base64,AAAA"><svg onload=alert(1)>', // embedded markup after a valid prefix
    'data:image/png;base64,iVBOR\ndata:image/svg+xml;base64,PHN2Zz4=', // smuggled second URI
    'data:image/png;base64,not valid base64 chars!',
  ])('rejects a valid prefix followed by a non-base64 payload: %s', (data) => {
    expect(isAllowedImageData(data)).toBe(false)
  })
})

describe('hasOnlyAllowedImages', () => {
  it('returns true for null, primitives and empty structures', () => {
    expect(hasOnlyAllowedImages(null)).toBe(true)
    expect(hasOnlyAllowedImages('plain text')).toBe(true)
    expect(hasOnlyAllowedImages(42)).toBe(true)
    expect(hasOnlyAllowedImages({})).toBe(true)
    expect(hasOnlyAllowedImages([])).toBe(true)
  })

  it('accepts an allowed embedded image', () => {
    const state = {
      answers: { '0.1': { value: { data: 'data:image/webp;base64,UklGRg==', title: 'Diagram' } } },
    }
    expect(hasOnlyAllowedImages(state)).toBe(true)
  })

  it('rejects a disallowed embedded image (SVG)', () => {
    const state = {
      answers: { '0.1': { value: { data: 'data:image/svg+xml;base64,PHN2Zz4=' } } },
    }
    expect(hasOnlyAllowedImages(state)).toBe(false)
  })

  it('recurses into grouped repeatable arrays and accepts valid images', () => {
    const state = {
      answers: {
        '2.1': [
          { _index: 0, '2.1.1': { value: { data: 'data:image/png;base64,iVBORw0KGgo=' } } },
          { _index: 1, '2.1.1': { value: 'plain answer' } },
        ],
      },
    }
    expect(hasOnlyAllowedImages(state)).toBe(true)
  })

  it('rejects a disallowed image nested inside a grouped repeatable array', () => {
    const state = {
      answers: {
        '2.1': [
          { _index: 0, '2.1.1': { value: { data: 'data:image/png;base64,iVBORw0KGgo=' } } },
          { _index: 1, '2.1.1': { value: { data: 'data:image/svg+xml;base64,PHN2Zz4=' } } },
        ],
      },
    }
    expect(hasOnlyAllowedImages(state)).toBe(false)
  })

  it('ignores a non-string data field (schema validation covers type errors)', () => {
    expect(hasOnlyAllowedImages({ data: 123 })).toBe(true)
  })

  it('ignores a string data field that is not a data: URI', () => {
    expect(hasOnlyAllowedImages({ data: 'https://example.org/logo.png' })).toBe(true)
  })

  it('rejects a case-variant data: prefix instead of skipping the allowlist', () => {
    expect(hasOnlyAllowedImages({ data: 'Data:image/svg+xml;base64,PHN2Zz4=' })).toBe(false)
    expect(hasOnlyAllowedImages({ data: 'DATA:image/svg+xml;base64,PHN2Zz4=' })).toBe(false)
  })

  it('accepts a null answer value (cleared image)', () => {
    expect(hasOnlyAllowedImages({ answers: { '0.1': { value: null } } })).toBe(true)
  })

  it('rejects pathologically deep nesting instead of overflowing the stack', () => {
    // A small payload of deeply nested arrays would overflow V8's call stack and
    // surface as a 500; the depth guard turns it into a clean rejection.
    let deep: unknown = { data: 'data:image/png;base64,AAAA' }
    for (let i = 0; i < 5000; i++) deep = [deep]
    expect(hasOnlyAllowedImages(deep)).toBe(false)
  })

  it('accepts legitimately nested (but shallow) grouped state', () => {
    let nested: unknown = { value: { data: 'data:image/webp;base64,UklGRg==' } }
    for (let i = 0; i < 20; i++) nested = [{ _index: 0, child: nested }]
    expect(hasOnlyAllowedImages(nested)).toBe(true)
  })
})

import { describe, it, expect, vi, afterEach } from 'vitest'
import { generateFilename } from '../../src/utils/fileName'
import { FormType } from '../../src/models/dpia'

describe('generateFilename', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('builds a filename with type, sanitized timestamp and extension', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-20T12:34:56.789Z'))

    const result = generateFilename(FormType.DPIA, 'pdf')

    expect(result).toBe('dpia_2026-03-20_12-34-56.pdf')
  })

  it('uses the PRE_SCAN type value and the given extension', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-02T03:04:05.000Z'))

    const result = generateFilename(FormType.PRE_SCAN, 'json')

    expect(result).toBe('prescan_2026-01-02_03-04-05.json')
  })

  it('strips colons, milliseconds and the T separator from the timestamp', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-12-31T23:59:59.999Z'))

    const result = generateFilename(FormType.DPIA, 'txt')

    expect(result).toContain('_')
    expect(result).not.toContain(':')
    expect(result).not.toContain('.999')
    expect(result).toBe('dpia_2026-12-31_23-59-59.txt')
  })
})

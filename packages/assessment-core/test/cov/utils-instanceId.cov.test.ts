import { describe, it, expect } from 'vitest'
import { buildInstanceId, parseInstanceId } from '../../src/utils/instanceId'

describe('buildInstanceId', () => {
  it('appends [index] when an index is provided', () => {
    expect(buildInstanceId('2.1.3', 0)).toBe('2.1.3[0]')
    expect(buildInstanceId('2.1.3', 5)).toBe('2.1.3[5]')
  })

  it('returns the task ID unchanged when index is undefined (omitted)', () => {
    expect(buildInstanceId('2.1.3')).toBe('2.1.3')
  })

  it('returns the task ID unchanged when index is explicitly undefined', () => {
    expect(buildInstanceId('2.1.3', undefined)).toBe('2.1.3')
  })
})

describe('parseInstanceId', () => {
  it('parses an instance ID with index into taskId and index', () => {
    expect(parseInstanceId('2.1.3[0]')).toEqual({ taskId: '2.1.3', index: 0 })
    expect(parseInstanceId('2.1.3[12]')).toEqual({ taskId: '2.1.3', index: 12 })
  })

  it('returns only taskId when there is no [index] suffix', () => {
    expect(parseInstanceId('2.1.3')).toEqual({ taskId: '2.1.3' })
  })

  it('does not match a non-numeric index suffix', () => {
    // Brackets with non-digits do not match the regex, so the whole string is the taskId.
    expect(parseInstanceId('2.1.3[abc]')).toEqual({ taskId: '2.1.3[abc]' })
  })

  it('round-trips with buildInstanceId', () => {
    expect(parseInstanceId(buildInstanceId('4.2', 3))).toEqual({ taskId: '4.2', index: 3 })
    expect(parseInstanceId(buildInstanceId('4.2'))).toEqual({ taskId: '4.2' })
  })
})

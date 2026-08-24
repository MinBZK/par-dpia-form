import { describe, it, expect } from 'vitest'
import { buildInstanceId, parseInstanceId, buildFieldUrn, parseFieldUrn } from '../../src/utils/fieldId.js'

const URN = 'urn:nl:dpia:3.0'

describe('buildInstanceId', () => {
  it('appends [index] when an index is provided', () => {
    expect(buildInstanceId('2.1.3', 0)).toBe('2.1.3[0]')
  })

  it('returns the task id unchanged without an index', () => {
    expect(buildInstanceId('2.1.3')).toBe('2.1.3')
  })
})

describe('parseInstanceId', () => {
  it('splits an indexed instance id', () => {
    expect(parseInstanceId('2.1.3[12]')).toEqual({ taskId: '2.1.3', index: 12 })
  })

  it('leaves a plain task id alone', () => {
    expect(parseInstanceId('2.1.3')).toEqual({ taskId: '2.1.3' })
    expect(parseInstanceId('2.1.3[abc]')).toEqual({ taskId: '2.1.3[abc]' })
  })
})

describe('buildFieldUrn', () => {
  it('encodes the task id in the r-component', () => {
    expect(buildFieldUrn(URN, '0.1')).toBe('urn:nl:dpia:3.0?=task_id=0.1')
  })

  it('adds task_index for an indexed instance', () => {
    expect(buildFieldUrn(URN, '2.1.1[0]')).toBe('urn:nl:dpia:3.0?=task_id=2.1.1&task_index=0')
  })
})

describe('parseFieldUrn', () => {
  it('parses a URN with and without an index', () => {
    expect(parseFieldUrn('urn:nl:dpia:3.0?=task_id=2.1.3')).toEqual({ namespace: 'dpia', key: '2.1.3' })
    expect(parseFieldUrn('urn:nl:iama:1.0?=task_id=2.1.3&task_index=4')).toEqual({
      namespace: 'iama',
      key: '2.1.3[4]',
    })
  })

  it('normalises the pre-split pre-scan namespace', () => {
    expect(parseFieldUrn('urn:nl:prescan_dpia:2.0?=task_id=1.1')).toEqual({
      namespace: 'prescan',
      key: '1.1',
    })
  })

  it('returns null for a malformed URN', () => {
    expect(parseFieldUrn('urn:nl:dpia:3.0')).toBeNull()
  })

  it('parses the legacy dot format', () => {
    expect(parseFieldUrn('dpia.2.1.3')).toEqual({ namespace: 'dpia', key: '2.1.3' })
    expect(parseFieldUrn('prescan.1.1')).toEqual({ namespace: 'prescan', key: '1.1' })
    expect(parseFieldUrn('iama.2.1')).toEqual({ namespace: 'iama', key: '2.1' })
  })

  it('treats anything else as a plain key', () => {
    expect(parseFieldUrn('2.1.3')).toEqual({ key: '2.1.3' })
    expect(parseFieldUrn('completed.1')).toEqual({ key: 'completed.1' })
  })
})

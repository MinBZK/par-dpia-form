import { describe, it, expect } from 'vitest'
import { buildFieldUrn, parseFieldUrn } from '../../src/utils/fieldUrn'

const URN = 'urn:nl:dpia:3.0'

describe('buildFieldUrn', () => {
  it('encodes the task id in the r-component', () => {
    expect(buildFieldUrn(URN, '0.1')).toBe('urn:nl:dpia:3.0?=task_id=0.1')
  })

  it('adds task_index for an indexed instance', () => {
    expect(buildFieldUrn(URN, '2.1.1[0]')).toBe('urn:nl:dpia:3.0?=task_id=2.1.1&task_index=0')
    expect(buildFieldUrn(URN, '2.1.1[12]')).toBe('urn:nl:dpia:3.0?=task_id=2.1.1&task_index=12')
  })

  it('passes a section-completion key through', () => {
    expect(buildFieldUrn(URN, 'completed.1')).toBe('urn:nl:dpia:3.0?=task_id=completed.1')
  })
})

describe('parseFieldUrn', () => {
  it('parses a URN without an index', () => {
    expect(parseFieldUrn('urn:nl:dpia:3.0?=task_id=2.1.3')).toEqual({
      namespace: 'dpia',
      key: '2.1.3',
    })
  })

  it('parses a URN with an index back into an instance id', () => {
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
    expect(parseFieldUrn('urn:something-else')).toBeNull()
  })

  it('parses the legacy dot format', () => {
    expect(parseFieldUrn('dpia.2.1.3')).toEqual({ namespace: 'dpia', key: '2.1.3' })
    expect(parseFieldUrn('prescan.1.1')).toEqual({ namespace: 'prescan', key: '1.1' })
    expect(parseFieldUrn('iama.2.1[0]')).toEqual({ namespace: 'iama', key: '2.1[0]' })
  })

  it('treats anything else as a plain key without a namespace', () => {
    expect(parseFieldUrn('2.1.3')).toEqual({ key: '2.1.3' })
    expect(parseFieldUrn('completed.1')).toEqual({ key: 'completed.1' })
    expect(parseFieldUrn('nodot')).toEqual({ key: 'nodot' })
  })

  it('round-trips with buildFieldUrn', () => {
    expect(parseFieldUrn(buildFieldUrn(URN, '2.1.1[3]'))).toEqual({
      namespace: 'dpia',
      key: '2.1.1[3]',
    })
    expect(parseFieldUrn(buildFieldUrn(URN, '2.1.1'))).toEqual({
      namespace: 'dpia',
      key: '2.1.1',
    })
  })
})

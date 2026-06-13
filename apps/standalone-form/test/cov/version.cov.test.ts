import { describe, it, expect } from 'vitest'
import { formatBuildVersion } from '@/version'

describe('formatBuildVersion', () => {
  it('shows the CalVer tag alone for a released build', () => {
    expect(formatBuildVersion('v2026.6.20', 'abc1234')).toBe('v2026.6.20')
  })

  it('shows "ontwikkel" with the commit for an untagged CI build', () => {
    expect(formatBuildVersion('dev', 'abc1234')).toBe('ontwikkel (commit abc1234)')
  })

  it('shows "ontwikkel (lokaal)" when neither tag nor commit is baked in', () => {
    expect(formatBuildVersion('dev', 'dev')).toBe('ontwikkel (lokaal)')
  })
})

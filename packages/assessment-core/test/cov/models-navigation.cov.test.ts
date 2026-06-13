import { describe, it, expect, vi } from 'vitest'
import { ViewState, type NavigationFunctions } from '../../src/models/navigation'
import { FormType } from '../../src/models/dpia'

describe('ViewState enum', () => {
  it('maps Landing to its own string literal', () => {
    expect(ViewState.Landing).toBe('landing')
  })

  it('maps DPIA to the FormType.DPIA value', () => {
    expect(ViewState.DPIA).toBe(FormType.DPIA)
    expect(ViewState.DPIA).toBe('dpia')
  })

  it('maps PreScanDPIA to the FormType.PRE_SCAN value', () => {
    expect(ViewState.PreScanDPIA).toBe(FormType.PRE_SCAN)
    expect(ViewState.PreScanDPIA).toBe('prescan')
  })

  it('exposes the three expected enum values', () => {
    const values = Object.values(ViewState)
    expect(values).toContain('landing')
    expect(values).toContain('dpia')
    expect(values).toContain('prescan')
  })

  it('supports reverse-style lookup via member access', () => {
    const states: ViewState[] = [
      ViewState.Landing,
      ViewState.DPIA,
      ViewState.PreScanDPIA,
    ]
    expect(states).toHaveLength(3)
  })
})

describe('NavigationFunctions interface', () => {
  it('can be satisfied by an object whose callbacks fire', () => {
    const goToLanding = vi.fn()
    const goToDPIA = vi.fn()
    const goToPreScanDPIA = vi.fn()

    const nav: NavigationFunctions = {
      goToLanding,
      goToDPIA,
      goToPreScanDPIA,
    }

    nav.goToLanding()
    nav.goToDPIA()
    nav.goToPreScanDPIA()

    expect(goToLanding).toHaveBeenCalledTimes(1)
    expect(goToDPIA).toHaveBeenCalledTimes(1)
    expect(goToPreScanDPIA).toHaveBeenCalledTimes(1)
  })
})

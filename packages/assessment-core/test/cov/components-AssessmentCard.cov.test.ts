import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AssessmentCard from '../../src/components/AssessmentCard.vue'
import type { AssessmentResult, CriterionResult } from '../../src/stores/calculations'

function criterion(id: string, explanation: string): CriterionResult {
  return { id, met: true, explanation }
}

function baseProps(overrides: Partial<{
  id: string
  title: string
  definition: string
  result?: AssessmentResult
  isCalculating: boolean
}> = {}) {
  return {
    id: 'DPIA',
    title: 'Data Protection Impact Assessment',
    definition: 'Een beoordeling van privacyrisicos.',
    isCalculating: false,
    ...overrides,
  }
}

describe('AssessmentCard rendering basics', () => {
  it('always renders the title and definition in the heading', () => {
    const wrapper = mount(AssessmentCard, { props: baseProps() })

    const heading = wrapper.find('h2.utrecht-heading-2')
    expect(heading.exists()).toBe(true)
    expect(heading.text()).toContain('Data Protection Impact Assessment')
    expect(wrapper.find('.aiv-definition-text').text()).toContain(
      'Een beoordeling van privacyrisicos.',
    )
  })
})

describe('AssessmentCard isCalculating branch', () => {
  it('shows the loading text and nothing else when isCalculating is true', () => {
    const wrapper = mount(AssessmentCard, {
      props: baseProps({ isCalculating: true, result: undefined }),
    })

    expect(wrapper.text()).toContain('Berekenen...')
    // The result template block (v-else) must not render.
    expect(wrapper.text()).not.toContain('Niet verplicht')
    expect(wrapper.findAll('ul')).toHaveLength(0)
  })

  it('shows "Niet verplicht" with a result while calculating only after calculation ends', () => {
    // isCalculating true wins even when a result is present (v-if before v-else-if).
    const result: AssessmentResult = {
      id: 'DPIA',
      level: 'required',
      result: 'true',
      explanation: 'Verplicht.',
      required: true,
    }
    const wrapper = mount(AssessmentCard, {
      props: baseProps({ isCalculating: true, result }),
    })
    expect(wrapper.text()).toContain('Berekenen...')
    expect(wrapper.text()).not.toContain('Verplicht.')
  })
})

describe('AssessmentCard no-result branch', () => {
  it('renders "Niet verplicht" and grijs styling when no result and not calculating', () => {
    const wrapper = mount(AssessmentCard, {
      props: baseProps({ isCalculating: false, result: undefined }),
    })

    expect(wrapper.text()).toContain('Niet verplicht')

    const card = wrapper.find('.rvo-card')
    expect(card.classes()).toContain('rvo-card--full-colour--grijs-100')
    expect(card.classes()).not.toContain('rvo-card--full-colour--hemelblauw')

    const heading = wrapper.find('h2')
    expect(heading.classes()).toContain('font-hemelblauw')
    expect(heading.classes()).not.toContain('font-white')

    // introText is never rendered in this branch (template only reads it inside
    // the criteria block). Read it directly to exercise the `return ''` path
    // where neither isRecommended nor isRequired is true.
    expect((wrapper.vm as unknown as { introText: string }).introText).toBe('')
  })
})

describe('AssessmentCard non-required result branch', () => {
  it('renders "Niet verplicht" (v-else) when result exists but is not required/recommended', () => {
    const result: AssessmentResult = {
      id: 'DPIA',
      level: 'not_required',
      result: 'false',
      explanation: 'Geen DPIA nodig.',
      required: false,
    }
    const wrapper = mount(AssessmentCard, {
      props: baseProps({ result }),
    })

    expect(wrapper.text()).toContain('Niet verplicht')
    // No criteria list, no required explanation paragraph.
    expect(wrapper.findAll('ul')).toHaveLength(0)
    expect(wrapper.text()).not.toContain('Geen DPIA nodig.')

    // Not required => grijs card and hemelblauw font.
    const card = wrapper.find('.rvo-card')
    expect(card.classes()).toContain('rvo-card--full-colour--grijs-100')
  })
})

describe('AssessmentCard required with criteria branch', () => {
  it('renders the verplicht intro text and a criteria list with white font', () => {
    const result: AssessmentResult = {
      id: 'DPIA',
      level: 'required',
      result: 'true',
      explanation: 'Fallback uitleg.',
      required: true,
      criteria: [
        criterion('c1', 'Het verwerkt bijzondere persoonsgegevens.'),
        criterion('c2', 'Het betreft grootschalige verwerking.'),
      ],
    }
    const wrapper = mount(AssessmentCard, {
      props: baseProps({ id: 'DPIA', result }),
    })

    // introText required branch (isRequired true, isRecommended false).
    expect(wrapper.text()).toContain('Een DPIA is verplicht omdat:')

    const items = wrapper.findAll('ul li')
    expect(items).toHaveLength(2)
    expect(items[0].text()).toContain('Het verwerkt bijzondere persoonsgegevens.')
    expect(items[1].text()).toContain('Het betreft grootschalige verwerking.')

    // Required => hemelblauw card.
    const card = wrapper.find('.rvo-card')
    expect(card.classes()).toContain('rvo-card--full-colour--hemelblauw')

    // Heading and criteria block use white font.
    expect(wrapper.find('h2').classes()).toContain('font-white')
    const block = wrapper.find('ul').element.parentElement as HTMLElement
    expect(block.classList.contains('font-white')).toBe(true)

    // Fallback explanation paragraph should NOT render (hasCriteria true).
    expect(wrapper.text()).not.toContain('Fallback uitleg.')
  })
})

describe('AssessmentCard recommended with criteria branch', () => {
  it('renders the aanbevolen intro text when required and level is recommended', () => {
    const result: AssessmentResult = {
      id: 'DPIA',
      level: 'recommended',
      result: 'true',
      explanation: 'Fallback uitleg.',
      required: true,
      criteria: [criterion('c1', 'Verwerking met privacyrisico.')],
    }
    const wrapper = mount(AssessmentCard, {
      props: baseProps({ id: 'DPIA', result }),
    })

    // introText recommended branch (isRecommended true).
    expect(wrapper.text()).toContain('Een DPIA wordt aanbevolen omdat:')

    const items = wrapper.findAll('ul li')
    expect(items).toHaveLength(1)
    expect(items[0].text()).toContain('Verwerking met privacyrisico.')

    // recommended => required is true => hemelblauw card + white font.
    expect(wrapper.find('.rvo-card').classes()).toContain('rvo-card--full-colour--hemelblauw')
    expect(wrapper.find('h2').classes()).toContain('font-white')
  })
})

describe('AssessmentCard required without criteria (fallback) branch', () => {
  it('renders the fallback explanation paragraph when required but criteria is undefined', () => {
    const result: AssessmentResult = {
      id: 'DPIA',
      level: 'required',
      result: 'true',
      explanation: 'Een DPIA is verplicht op grond van de wet.',
      required: true,
      // no criteria => hasCriteria false
    }
    const wrapper = mount(AssessmentCard, {
      props: baseProps({ result }),
    })

    // v-else-if="isRequired || isRecommended" paragraph.
    expect(wrapper.text()).toContain('Een DPIA is verplicht op grond van de wet.')
    expect(wrapper.findAll('ul')).toHaveLength(0)
    expect(wrapper.text()).not.toContain('Niet verplicht')

    // The fallback paragraph carries the font-white class.
    const paras = wrapper.findAll('.rvo-card__content > p')
    const fallback = paras.find((p) => p.text().includes('Een DPIA is verplicht op grond van de wet.'))
    expect(fallback).toBeDefined()
    expect(fallback!.classes()).toContain('font-white')
  })

  it('renders the fallback explanation when required and criteria is an empty array (length 0)', () => {
    const result: AssessmentResult = {
      id: 'DPIA',
      level: 'required',
      result: 'true',
      explanation: 'Verplicht, geen criteria geraakt.',
      required: true,
      criteria: [], // hasCriteria false because length === 0
    }
    const wrapper = mount(AssessmentCard, {
      props: baseProps({ result }),
    })

    expect(wrapper.text()).toContain('Verplicht, geen criteria geraakt.')
    expect(wrapper.findAll('ul li')).toHaveLength(0)
  })

  it('renders the fallback explanation for recommended without criteria', () => {
    const result: AssessmentResult = {
      id: 'DPIA',
      level: 'recommended',
      result: 'true',
      explanation: 'Aanbevolen, geen criteria.',
      required: true,
      // no criteria
    }
    const wrapper = mount(AssessmentCard, {
      props: baseProps({ result }),
    })

    expect(wrapper.text()).toContain('Aanbevolen, geen criteria.')
    expect(wrapper.findAll('ul')).toHaveLength(0)
  })
})

describe('AssessmentCard isRecommended branch (required false short-circuit)', () => {
  it('treats level recommended as not recommended when required is false', () => {
    // isRecommended requires required === true; required false short-circuits.
    const result: AssessmentResult = {
      id: 'DPIA',
      level: 'recommended',
      result: 'false',
      explanation: 'Niet relevant.',
      required: false,
    }
    const wrapper = mount(AssessmentCard, {
      props: baseProps({ result }),
    })

    // Neither required nor recommended => non-required branch.
    expect(wrapper.text()).toContain('Niet verplicht')
    expect(wrapper.text()).not.toContain('aanbevolen')
    expect(wrapper.find('.rvo-card').classes()).toContain('rvo-card--full-colour--grijs-100')
  })

  it('is required but not recommended when required true and level is not recommended', () => {
    // Drives isRecommended right-hand side: level !== 'recommended'.
    const result: AssessmentResult = {
      id: 'DPIA',
      level: 'required',
      result: 'true',
      explanation: 'Verplicht zonder aanbeveling.',
      required: true,
    }
    const wrapper = mount(AssessmentCard, {
      props: baseProps({ result }),
    })

    expect(wrapper.text()).toContain('Verplicht zonder aanbeveling.')
    // introText must use the verplicht phrasing, not the aanbevolen phrasing.
    expect(wrapper.text()).not.toContain('aanbevolen')
  })
})

describe('AssessmentCard hasCriteria with non-required result', () => {
  it('ignores criteria for a non-required result and shows "Niet verplicht"', () => {
    // hasCriteria true but (isRequired || isRecommended) false => v-else paragraph.
    const result: AssessmentResult = {
      id: 'DPIA',
      level: 'not_required',
      result: 'false',
      explanation: 'Niet verplicht uitleg.',
      required: false,
      criteria: [criterion('c1', 'Wordt genegeerd.')],
    }
    const wrapper = mount(AssessmentCard, {
      props: baseProps({ result }),
    })

    expect(wrapper.text()).toContain('Niet verplicht')
    expect(wrapper.findAll('ul')).toHaveLength(0)
    expect(wrapper.text()).not.toContain('Wordt genegeerd.')
  })
})

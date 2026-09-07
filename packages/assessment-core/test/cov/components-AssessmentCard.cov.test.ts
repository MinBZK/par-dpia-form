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

function statusTag(wrapper: ReturnType<typeof mount>) {
  return wrapper.find('nldd-tag')
}

describe('AssessmentCard rendering basics', () => {
  it('always renders the title and definition in the heading', () => {
    const wrapper = mount(AssessmentCard, { props: baseProps() })

    const heading = wrapper.find('nldd-title h2')
    expect(heading.exists()).toBe(true)
    expect(heading.text()).toContain('Data Protection Impact Assessment')
    expect(wrapper.find('.aiv-definition-text').text()).toContain(
      'Een beoordeling van privacyrisicos.',
    )
    expect(wrapper.find('nldd-card').exists()).toBe(true)
  })
})

describe('AssessmentCard isCalculating branch', () => {
  it('shows the loading text and no status tag while calculating', () => {
    const wrapper = mount(AssessmentCard, {
      props: baseProps({ isCalculating: true, result: undefined }),
    })

    expect(wrapper.text()).toContain('Berekenen...')
    expect(statusTag(wrapper).exists()).toBe(false)
    expect(wrapper.findAll('ul')).toHaveLength(0)
  })

  it('hides the result content while still calculating', () => {
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
    expect(statusTag(wrapper).exists()).toBe(false)
  })
})

describe('AssessmentCard no-result branch', () => {
  it('shows the neutral "Niet verplicht" tag when no result and not calculating', () => {
    const wrapper = mount(AssessmentCard, {
      props: baseProps({ isCalculating: false, result: undefined }),
    })

    const tag = statusTag(wrapper)
    expect(tag.attributes('text')).toBe('Niet verplicht')
    expect(tag.attributes('color')).toBe('neutral')

    // introText never renders in this branch; read it directly to cover the `return ''` path.
    expect((wrapper.vm as unknown as { introText: string }).introText).toBe('')
  })
})

describe('AssessmentCard non-required result branch', () => {
  it('shows the neutral tag when result exists but is not required/recommended', () => {
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

    const tag = statusTag(wrapper)
    expect(tag.attributes('text')).toBe('Niet verplicht')
    expect(tag.attributes('color')).toBe('neutral')
    expect(wrapper.findAll('ul')).toHaveLength(0)
    expect(wrapper.text()).not.toContain('Geen DPIA nodig.')
  })
})

describe('AssessmentCard required with criteria branch', () => {
  it('renders the verplicht intro text, the accent tag and a criteria list', () => {
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

    expect(wrapper.text()).toContain('Een DPIA is verplicht omdat:')

    const items = wrapper.findAll('ul li')
    expect(items).toHaveLength(2)
    expect(items[0].text()).toContain('Het verwerkt bijzondere persoonsgegevens.')
    expect(items[1].text()).toContain('Het betreft grootschalige verwerking.')

    const tag = statusTag(wrapper)
    expect(tag.attributes('text')).toBe('Verplicht')
    expect(tag.attributes('color')).toBe('accent')

    expect(wrapper.text()).not.toContain('Fallback uitleg.')
  })
})

describe('AssessmentCard recommended with criteria branch', () => {
  it('renders the aanbevolen intro text and warning tag when required and level is recommended', () => {
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

    expect(wrapper.text()).toContain('Een DPIA wordt aanbevolen omdat:')

    const items = wrapper.findAll('ul li')
    expect(items).toHaveLength(1)
    expect(items[0].text()).toContain('Verwerking met privacyrisico.')

    const tag = statusTag(wrapper)
    expect(tag.attributes('text')).toBe('Aanbevolen')
    expect(tag.attributes('color')).toBe('warning')
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
    }
    const wrapper = mount(AssessmentCard, {
      props: baseProps({ result }),
    })

    expect(wrapper.text()).toContain('Een DPIA is verplicht op grond van de wet.')
    expect(wrapper.findAll('ul')).toHaveLength(0)
    expect(statusTag(wrapper).attributes('text')).toBe('Verplicht')
  })

  it('renders the fallback explanation when required and criteria is an empty array (length 0)', () => {
    const result: AssessmentResult = {
      id: 'DPIA',
      level: 'required',
      result: 'true',
      explanation: 'Verplicht, geen criteria geraakt.',
      required: true,
      criteria: [],
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
    }
    const wrapper = mount(AssessmentCard, {
      props: baseProps({ result }),
    })

    expect(wrapper.text()).toContain('Aanbevolen, geen criteria.')
    expect(wrapper.findAll('ul')).toHaveLength(0)
    expect(statusTag(wrapper).attributes('text')).toBe('Aanbevolen')
  })
})

describe('AssessmentCard isRecommended branch (required false short-circuit)', () => {
  it('treats level recommended as not recommended when required is false', () => {
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

    const tag = statusTag(wrapper)
    expect(tag.attributes('text')).toBe('Niet verplicht')
    expect(tag.attributes('color')).toBe('neutral')
    expect(wrapper.text()).not.toContain('aanbevolen')
  })

  it('is required but not recommended when required true and level is not recommended', () => {
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
    expect(wrapper.text()).not.toContain('aanbevolen')
    expect(statusTag(wrapper).attributes('text')).toBe('Verplicht')
  })
})

describe('AssessmentCard hasCriteria with non-required result', () => {
  it('ignores criteria for a non-required result and shows the neutral tag', () => {
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

    expect(statusTag(wrapper).attributes('text')).toBe('Niet verplicht')
    expect(wrapper.findAll('ul')).toHaveLength(0)
    expect(wrapper.text()).not.toContain('Wordt genegeerd.')
  })
})

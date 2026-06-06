import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import Results from '../../src/components/Results.vue'
import { useCalculationStore, type AssessmentResult } from '../../src/stores/calculations'

const ASSESSMENT_IDS = ['DPIA', 'IAMA', 'DTIA', 'KIA']

function makeResult(id: string): AssessmentResult {
  return {
    id,
    level: 'required',
    result: 'Verplicht',
    explanation: `Een ${id} is verplicht`,
    required: true,
  }
}

// init() is spied in each test so onMounted does not start the heavy JEXL pipeline.
function mountResults() {
  const wrapper = mount(Results, {
    global: {
      stubs: {
        AssessmentCard: {
          name: 'AssessmentCard',
          props: ['id', 'title', 'definition', 'result', 'isCalculating'],
          template: '<div class="stub-card" :data-id="id" />',
        },
      },
    },
  })
  return wrapper
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn>
let consoleWarnSpy: ReturnType<typeof vi.spyOn>
let consoleLogSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  setActivePinia(createPinia())
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  consoleErrorSpy.mockRestore()
  consoleWarnSpy.mockRestore()
  consoleLogSpy.mockRestore()
})

describe('Results.vue onMounted', () => {
  it('calls calculationStore.init() once when mounted', () => {
    const calculationStore = useCalculationStore()
    const initSpy = vi.spyOn(calculationStore, 'init').mockImplementation(() => {})

    mountResults()

    expect(initSpy).toHaveBeenCalledTimes(1)
  })
})

describe('Results.vue assessment card rendering', () => {
  it('renders exactly one AssessmentCard for each of the four assessment configs', () => {
    const calculationStore = useCalculationStore()
    vi.spyOn(calculationStore, 'init').mockImplementation(() => {})

    const wrapper = mountResults()
    const cards = wrapper.findAllComponents({ name: 'AssessmentCard' })

    expect(cards).toHaveLength(ASSESSMENT_IDS.length)
    expect(cards.map((c) => c.props('id'))).toEqual(ASSESSMENT_IDS)
    expect(cards.map((c) => c.props('title'))).toEqual(ASSESSMENT_IDS)
  })

  it('passes a non-empty definition string to every card', () => {
    const calculationStore = useCalculationStore()
    vi.spyOn(calculationStore, 'init').mockImplementation(() => {})

    const wrapper = mountResults()
    const cards = wrapper.findAllComponents({ name: 'AssessmentCard' })

    for (const card of cards) {
      expect(typeof card.props('definition')).toBe('string')
      expect((card.props('definition') as string).length).toBeGreaterThan(0)
    }
  })

  it('forwards the store isCalculating flag to each card', () => {
    const calculationStore = useCalculationStore()
    vi.spyOn(calculationStore, 'init').mockImplementation(() => {})
    calculationStore.isCalculating = true

    const wrapper = mountResults()
    const cards = wrapper.findAllComponents({ name: 'AssessmentCard' })

    for (const card of cards) {
      expect(card.props('isCalculating')).toBe(true)
    }
  })
})

describe('Results.vue getAssessmentResult lookup', () => {
  it('passes the matching result only to the card whose id is present in the store', () => {
    const calculationStore = useCalculationStore()
    vi.spyOn(calculationStore, 'init').mockImplementation(() => {})
    calculationStore.assessmentResults = [makeResult('DPIA')]

    const wrapper = mountResults()
    const cards = wrapper.findAllComponents({ name: 'AssessmentCard' })

    const byId = (id: string) => cards.find((c) => c.props('id') === id)!

    expect(byId('DPIA').props('result')).toEqual(makeResult('DPIA'))
    expect(byId('IAMA').props('result')).toBeUndefined()
    expect(byId('DTIA').props('result')).toBeUndefined()
    expect(byId('KIA').props('result')).toBeUndefined()
  })

  it('passes undefined result to all cards when the store has no results', () => {
    const calculationStore = useCalculationStore()
    vi.spyOn(calculationStore, 'init').mockImplementation(() => {})
    calculationStore.assessmentResults = []

    const wrapper = mountResults()
    const cards = wrapper.findAllComponents({ name: 'AssessmentCard' })

    for (const card of cards) {
      expect(card.props('result')).toBeUndefined()
    }
  })

  it('matches every assessment when the store holds results for all four ids', () => {
    const calculationStore = useCalculationStore()
    vi.spyOn(calculationStore, 'init').mockImplementation(() => {})
    calculationStore.assessmentResults = ASSESSMENT_IDS.map(makeResult)

    const wrapper = mountResults()
    const cards = wrapper.findAllComponents({ name: 'AssessmentCard' })

    for (const card of cards) {
      const id = card.props('id') as string
      expect(card.props('result')).toEqual(makeResult(id))
    }
  })
})

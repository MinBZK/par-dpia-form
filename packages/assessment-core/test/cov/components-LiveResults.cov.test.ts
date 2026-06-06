import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'
import type { AssessmentResult } from '../../src/stores/calculations'

const init = vi.fn()
const assessmentResults = ref<AssessmentResult[]>([])
const isCalculating = ref(false)
const calculationErrors = ref<string[]>([])

vi.mock('../../src/stores/calculations', () => ({
  useCalculationStore: () => ({
    init,
    get assessmentResults() {
      return assessmentResults.value
    },
    get isCalculating() {
      return isCalculating.value
    },
    get calculationErrors() {
      return calculationErrors.value
    },
  }),
}))

// Import AFTER vi.mock so the SFC picks up the fake store.
import LiveResults from '../../src/components/LiveResults.vue'

function result(overrides: Partial<AssessmentResult> & { id: string }): AssessmentResult {
  return {
    level: 'required',
    result: '',
    explanation: '',
    required: false,
    ...overrides,
  }
}

beforeEach(() => {
  init.mockClear()
  assessmentResults.value = []
  isCalculating.value = false
  calculationErrors.value = []
})

describe('LiveResults.vue', () => {
  describe('onMounted', () => {
    it('calls calculationStore.init() on mount', () => {
      mount(LiveResults)
      expect(init).toHaveBeenCalledTimes(1)
    })
  })

  describe('hasRequiredOrRecommendedAssessments computed', () => {
    it('renders the static "no assessments" block when none are required or recommended', () => {
      assessmentResults.value = [result({ id: 'DPIA', required: false, level: 'not_required' })]

      const wrapper = mount(LiveResults)

      expect(wrapper.find('details').exists()).toBe(false)
      expect(wrapper.find('.rvo-accordion-teaser').text()).toBe(
        'Op basis van de huidige antwoorden zijn er geen assessments vereist.',
      )
      expect(wrapper.text()).toContain('Tussenresultaten pre-scan')
    })

    it('renders the expandable accordion when an assessment is required (left side of ||)', () => {
      assessmentResults.value = [result({ id: 'DPIA', required: true, level: 'required' })]

      const wrapper = mount(LiveResults)

      expect(wrapper.find('details').exists()).toBe(true)
      expect(wrapper.find('.rvo-accordion-teaser').text()).toBe(
        'Op basis van de huidige antwoorden zijn er verplichte/aangeraden assessments.',
      )
    })

    it('renders the expandable accordion when an assessment is recommended (right side of ||)', () => {
      assessmentResults.value = [result({ id: 'KIA', required: false, level: 'recommended' })]

      const wrapper = mount(LiveResults)

      expect(wrapper.find('details').exists()).toBe(true)
    })
  })

  describe('isCalculating branch', () => {
    it('shows the "Berekenen..." placeholder while calculating', () => {
      assessmentResults.value = [result({ id: 'DPIA', required: true })]
      isCalculating.value = true

      const wrapper = mount(LiveResults)

      expect(wrapper.find('.rvo-accordion__content').text()).toContain('Berekenen...')
    })

    it('shows results (not the placeholder) when not calculating', () => {
      assessmentResults.value = [result({ id: 'DPIA', required: true })]
      isCalculating.value = false

      const wrapper = mount(LiveResults)

      expect(wrapper.find('.rvo-accordion__content').text()).not.toContain('Berekenen...')
      expect(wrapper.text()).toContain('DPIA')
    })
  })

  describe('renderAssessmentExplanation intro text', () => {
    it('uses "wordt aanbevolen" for a recommended assessment with criteria', () => {
      assessmentResults.value = [
        result({
          id: 'IAMA',
          required: true,
          level: 'recommended',
          criteria: [{ id: 'c1', met: true, explanation: 'reden A' }],
          explanation: 'uitleg',
        }),
      ]

      const wrapper = mount(LiveResults)

      expect(wrapper.text()).toContain('Een IAMA wordt aanbevolen omdat:')
      const items = wrapper.findAll('.utrecht-unordered-list__item')
      expect(items).toHaveLength(1)
      expect(items[0].text()).toContain('reden A')
    })

    it('uses "is sterk aanbevolen" for a non-recommended IAMA with criteria', () => {
      assessmentResults.value = [
        result({
          id: 'IAMA',
          required: true,
          level: 'required',
          criteria: [{ id: 'c1', met: true, explanation: 'reden B' }],
        }),
      ]

      const wrapper = mount(LiveResults)

      expect(wrapper.text()).toContain('Een IAMA is sterk aanbevolen omdat:')
    })

    it('uses "is aanbevolen" for a non-recommended KIA with criteria', () => {
      assessmentResults.value = [
        result({
          id: 'KIA',
          required: true,
          level: 'required',
          criteria: [{ id: 'c1', met: true, explanation: 'reden C' }],
        }),
      ]

      const wrapper = mount(LiveResults)

      expect(wrapper.text()).toContain('Een KIA is aanbevolen omdat:')
    })

    it('uses "is verplicht" for a non-recommended, non-IAMA, non-KIA assessment with criteria', () => {
      assessmentResults.value = [
        result({
          id: 'DPIA',
          required: true,
          level: 'required',
          criteria: [
            { id: 'c1', met: true, explanation: 'reden D1' },
            { id: 'c2', met: true, explanation: 'reden D2' },
          ],
        }),
      ]

      const wrapper = mount(LiveResults)

      expect(wrapper.text()).toContain('Een DPIA is verplicht omdat:')
      const items = wrapper.findAll('.utrecht-unordered-list__item')
      expect(items).toHaveLength(2)
      expect(items[0].text()).toContain('reden D1')
      expect(items[1].text()).toContain('reden D2')
    })
  })

  describe('renderAssessmentExplanation criteria vs fallback branch', () => {
    it('falls back to the plain explanation (v-html) when there are no criteria', () => {
      assessmentResults.value = [
        result({
          id: 'DPIA',
          required: true,
          level: 'required',
          explanation: 'Regel 1\nRegel 2',
        }),
      ]

      const wrapper = mount(LiveResults)

      expect(wrapper.findAll('.utrecht-unordered-list__item')).toHaveLength(0)
      const html = wrapper.html()
      expect(html).toContain('Regel 1<br>Regel 2')
    })

    it('falls back when criteria is an empty array (length > 0 is false)', () => {
      assessmentResults.value = [
        result({
          id: 'DPIA',
          required: true,
          level: 'required',
          criteria: [],
          explanation: 'Lege criteria uitleg',
        }),
      ]

      const wrapper = mount(LiveResults)

      expect(wrapper.findAll('.utrecht-unordered-list__item')).toHaveLength(0)
      expect(wrapper.text()).toContain('Lege criteria uitleg')
    })

    it('uses empty-string fallback for text when explanation is missing in the no-criteria branch', () => {
      assessmentResults.value = [
        result({
          id: 'DPIA',
          required: true,
          level: 'required',
          explanation: '',
        }),
      ]

      const wrapper = mount(LiveResults)

      expect(wrapper.findAll('.utrecht-unordered-list__item')).toHaveLength(0)
      expect(wrapper.text()).toContain('DPIA')
    })

    it('uses empty-string fallback for text when explanation is missing in the with-criteria branch', () => {
      assessmentResults.value = [
        result({
          id: 'DPIA',
          required: true,
          level: 'required',
          criteria: [{ id: 'c1', met: true, explanation: 'reden E' }],
          explanation: undefined as unknown as string,
        }),
      ]

      const wrapper = mount(LiveResults)

      expect(wrapper.text()).toContain('Een DPIA is verplicht omdat:')
      expect(wrapper.text()).toContain('reden E')
    })
  })

  describe('required filter in v-for', () => {
    it('only renders assessments where required is true', () => {
      assessmentResults.value = [
        result({ id: 'DPIA', required: true, level: 'required', explanation: 'verplicht' }),
        result({ id: 'KIA', required: false, level: 'recommended', explanation: 'aanbevolen' }),
      ]

      const wrapper = mount(LiveResults)

      const strongs = wrapper.findAll('strong').map((s) => s.text())
      expect(strongs).toContain('DPIA')
      expect(strongs).not.toContain('KIA')
    })
  })

  describe('calculationErrors branch', () => {
    it('renders the error list when there are calculation errors', () => {
      assessmentResults.value = [result({ id: 'DPIA', required: true, explanation: 'x' })]
      calculationErrors.value = ['Fout 1', 'Fout 2']

      const wrapper = mount(LiveResults)

      expect(wrapper.text()).toContain('Er zijn fouten opgetreden tijdens de berekening:')
      const errorItems = wrapper.findAll('ul:not(.utrecht-unordered-list) li')
      expect(errorItems.map((li) => li.text())).toEqual(['Fout 1', 'Fout 2'])
    })

    it('does not render the error block when there are no calculation errors', () => {
      assessmentResults.value = [result({ id: 'DPIA', required: true, explanation: 'x' })]
      calculationErrors.value = []

      const wrapper = mount(LiveResults)

      expect(wrapper.text()).not.toContain('Er zijn fouten opgetreden tijdens de berekening:')
    })
  })
})

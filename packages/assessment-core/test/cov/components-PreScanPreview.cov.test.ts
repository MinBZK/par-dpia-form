import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import type { AnswerValue, ImageValue } from '../../src/stores/answers'

// Hoisted mock holder so each test can control getPreviewDataForSection's return.
const previewHolder: {
  getPreviewDataForSection: ReturnType<typeof vi.fn>
} = {
  getPreviewDataForSection: vi.fn(),
}

vi.mock('../../src/composables/usePreScanReferences', () => ({
  usePreScanReferences: () => ({
    getPreviewDataForSection: previewHolder.getPreviewDataForSection,
  }),
}))

// Import AFTER the mock is registered so the component picks up the stub.
import PreScanPreview from '../../src/components/PreScanPreview.vue'

interface PreviewItem {
  taskId: string
  taskTitle: string
  answer: AnswerValue
}

function item(taskId: string, taskTitle: string, answer: AnswerValue): PreviewItem {
  return { taskId, taskTitle, answer }
}

async function mountPreview(dpiaTaskId = '2.1') {
  const wrapper = mount(PreScanPreview, { props: { dpiaTaskId } })
  // Flush onMounted's loadPreScanAnswers before reading the DOM.
  await nextTick()
  return wrapper
}

beforeEach(() => {
  setActivePinia(createPinia())
  previewHolder.getPreviewDataForSection.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('PreScanPreview hasPreScanData (v-if)', () => {
  it('renders nothing when getPreviewDataForSection returns an empty list', async () => {
    previewHolder.getPreviewDataForSection.mockReturnValue([])

    const wrapper = await mountPreview('2.1')

    expect(wrapper.find('.rvo-accordion').exists()).toBe(false)
    expect(wrapper.text()).toBe('')
    expect(previewHolder.getPreviewDataForSection).toHaveBeenCalledWith('2.1')
  })

  it('renders the accordion with the Dutch header when there is data', async () => {
    previewHolder.getPreviewDataForSection.mockReturnValue([
      item('1.2', 'Doel van de verwerking', 'Klantenbeheer'),
    ])

    const wrapper = await mountPreview('2.1')

    expect(wrapper.find('.rvo-accordion').exists()).toBe(true)
    expect(wrapper.text()).toContain('Informatie uit pre-scan')
    expect(wrapper.text()).toContain(
      'Je hebt in de pre-scan informatie ingevuld die mogelijk relevant is.',
    )
    expect(wrapper.text()).toContain('1.2. Doel van de verwerking')
  })

  it('renders one entry per preview item with the formatted answer', async () => {
    previewHolder.getPreviewDataForSection.mockReturnValue([
      item('1.1', 'Eerste', 'Antwoord A'),
      item('1.3', 'Tweede', 'Antwoord B'),
    ])

    const wrapper = await mountPreview()

    const entries = wrapper.findAll('.rvo-accordion__content > div')
    expect(entries).toHaveLength(2)
    expect(entries[0].text()).toContain('1.1. Eerste')
    expect(entries[1].text()).toContain('1.3. Tweede')
  })
})

describe('PreScanPreview formatAnswer branches', () => {
  it('renders an empty paragraph for a null answer', async () => {
    previewHolder.getPreviewDataForSection.mockReturnValue([
      item('1.1', 'Null antwoord', null),
    ])

    const wrapper = await mountPreview()
    const paras = wrapper.findAll('.rvo-accordion__content p')
    // paras[0] is the strong title; paras[1] is the v-html answer.
    expect(paras[1].html()).toContain('<p></p>')
  })

  it('renders an empty paragraph for an undefined answer', async () => {
    previewHolder.getPreviewDataForSection.mockReturnValue([
      item('1.1', 'Undefined antwoord', undefined as unknown as AnswerValue),
    ])

    const wrapper = await mountPreview()
    const paras = wrapper.findAll('.rvo-accordion__content p')
    expect(paras[1].text()).toBe('')
  })

  it('joins array answers with a comma and space', async () => {
    previewHolder.getPreviewDataForSection.mockReturnValue([
      item('1.1', 'Lijst', ['Een', 'Twee', 'Drie']),
    ])

    const wrapper = await mountPreview()
    expect(wrapper.text()).toContain('Een, Twee, Drie')
  })

  it('maps the string "true" to "Ja"', async () => {
    previewHolder.getPreviewDataForSection.mockReturnValue([
      item('1.1', 'Boolean ja', 'true'),
    ])

    const wrapper = await mountPreview()
    const paras = wrapper.findAll('.rvo-accordion__content p')
    expect(paras[1].text()).toBe('Ja')
  })

  it('maps the string "false" to "Nee"', async () => {
    previewHolder.getPreviewDataForSection.mockReturnValue([
      item('1.1', 'Boolean nee', 'false'),
    ])

    const wrapper = await mountPreview()
    const paras = wrapper.findAll('.rvo-accordion__content p')
    expect(paras[1].text()).toBe('Nee')
  })

  it('renders an empty paragraph for an object (e.g. ImageValue) answer', async () => {
    const image: ImageValue = { data: 'data:image/png;base64,abc', title: 'Plaatje' }
    previewHolder.getPreviewDataForSection.mockReturnValue([
      item('1.1', 'Object', image),
    ])

    const wrapper = await mountPreview()
    const paras = wrapper.findAll('.rvo-accordion__content p')
    expect(paras[1].text()).toBe('')
  })

  it('returns a plain string answer verbatim (default branch)', async () => {
    previewHolder.getPreviewDataForSection.mockReturnValue([
      item('1.1', 'Tekst', 'Gewone tekst'),
    ])

    const wrapper = await mountPreview()
    const paras = wrapper.findAll('.rvo-accordion__content p')
    expect(paras[1].text()).toBe('Gewone tekst')
  })
})

describe('PreScanPreview dpiaTaskId watcher', () => {
  it('reloads preview data when the dpiaTaskId prop changes', async () => {
    previewHolder.getPreviewDataForSection.mockImplementation((id: string) =>
      id === '2.1'
        ? [item('1.1', 'Sectie 2', 'Eerste sectie')]
        : [item('3.4', 'Sectie 5', 'Tweede sectie')],
    )

    const wrapper = await mountPreview('2.1')
    expect(wrapper.text()).toContain('1.1. Sectie 2')
    expect(previewHolder.getPreviewDataForSection).toHaveBeenLastCalledWith('2.1')

    await wrapper.setProps({ dpiaTaskId: '5.1' })
    await nextTick()

    expect(previewHolder.getPreviewDataForSection).toHaveBeenLastCalledWith('5.1')
    expect(wrapper.text()).toContain('3.4. Sectie 5')
    expect(wrapper.text()).not.toContain('Sectie 2')
  })

  it('hides the accordion when the new section has no preview data', async () => {
    previewHolder.getPreviewDataForSection.mockImplementation((id: string) =>
      id === '2.1' ? [item('1.1', 'Heeft data', 'X')] : [],
    )

    const wrapper = await mountPreview('2.1')
    expect(wrapper.find('.rvo-accordion').exists()).toBe(true)

    await wrapper.setProps({ dpiaTaskId: '9.9' })
    await nextTick()

    expect(wrapper.find('.rvo-accordion').exists()).toBe(false)
  })
})

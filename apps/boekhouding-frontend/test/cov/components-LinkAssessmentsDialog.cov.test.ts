/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const assessmentsList = vi.fn()
const assessmentsLinks = vi.fn()
const assessmentsSetLinks = vi.fn()
vi.mock('../../src/api', () => ({
  assessments: {
    list: (...a: unknown[]) => assessmentsList(...a),
    links: (...a: unknown[]) => assessmentsLinks(...a),
    setLinks: (...a: unknown[]) => assessmentsSetLinks(...a),
  },
}))

import LinkAssessmentsDialog from '../../src/components/LinkAssessmentsDialog.vue'

const item = (id: string, assessmentType: string, name = id) => ({ id, assessmentType, name, projectId: 'p1' })
const link = (assessmentId: string, direction: string) =>
  ({ assessmentId, assessmentType: 'dpia', name: assessmentId, updatedAt: 't', direction })

const IAMA = { id: 'iama1', projectId: 'p1', assessmentType: 'iama' as const }

async function mountOpen() {
  const wrapper = mount(LinkAssessmentsDialog, { props: { open: false, assessment: IAMA } })
  await wrapper.setProps({ open: true })
  await flushPromises()
  return wrapper
}

const checkbox = (wrapper: Awaited<ReturnType<typeof mountOpen>>, id: string) =>
  wrapper.find(`input[value="${id}"]`).element as HTMLInputElement

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn()
  HTMLDialogElement.prototype.close = vi.fn()
  assessmentsList.mockReset()
  assessmentsLinks.mockReset()
  assessmentsSetLinks.mockReset()
  assessmentsList.mockResolvedValue({
    items: [item('iama1', 'iama'), item('iama2', 'iama'), item('dpia1', 'dpia', 'DPIA Klantportaal'), item('dpia2', 'dpia'), item('ps1', 'prescan')],
    total: 5,
  })
  assessmentsLinks.mockResolvedValue({ links: [link('dpia1', 'outgoing'), link('ps1', 'incoming')] })
  assessmentsSetLinks.mockResolvedValue({ links: [] })
})

describe('LinkAssessmentsDialog', () => {
  it('offers the other types of the project, with the current links ticked', async () => {
    const wrapper = await mountOpen()

    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled()
    expect(assessmentsList).toHaveBeenCalledWith('p1', 1, 500)
    expect(assessmentsLinks).toHaveBeenCalledWith('iama1')
    const offered = wrapper.findAll('input[type="checkbox"]').map((input) => (input.element as HTMLInputElement).value)
    expect(offered).toEqual(['dpia1', 'dpia2', 'ps1'])
    expect(wrapper.text()).toContain('DPIA: DPIA Klantportaal')
    expect(checkbox(wrapper, 'dpia1').checked).toBe(true)
    expect(checkbox(wrapper, 'dpia2').checked).toBe(false)
    // A link made from the other side is shown, but undone there.
    expect(checkbox(wrapper, 'ps1').checked).toBe(true)
    expect(checkbox(wrapper, 'ps1').disabled).toBe(true)
    expect(wrapper.text()).toContain('Deze is vanuit ps1 aan deze assessment gekoppeld. Ontkoppelen kan daar.')
  })

  it('saves the ticked links, then reports saved and closes', async () => {
    const wrapper = await mountOpen()
    await wrapper.find('input[value="dpia1"]').trigger('change')
    await wrapper.find('input[value="dpia2"]').trigger('change')
    await wrapper.findAll('button').find((b) => b.text() === 'Opslaan')!.trigger('click')
    await flushPromises()

    expect(assessmentsSetLinks).toHaveBeenCalledWith('iama1', ['dpia2'])
    expect(wrapper.emitted('saved')).toHaveLength(1)
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('shows why saving failed and stays open', async () => {
    const wrapper = await mountOpen()
    assessmentsSetLinks.mockRejectedValueOnce(new Error('Je kunt alleen andere assessments uit hetzelfde project koppelen.'))
    await wrapper.findAll('button').find((b) => b.text() === 'Opslaan')!.trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toBe('Je kunt alleen andere assessments uit hetzelfde project koppelen.')

    assessmentsSetLinks.mockRejectedValueOnce('geen Error')
    await wrapper.findAll('button').find((b) => b.text() === 'Opslaan')!.trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toBe('Koppelen is niet gelukt.')
    expect(wrapper.emitted('saved')).toBeUndefined()
  })

  it('says so when loading fails or there is nothing to link to', async () => {
    assessmentsLinks.mockRejectedValueOnce(new Error('netwerk'))
    let wrapper = await mountOpen()
    expect(wrapper.find('[role="alert"]').text()).toContain('konden niet worden geladen')
    wrapper.unmount()

    assessmentsList.mockResolvedValueOnce({ items: [item('iama1', 'iama')], total: 1 })
    assessmentsLinks.mockResolvedValueOnce({ links: [] })
    wrapper = await mountOpen()
    expect(wrapper.text()).toContain('Dit project heeft geen andere soort assessment om aan te koppelen.')
  })

  it('closes through Annuleer, the dialog itself, and when the parent closes it', async () => {
    const wrapper = await mountOpen()
    await wrapper.findAll('button').find((b) => b.text() === 'Annuleer')!.trigger('click')
    await wrapper.find('dialog').trigger('close')
    expect(wrapper.emitted('close')).toHaveLength(2)

    await wrapper.setProps({ open: false })
    expect(HTMLDialogElement.prototype.close).toHaveBeenCalled()
  })
})

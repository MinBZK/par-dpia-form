/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import ConflictResolutionDialog, {
  type ConflictField,
} from '../../src/components/ConflictResolutionDialog.vue'

function makeField(overrides: Partial<ConflictField> = {}): ConflictField {
  return {
    fieldId: '2.1.1',
    label: 'E-mailadres',
    myValue: 'mijn',
    theirValue: 'hun',
    myFormatted: '<strong>mijn</strong>',
    theirFormatted: '<em>hun</em>',
    ...overrides,
  }
}

// The nldd-modal-dialog custom element is not registered in jsdom; its
// imperative API is stubbed per test on the host element.
function stubModal(wrapper: ReturnType<typeof mount>) {
  const host = wrapper.find('nldd-modal-dialog').element as HTMLElement & {
    show?: () => void
    hide?: () => void
  }
  host.show = vi.fn()
  host.hide = vi.fn()
  return host
}

const resolveButton = (wrapper: ReturnType<typeof mount>) =>
  wrapper.findAll('nldd-button').find((b) => b.attributes('text') === 'Toepassen')!

// One nldd-form-section per conflicting field; inside it the two choices in
// source order: index 0 is "mine", index 1 is "theirs".
const sections = (wrapper: VueWrapper) => wrapper.findAll('nldd-form-section')
const options = (wrapper: VueWrapper, field = 0) => sections(wrapper)[field].findAll('.conflict-option')

describe('ConflictResolutionDialog', () => {
  it('renders the heading, intro text and table headers', () => {
    const wrapper = mount(ConflictResolutionDialog, {
      props: { active: false, fields: [] },
    })

    expect(wrapper.find('nldd-modal-dialog').attributes('text')).toBe('Bewerkingsconflict')
    expect(wrapper.find('p').text()).toContain(
      'Een andere gebruiker heeft dezelfde velden gewijzigd.',
    )
    expect(sections(wrapper)).toHaveLength(0)
  })

  it('renders one row per field with label and v-html formatted values', () => {
    const fields = [
      makeField({ fieldId: 'a', label: 'Veld A' }),
      makeField({ fieldId: 'b', label: 'Veld B' }),
    ]
    const wrapper = mount(ConflictResolutionDialog, {
      props: { active: false, fields },
    })

    const found = sections(wrapper)
    expect(found).toHaveLength(2)
    expect(found[0].attributes('text')).toBe('Veld A')
    expect(found[1].attributes('text')).toBe('Veld B')
    expect(found[0].html()).toContain('<strong>mijn</strong>')
    expect(found[0].html()).toContain('<em>hun</em>')
    expect(options(wrapper)[0].text()).toContain('Jouw waarde')
    expect(options(wrapper)[1].text()).toContain('Andere waarde')
  })

  it('opens the modal and defaults every field to "mine" when active becomes true', async () => {
    const fields = [makeField({ fieldId: 'a' }), makeField({ fieldId: 'b' })]
    const wrapper = mount(ConflictResolutionDialog, {
      props: { active: false, fields },
    })
    const host = stubModal(wrapper)

    await wrapper.setProps({ active: true })

    expect(host.show).toHaveBeenCalledTimes(1)
    expect(host.hide).not.toHaveBeenCalled()

    expect(options(wrapper, 0)[0].classes()).toContain('conflict-option--selected')
    expect(options(wrapper, 1)[0].classes()).toContain('conflict-option--selected')
    expect(options(wrapper, 0)[1].classes()).not.toContain('conflict-option--selected')

    const mineRadio = options(wrapper, 0)[0].find('input[type="radio"]').element as HTMLInputElement
    const theirRadio = options(wrapper, 0)[1].find('input[type="radio"]').element as HTMLInputElement
    expect(mineRadio.checked).toBe(true)
    expect(theirRadio.checked).toBe(false)

    wrapper.unmount()
  })

  it('hides the modal when active becomes false', async () => {
    const wrapper = mount(ConflictResolutionDialog, {
      props: { active: true, fields: [makeField()] },
    })
    const host = stubModal(wrapper)
    // Mounting with active:true does not fire the watcher (only changes do); toggle to exercise both branches.
    await wrapper.setProps({ active: false })
    ;(host.hide as ReturnType<typeof vi.fn>).mockClear()
    await wrapper.setProps({ active: true })
    await wrapper.setProps({ active: false })

    expect(host.hide).toHaveBeenCalled()

    wrapper.unmount()
  })

  it('reopens the modal when dismissed while the conflict is still active (non-dismissable)', async () => {
    const wrapper = mount(ConflictResolutionDialog, {
      props: { active: false, fields: [makeField()] },
    })
    const host = stubModal(wrapper)
    await wrapper.setProps({ active: true })
    ;(host.show as ReturnType<typeof vi.fn>).mockClear()

    wrapper.find('nldd-modal-dialog').element.dispatchEvent(new CustomEvent('close'))
    expect(host.show).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })

  it('does not reopen on close once the conflict is resolved (active false)', () => {
    const wrapper = mount(ConflictResolutionDialog, {
      props: { active: false, fields: [makeField()] },
    })
    const host = stubModal(wrapper)

    wrapper.find('nldd-modal-dialog').element.dispatchEvent(new CustomEvent('close'))
    expect(host.show).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('mounts and toggles without crashing while the element is not upgraded', async () => {
    const wrapper = mount(ConflictResolutionDialog, {
      props: { active: false, fields: [makeField()] },
    })
    await wrapper.setProps({ active: true })
    await wrapper.setProps({ active: false })
    wrapper.find('nldd-modal-dialog').element.dispatchEvent(new CustomEvent('close'))
    wrapper.unmount()
    expect(true).toBe(true)
  })

  it('clears stale selections from a previous open when reopened with new fields', async () => {
    const wrapper = mount(ConflictResolutionDialog, {
      props: { active: false, fields: [makeField({ fieldId: 'old' })] },
    })
    stubModal(wrapper)

    await wrapper.setProps({ active: true })
    await wrapper.setProps({ active: false })

    await wrapper.setProps({
      fields: [makeField({ fieldId: 'new', label: 'Nieuw veld' })],
    })
    await wrapper.setProps({ active: true })

    const found = sections(wrapper)
    expect(found).toHaveLength(1)
    expect(found[0].attributes('text')).toBe('Nieuw veld')

    await resolveButton(wrapper).trigger('click')
    const resolved = wrapper.emitted('resolve')![0][0] as Map<string, string>
    expect([...resolved.keys()]).toEqual(['new'])

    wrapper.unmount()
  })

  it('selecting "theirs" via the radio updates the selection and class binding', async () => {
    const wrapper = mount(ConflictResolutionDialog, {
      props: { active: false, fields: [makeField({ fieldId: 'a' })] },
    })
    stubModal(wrapper)
    await wrapper.setProps({ active: true })

    await options(wrapper)[1].find('input[type="radio"]').trigger('change')

    expect(options(wrapper)[1].classes()).toContain('conflict-option--selected')
    expect(options(wrapper)[0].classes()).not.toContain('conflict-option--selected')

    wrapper.unmount()
  })

  it('selecting "mine" via the radio updates the selection back to mine', async () => {
    const wrapper = mount(ConflictResolutionDialog, {
      props: { active: false, fields: [makeField({ fieldId: 'a' })] },
    })
    stubModal(wrapper)
    await wrapper.setProps({ active: true })

    await options(wrapper)[1].find('input[type="radio"]').trigger('change')
    await options(wrapper)[0].find('input[type="radio"]').trigger('change')

    expect(options(wrapper)[0].classes()).toContain('conflict-option--selected')
    expect(options(wrapper)[1].classes()).not.toContain('conflict-option--selected')

    wrapper.unmount()
  })

  it('handleResolve emits the current selections map', async () => {
    const fields = [makeField({ fieldId: 'a' }), makeField({ fieldId: 'b' })]
    const wrapper = mount(ConflictResolutionDialog, {
      props: { active: false, fields },
    })
    stubModal(wrapper)
    await wrapper.setProps({ active: true })

    await options(wrapper, 1)[1].find('input[type="radio"]').trigger('change')

    await resolveButton(wrapper).trigger('click')

    const emitted = wrapper.emitted('resolve')
    expect(emitted).toHaveLength(1)
    const map = emitted![0][0] as Map<string, 'mine' | 'theirs'>
    expect(map).toBeInstanceOf(Map)
    expect(map.get('a')).toBe('mine')
    expect(map.get('b')).toBe('theirs')

    wrapper.unmount()
  })

  it('emits an empty map when there are no fields', async () => {
    const wrapper = mount(ConflictResolutionDialog, {
      props: { active: false, fields: [] },
    })
    stubModal(wrapper)
    await wrapper.setProps({ active: true })
    await nextTick()

    await resolveButton(wrapper).trigger('click')

    const map = wrapper.emitted('resolve')![0][0] as Map<string, string>
    expect(map.size).toBe(0)

    wrapper.unmount()
  })
})

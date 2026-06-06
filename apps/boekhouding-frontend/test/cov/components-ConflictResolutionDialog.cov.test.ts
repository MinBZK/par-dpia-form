/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ConflictResolutionDialog, {
  type ConflictField,
} from '../../src/components/ConflictResolutionDialog.vue'

// jsdom (v29) does not implement HTMLDialogElement.showModal()/close().
// The component calls dialogRef.value?.showModal() / ?.close() on a *real*
// element (the optional chain never short-circuits, since the ref is bound),
// so the methods must exist or the watcher would throw. Polyfill them with
// spies so the open/close branches execute and can be asserted.
const showModal = vi.fn()
const close = vi.fn()

beforeAll(() => {
  // @ts-expect-error -- augment jsdom prototype for the test environment
  HTMLDialogElement.prototype.showModal = showModal
  // @ts-expect-error -- augment jsdom prototype for the test environment
  HTMLDialogElement.prototype.close = close
})

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

describe('ConflictResolutionDialog', () => {
  it('renders the heading, intro text and table headers', () => {
    const wrapper = mount(ConflictResolutionDialog, {
      props: { active: false, fields: [] },
    })

    expect(wrapper.find('h2.utrecht-heading-2').text()).toBe('Bewerkingsconflict')
    expect(wrapper.find('p').text()).toContain(
      'Een andere gebruiker heeft dezelfde velden gewijzigd.',
    )
    const headers = wrapper.findAll('thead th').map((th) => th.text())
    expect(headers).toEqual(['Vraag', 'Mijn waarde', 'Andere waarde'])
  })

  it('renders one row per field with label and v-html formatted values', () => {
    const fields = [
      makeField({ fieldId: 'a', label: 'Veld A' }),
      makeField({ fieldId: 'b', label: 'Veld B' }),
    ]
    const wrapper = mount(ConflictResolutionDialog, {
      props: { active: false, fields },
    })

    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[0].find('.conflict-field').text()).toBe('Veld A')
    // v-html renders the raw formatted markup.
    expect(rows[0].html()).toContain('<strong>mijn</strong>')
    expect(rows[0].html()).toContain('<em>hun</em>')
  })

  it('opens the dialog and defaults every field to "mine" when active becomes true', async () => {
    showModal.mockClear()
    close.mockClear()
    const fields = [makeField({ fieldId: 'a' }), makeField({ fieldId: 'b' })]
    const wrapper = mount(ConflictResolutionDialog, {
      props: { active: false, fields },
    })

    await wrapper.setProps({ active: true })

    // Open branch: showModal called, close not.
    expect(showModal).toHaveBeenCalledTimes(1)
    expect(close).not.toHaveBeenCalled()

    // Both "mine" cells are selected by default.
    const mineCells = wrapper.findAll('tbody tr td:nth-child(2)')
    expect(mineCells[0].classes()).toContain('conflict-value--selected')
    expect(mineCells[1].classes()).toContain('conflict-value--selected')

    // "theirs" cells are not selected.
    const theirCells = wrapper.findAll('tbody tr td:nth-child(3)')
    expect(theirCells[0].classes()).not.toContain('conflict-value--selected')

    // The "mine" radios are checked, "theirs" radios are not.
    const mineRadio = mineCells[0].find('input[type="radio"]')
      .element as HTMLInputElement
    const theirRadio = theirCells[0].find('input[type="radio"]')
      .element as HTMLInputElement
    expect(mineRadio.checked).toBe(true)
    expect(theirRadio.checked).toBe(false)
  })

  it('closes the dialog when active becomes false', async () => {
    const wrapper = mount(ConflictResolutionDialog, {
      props: { active: true, fields: [makeField()] },
    })
    // Mounting with active:true does not trigger the watcher (only changes do),
    // so toggle on then off to exercise both branches.
    await wrapper.setProps({ active: false })
    close.mockClear()
    await wrapper.setProps({ active: true })
    await wrapper.setProps({ active: false })

    // Close branch.
    expect(close).toHaveBeenCalled()
  })

  it('clears stale selections from a previous open when reopened with new fields', async () => {
    const wrapper = mount(ConflictResolutionDialog, {
      props: { active: false, fields: [makeField({ fieldId: 'old' })] },
    })

    // First open registers selection for "old".
    await wrapper.setProps({ active: true })
    await wrapper.setProps({ active: false })

    // Reopen with a different field set — the watcher must delete the old key
    // (covers the `for (const key of Object.keys(selections)) delete` loop with
    // an existing key present).
    await wrapper.setProps({
      fields: [makeField({ fieldId: 'new', label: 'Nieuw veld' })],
    })
    await wrapper.setProps({ active: true })

    const wrapper2Rows = wrapper.findAll('tbody tr')
    expect(wrapper2Rows).toHaveLength(1)
    expect(wrapper2Rows[0].find('.conflict-field').text()).toBe('Nieuw veld')

    // Resolving now only contains the new field, not the stale "old" key.
    await wrapper.find('button.utrecht-button').trigger('click')
    const resolved = wrapper.emitted('resolve')![0][0] as Map<string, string>
    expect([...resolved.keys()]).toEqual(['new'])
  })

  it('selecting "theirs" via the radio updates the selection and class binding', async () => {
    const wrapper = mount(ConflictResolutionDialog, {
      props: { active: false, fields: [makeField({ fieldId: 'a' })] },
    })
    await wrapper.setProps({ active: true })

    const theirCell = wrapper.find('tbody tr td:nth-child(3)')
    await theirCell.find('input[type="radio"]').trigger('change')

    // @change handler set the selection to 'theirs'.
    expect(theirCell.classes()).toContain('conflict-value--selected')
    expect(
      wrapper.find('tbody tr td:nth-child(2)').classes(),
    ).not.toContain('conflict-value--selected')
  })

  it('selecting "mine" via the radio updates the selection back to mine', async () => {
    const wrapper = mount(ConflictResolutionDialog, {
      props: { active: false, fields: [makeField({ fieldId: 'a' })] },
    })
    await wrapper.setProps({ active: true })

    // First flip to theirs, then back to mine to exercise the "mine" @change.
    await wrapper
      .find('tbody tr td:nth-child(3) input[type="radio"]')
      .trigger('change')
    await wrapper
      .find('tbody tr td:nth-child(2) input[type="radio"]')
      .trigger('change')

    expect(
      wrapper.find('tbody tr td:nth-child(2)').classes(),
    ).toContain('conflict-value--selected')
    expect(
      wrapper.find('tbody tr td:nth-child(3)').classes(),
    ).not.toContain('conflict-value--selected')
  })

  it('handleResolve closes the dialog and emits the current selections map', async () => {
    const fields = [makeField({ fieldId: 'a' }), makeField({ fieldId: 'b' })]
    const wrapper = mount(ConflictResolutionDialog, {
      props: { active: false, fields },
    })
    await wrapper.setProps({ active: true })

    // Change one field to "theirs" so the emitted map has a mix.
    await wrapper
      .find('tbody tr:nth-child(2) td:nth-child(3) input[type="radio"]')
      .trigger('change')

    close.mockClear()
    await wrapper.find('button.utrecht-button').trigger('click')

    // Close was called by handleResolve.
    expect(close).toHaveBeenCalledTimes(1)

    const emitted = wrapper.emitted('resolve')
    expect(emitted).toHaveLength(1)
    const map = emitted![0][0] as Map<string, 'mine' | 'theirs'>
    expect(map).toBeInstanceOf(Map)
    expect(map.get('a')).toBe('mine')
    expect(map.get('b')).toBe('theirs')
  })

  it('emits an empty map when there are no fields', async () => {
    const wrapper = mount(ConflictResolutionDialog, {
      props: { active: false, fields: [] },
    })
    await wrapper.setProps({ active: true })
    await nextTick()

    await wrapper.find('button.utrecht-button').trigger('click')

    const map = wrapper.emitted('resolve')![0][0] as Map<string, string>
    expect(map.size).toBe(0)
  })

  it('prevents the default on the dialog cancel event (Escape key)', async () => {
    const wrapper = mount(ConflictResolutionDialog, {
      props: { active: false, fields: [makeField()] },
      attachTo: document.body,
    })

    const dialogEl = wrapper.find('dialog').element
    const event = new Event('cancel', { cancelable: true })
    dialogEl.dispatchEvent(event)

    // The @cancel.prevent handler calls preventDefault, so the dialog does not
    // auto-close on Escape; the parent stays in control of the `active` prop.
    expect(event.defaultPrevented).toBe(true)

    wrapper.unmount()
  })
})

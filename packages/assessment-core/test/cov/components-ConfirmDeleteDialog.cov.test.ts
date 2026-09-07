import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ConfirmDeleteDialog from '../../src/components/ConfirmDeleteDialog.vue'
import type { ImpactSummary } from '../../src/utils/impactedAnswers'

function emptySummary(): ImpactSummary {
  return { total: 0, bySection: [] }
}

function filledSummary(): ImpactSummary {
  return {
    total: 3,
    bySection: [
      { sectionId: '2', sectionLabel: 'Gegevens', count: 2, fieldNames: ['Naam', 'E-mail'] },
      { sectionId: '4', sectionLabel: 'Risico', count: 1, fieldNames: [] },
    ],
  }
}

function mountDialog(props: Partial<{ open: boolean; label: string; summary: ImpactSummary }> = {}) {
  return mount(ConfirmDeleteDialog, {
    props: {
      open: false,
      label: 'Verwerking 2',
      summary: emptySummary(),
      ...props,
    },
  })
}

// The nldd-modal-dialog custom element is not registered in jsdom; its
// imperative API is stubbed per test on the host element.
function stubModal(wrapper: ReturnType<typeof mountDialog>) {
  const host = wrapper.find('nldd-modal-dialog').element as HTMLElement & {
    show?: () => void
    hide?: () => void
  }
  host.show = vi.fn()
  host.hide = vi.fn()
  return host
}

describe('ConfirmDeleteDialog open-state synchronisation', () => {
  it('calls show() when open flips to true and hide() when it flips back', async () => {
    const wrapper = mountDialog({ open: false })
    const host = stubModal(wrapper)

    await wrapper.setProps({ open: true })
    expect(host.show).toHaveBeenCalledTimes(1)
    expect(host.hide).not.toHaveBeenCalled()

    await wrapper.setProps({ open: false })
    expect(host.hide).toHaveBeenCalledTimes(1)
  })

  it('mounts and toggles without crashing while the element is not upgraded (no show/hide)', async () => {
    const opened = mountDialog({ open: true })
    expect(opened.find('nldd-modal-dialog').exists()).toBe(true)

    // Toggling without stubs exercises the optional-call branches.
    await opened.setProps({ open: false })
    opened.unmount()
  })

  it('calls hide() on unmount', () => {
    const wrapper = mountDialog({ open: true })
    const host = stubModal(wrapper)

    wrapper.unmount()
    expect(host.hide).toHaveBeenCalledTimes(1)
  })

  it('returns early in sync() when the dialog ref is null (defensive guard)', async () => {
    const wrapper = mountDialog({ open: false })
    ;(wrapper.vm as unknown as { dialog: HTMLElement | null }).dialog = null
    await wrapper.setProps({ open: true })
    expect(wrapper.exists()).toBe(true)
  })
})

describe('ConfirmDeleteDialog close event', () => {
  it('emits cancel when the modal closes while open (Esc / backdrop)', () => {
    const wrapper = mountDialog({ open: true })

    wrapper.find('nldd-modal-dialog').element.dispatchEvent(new CustomEvent('close'))
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  it('does not emit cancel for a close event when already closed (own hide())', () => {
    const wrapper = mountDialog({ open: false })

    wrapper.find('nldd-modal-dialog').element.dispatchEvent(new CustomEvent('close'))
    expect(wrapper.emitted('cancel')).toBeUndefined()
  })
})

describe('ConfirmDeleteDialog content', () => {
  it('renders the question with the instance label as the modal title', () => {
    const wrapper = mountDialog({ label: 'Verwerking 2' })
    const host = wrapper.find('nldd-modal-dialog')
    expect(host.attributes('text')).toBe('Weet je zeker dat je "Verwerking 2" wilt verwijderen?')
    expect(host.attributes('variant')).toBe('alert')
  })

  it('lists impacted sections with plural forms and field names', () => {
    const wrapper = mountDialog({ summary: filledSummary() })

    expect(wrapper.text()).toContain('Dit wist ook 3 ingevulde antwoorden in:')
    const items = wrapper.findAll('li')
    expect(items).toHaveLength(2)
    expect(items[0].text()).toContain('Sectie 2. Gegevens - 2 antwoorden')
    expect(items[0].text()).toContain('(Naam, E-mail)')
    expect(items[1].text()).toContain('Sectie 4. Risico - 1 antwoord')
    expect(items[1].text()).not.toContain('(')
  })

  it('uses singular forms for a single impacted answer', () => {
    const wrapper = mountDialog({
      summary: {
        total: 1,
        bySection: [{ sectionId: '2', sectionLabel: 'Gegevens', count: 1, fieldNames: [] }],
      },
    })
    expect(wrapper.text()).toContain('Dit wist ook 1 ingevuld antwoord in:')
  })

  it('shows the no-dependent-answers message when the summary is empty', () => {
    const wrapper = mountDialog({ summary: emptySummary() })
    const host = wrapper.find('nldd-modal-dialog')
    expect(host.attributes('supporting-text')).toBe('Er zijn geen afhankelijke antwoorden ingevuld.')
    expect(wrapper.findAll('li')).toHaveLength(0)
  })
})

describe('ConfirmDeleteDialog action buttons', () => {
  it('emits cancel when the "Annuleren" button is clicked', async () => {
    const wrapper = mountDialog({ open: true })
    const cancelBtn = wrapper
      .findAll('nldd-button')
      .find((b) => b.attributes('text') === 'Annuleren')!
    await cancelBtn.trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })

  it('emits confirm when the "Ja, ga door met verwijderen" button is clicked', async () => {
    const wrapper = mountDialog({ open: true })
    const confirmBtn = wrapper
      .findAll('nldd-button')
      .find((b) => b.attributes('text') === 'Ja, ga door met verwijderen')!
    await confirmBtn.trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)
    expect(wrapper.emitted('cancel')).toBeUndefined()
  })

  it('renders the safe action as primary and the destructive action as destructive with a trash icon', () => {
    const wrapper = mountDialog()
    const buttons = wrapper.findAll('nldd-button')
    const cancel = buttons.find((b) => b.attributes('text') === 'Annuleren')!
    const confirm = buttons.find((b) => b.attributes('text') === 'Ja, ga door met verwijderen')!

    expect(cancel.attributes('variant')).toBe('primary')
    expect(cancel.attributes('slot')).toBe('actions')
    expect(confirm.attributes('variant')).toBe('destructive')
    expect(confirm.attributes('start-icon')).toBe('trash')
    expect(confirm.attributes('slot')).toBe('actions')
  })
})

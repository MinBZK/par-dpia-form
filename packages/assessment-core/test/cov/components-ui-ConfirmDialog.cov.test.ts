import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ConfirmDialog from '../../src/components/ui/ConfirmDialog.vue'

// jsdom has no showModal()/close(); polyfill them so the dialog branches run.
beforeAll(() => {
  const proto = (globalThis as unknown as { HTMLDialogElement: typeof HTMLDialogElement })
    .HTMLDialogElement.prototype as HTMLDialogElement & {
      showModal: () => void
      close: () => void
    }
  proto.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  proto.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
})

const mounted: ReturnType<typeof mount>[] = []
function track<T extends ReturnType<typeof mount>>(w: T): T {
  mounted.push(w)
  return w
}
afterEach(() => {
  while (mounted.length) mounted.pop()!.unmount()
})

function mountDialog(open: boolean, slot = '<p>Weet je het zeker?</p>') {
  return track(mount(ConfirmDialog, {
    props: { open, title: 'Titel', confirmLabel: 'Ja, doorgaan' },
    slots: { default: slot },
    global: {
      stubs: {
        UiButton: {
          name: 'UiButton',
          props: ['variant', 'label'],
          emits: ['click'],
          template: '<button :data-label="label" @click="$emit(\'click\')">{{ label }}</button>',
        },
      },
    },
  }))
}

describe('ConfirmDialog', () => {
  it('opens on mount when open is already true', () => {
    const wrapper = mountDialog(true)
    expect(wrapper.find('dialog').attributes('open')).toBeDefined()
  })

  it('stays closed when open is false, and opens when it flips', async () => {
    const wrapper = mountDialog(false)
    expect(wrapper.find('dialog').attributes('open')).toBeUndefined()

    await wrapper.setProps({ open: true })
    expect(wrapper.find('dialog').attributes('open')).toBeDefined()

    await wrapper.setProps({ open: false })
    expect(wrapper.find('dialog').attributes('open')).toBeUndefined()
  })

  it('renders the title and the slot content', () => {
    const wrapper = mountDialog(true)
    expect(wrapper.text()).toContain('Titel')
    expect(wrapper.text()).toContain('Weet je het zeker?')
  })

  it('emits confirm and cancel from the two buttons', async () => {
    const wrapper = mountDialog(true)
    await wrapper.find('[data-label="Ja, doorgaan"]').trigger('click')
    await wrapper.find('[data-label="Annuleren"]').trigger('click')

    expect(wrapper.emitted('confirm')).toHaveLength(1)
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  // Escape closes a native dialog without going through either button, so the
  // parent has to hear about it or `open` stays true and the dialog never
  // reopens.
  it('emits cancel when the dialog closes on its own', async () => {
    const wrapper = mountDialog(true)
    wrapper.find('dialog').element.dispatchEvent(new Event('close'))
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  it('does not emit cancel when it closes while already marked closed', async () => {
    const wrapper = mountDialog(false)
    wrapper.find('dialog').element.dispatchEvent(new Event('close'))
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('cancel')).toBeUndefined()
  })

  it('returns early in sync() when the dialog ref is null (defensive guard)', async () => {
    const wrapper = mountDialog(false)
    ;(wrapper.vm as unknown as { dialog: HTMLDialogElement | null }).dialog = null
    await wrapper.setProps({ open: true })
    expect(wrapper.exists()).toBe(true)
  })

  it('closes a still-open dialog on unmount', () => {
    const wrapper = mountDialog(true)
    const el = wrapper.find('dialog').element as HTMLDialogElement
    wrapper.unmount()
    expect(el.hasAttribute('open')).toBe(false)
  })
})

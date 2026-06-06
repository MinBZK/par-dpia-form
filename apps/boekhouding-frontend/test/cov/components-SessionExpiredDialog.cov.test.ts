/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'

// A real ref so the component's watcher reacts when we toggle it.
const sessionExpired = ref(false)
const relogin = vi.fn().mockResolvedValue(undefined)

vi.mock('../../src/composables/useAuth', () => ({
  useAuth: () => ({
    sessionExpired,
    relogin,
  }),
}))

let SessionExpiredDialog: typeof import('../../src/components/SessionExpiredDialog.vue').default

beforeEach(async () => {
  vi.clearAllMocks()
  sessionExpired.value = false
  // jsdom's HTMLDialogElement does not implement showModal/close — stub them.
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function () {
      this.open = true
    }
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function () {
      this.open = false
    }
  }
  const mod = await import('../../src/components/SessionExpiredDialog.vue')
  SessionExpiredDialog = mod.default
})

describe('SessionExpiredDialog', () => {
  it('renders the Dutch logout heading and message inside a dialog', () => {
    const wrapper = mount(SessionExpiredDialog)

    expect(wrapper.find('#session-expired-title').text()).toBe('Je bent uitgelogd')
    expect(wrapper.text()).toContain(
      'Je bent automatisch uitgelogd omdat je langere tijd niet actief was.',
    )
    expect(wrapper.find('button').text()).toBe('Opnieuw inloggen')

    wrapper.unmount()
  })

  it('does not open the dialog while the session is still valid', async () => {
    const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal')
    const wrapper = mount(SessionExpiredDialog)

    // Toggling to false (already false) keeps the watcher's else path.
    // Set a truthy then back to falsy to exercise the `if (expired)` false branch.
    sessionExpired.value = false
    await wrapper.vm.$nextTick()

    expect(showModal).not.toHaveBeenCalled()

    wrapper.unmount()
    showModal.mockRestore()
  })

  it('opens the dialog when the session expires (truthy branch)', async () => {
    const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal')
    const wrapper = mount(SessionExpiredDialog)

    sessionExpired.value = true
    await wrapper.vm.$nextTick()

    expect(showModal).toHaveBeenCalledTimes(1)

    wrapper.unmount()
    showModal.mockRestore()
  })

  it('takes the falsy branch of the watcher when the session is reset to false', async () => {
    const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal')
    const wrapper = mount(SessionExpiredDialog)

    // First expire (truthy branch) ...
    sessionExpired.value = true
    await wrapper.vm.$nextTick()
    expect(showModal).toHaveBeenCalledTimes(1)

    // ... then reset to false (falsy branch — showModal not called again).
    sessionExpired.value = false
    await wrapper.vm.$nextTick()
    expect(showModal).toHaveBeenCalledTimes(1)

    wrapper.unmount()
    showModal.mockRestore()
  })

  it('calls relogin() when the "Opnieuw inloggen" button is clicked', async () => {
    const wrapper = mount(SessionExpiredDialog)

    await wrapper.find('button').trigger('click')

    expect(relogin).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })

  it('prevents the default cancel behaviour (Escape key) on the dialog', async () => {
    const wrapper = mount(SessionExpiredDialog)

    // @cancel.prevent compiles to a handler that calls event.preventDefault(),
    // keeping the dialog open when the user presses Escape.
    const event = new Event('cancel', { cancelable: true })
    await wrapper.find('dialog').element.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)

    wrapper.unmount()
  })
})

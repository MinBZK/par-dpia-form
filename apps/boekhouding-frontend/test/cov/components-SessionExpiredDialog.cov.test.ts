/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'

// Real ref (not a plain mock) so the component's watcher reacts when toggled.
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
  const mod = await import('../../src/components/SessionExpiredDialog.vue')
  SessionExpiredDialog = mod.default
})

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

describe('SessionExpiredDialog', () => {
  it('renders the Dutch logout heading and message in an alert modal', () => {
    const wrapper = mount(SessionExpiredDialog)

    const modal = wrapper.find('nldd-modal-dialog')
    expect(modal.attributes('text')).toBe('Je bent uitgelogd')
    expect(modal.attributes('variant')).toBe('alert')
    expect(modal.attributes('supporting-text')).toContain(
      'Je bent automatisch uitgelogd omdat je langere tijd niet actief was.',
    )
    expect(wrapper.find('nldd-button').attributes('text')).toBe('Opnieuw inloggen')

    wrapper.unmount()
  })

  it('does not open the modal while the session is still valid', async () => {
    const wrapper = mount(SessionExpiredDialog)
    const host = stubModal(wrapper)

    sessionExpired.value = false
    await wrapper.vm.$nextTick()

    expect(host.show).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('opens the modal when the session expires (truthy branch)', async () => {
    const wrapper = mount(SessionExpiredDialog)
    const host = stubModal(wrapper)

    sessionExpired.value = true
    await wrapper.vm.$nextTick()

    expect(host.show).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })

  it('does not re-open on the watcher when the session is reset to false', async () => {
    const wrapper = mount(SessionExpiredDialog)
    const host = stubModal(wrapper)

    sessionExpired.value = true
    await wrapper.vm.$nextTick()
    expect(host.show).toHaveBeenCalledTimes(1)

    sessionExpired.value = false
    await wrapper.vm.$nextTick()
    expect(host.show).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })

  it('reopens the modal when dismissed while the session is still expired (non-dismissable)', async () => {
    const wrapper = mount(SessionExpiredDialog)
    const host = stubModal(wrapper)

    sessionExpired.value = true
    await wrapper.vm.$nextTick()
    expect(host.show).toHaveBeenCalledTimes(1)

    wrapper.find('nldd-modal-dialog').element.dispatchEvent(new CustomEvent('close'))
    expect(host.show).toHaveBeenCalledTimes(2)

    wrapper.unmount()
  })

  it('does not reopen on close once the session is valid again', () => {
    const wrapper = mount(SessionExpiredDialog)
    const host = stubModal(wrapper)

    wrapper.find('nldd-modal-dialog').element.dispatchEvent(new CustomEvent('close'))
    expect(host.show).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('mounts and toggles without crashing while the element is not upgraded', async () => {
    const wrapper = mount(SessionExpiredDialog)
    sessionExpired.value = true
    await wrapper.vm.$nextTick()
    wrapper.find('nldd-modal-dialog').element.dispatchEvent(new CustomEvent('close'))
    wrapper.unmount()
    expect(true).toBe(true)
  })

  it('calls relogin() when the "Opnieuw inloggen" button is clicked', async () => {
    const wrapper = mount(SessionExpiredDialog)

    await wrapper.find('nldd-button').trigger('click')

    expect(relogin).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })
})

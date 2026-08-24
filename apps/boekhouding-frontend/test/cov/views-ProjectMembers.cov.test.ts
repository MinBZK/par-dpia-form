/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import type { Member } from '../../src/api'

// ProjectMembers calls useRouter() at setup time even though it never navigates, so a push spy is required for mount() to succeed.
const routerPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush }),
}))

const backLinkSet = vi.fn()
vi.mock('../../src/composables/useBackLink', () => ({
  useBackLink: () => ({ set: backLinkSet }),
}))

const membersList = vi.fn()
const membersAdd = vi.fn()
const membersUpdate = vi.fn()
const membersRemove = vi.fn()
vi.mock('../../src/api', () => ({
  members: {
    list: async (...args: unknown[]) => {
      const r = await membersList(...args)
      return Array.isArray(r) ? { items: r, total: r.length } : r
    },
    add: (...args: unknown[]) => membersAdd(...args),
    update: (...args: unknown[]) => membersUpdate(...args),
    remove: (...args: unknown[]) => membersRemove(...args),
  },
}))

import ProjectMembers from '../../src/views/ProjectMembers.vue'

const makeMember = (overrides: Partial<Member> = {}): Member => ({
  userId: 'u1',
  email: 'sam@example.com',
  displayName: 'Sam van der Berg',
  role: 'editor',
  invitedAt: '2026-01-01T00:00:00Z',
  acceptedAt: null,
  ...overrides,
})

const owner = makeMember({ userId: 'owner1', email: 'owner@example.com', displayName: 'Owner One', role: 'owner' })
const owner2 = makeMember({ userId: 'owner2', email: 'owner2@example.com', displayName: 'Owner Two', role: 'owner' })
const editor = makeMember({ userId: 'ed1', email: 'ed@example.com', displayName: 'Editor One', role: 'editor' })

const mountPage = async (projectId = 'p1') => {
  const wrapper = mount(ProjectMembers, {
    props: { projectId },
  })
  await flushPromises()
  return wrapper
}

type MountedPage = Awaited<ReturnType<typeof mountPage>>

// The nldd-modal-dialog custom element is not registered in jsdom; its
// imperative show()/hide() API is stubbed per test on the host element.
function stubModal(wrapper: MountedPage) {
  const host = wrapper.find('nldd-modal-dialog').element as HTMLElement & {
    show?: () => void
    hide?: () => void
  }
  host.show = vi.fn()
  host.hide = vi.fn()
  return host
}

// The who column is an nldd-text-cell: name on top, email underneath. Its
// content lives in attributes, so it never shows up in wrapper.text().
const whoCells = (wrapper: MountedPage) =>
  wrapper.findAll('.member-col--who').map((c) => [c.attributes('text'), c.attributes('supporting-text')])

// Every row carries a delete button; it is disabled, not hidden, when the
// member is the last owner.
const deleteAction = (wrapper: MountedPage, row = 0) =>
  wrapper.findAll('nldd-button.member-delete')[row]

const modalButton = (wrapper: MountedPage, text: string) =>
  wrapper.find(`nldd-modal-dialog nldd-button[text="${text}"]`)

beforeEach(() => {
  routerPush.mockReset()
  backLinkSet.mockReset()
  membersList.mockReset()
  membersAdd.mockReset()
  membersUpdate.mockReset()
  membersRemove.mockReset()
  membersList.mockResolvedValue([owner, editor])
  membersAdd.mockResolvedValue({ userId: 'new', role: 'editor' })
  membersUpdate.mockResolvedValue(editor)
  membersRemove.mockResolvedValue(undefined)
})

describe('ProjectMembers', () => {
  describe('onMounted loading', () => {
    it('shows the loading state before the list resolves, then renders rows', async () => {
      let resolveList: (v: Member[]) => void = () => {}
      membersList.mockReturnValue(new Promise<Member[]>((r) => { resolveList = r }))

      const wrapper = mount(ProjectMembers, {
        props: { projectId: 'p1' },
      })
      expect(wrapper.text()).toContain('Laden...')
      expect(wrapper.find('.member-list').exists()).toBe(false)

      resolveList([owner, editor])
      await flushPromises()

      expect(wrapper.text()).not.toContain('Laden...')
      expect(wrapper.find('.member-list').exists()).toBe(true)
      expect(membersList).toHaveBeenCalledWith('p1', 1, 100)
    })

    it('loads members and renders one row per member', async () => {
      const wrapper = await mountPage()
      expect(wrapper.findAll('.member-row')).toHaveLength(2)
      expect(whoCells(wrapper)).toContainEqual(['Owner One', 'owner@example.com'])
    })

    it('declares the back link to the project in the top bar', async () => {
      await mountPage('p42')
      expect(backLinkSet).toHaveBeenCalledWith({ text: 'Project', to: '/project/p42' })
    })

    it('shows a critical banner when list() rejects (catch branch)', async () => {
      membersList.mockRejectedValueOnce(new Error('boom'))
      const wrapper = await mountPage()
      const banner = wrapper.find('nldd-banner')
      expect(banner.exists()).toBe(true)
      expect(banner.attributes('variant')).toBe('critical')
      expect(banner.attributes('text')).toBe('Kan leden niet laden. Probeer het later opnieuw.')
      expect(wrapper.findAll('.member-row')).toHaveLength(0)
    })
  })

  describe('whoLabel()', () => {
    it('returns just the email when displayName equals email (placeholder branch)', async () => {
      const placeholder = makeMember({
        userId: 'ph1',
        email: 'pending@example.com',
        displayName: 'pending@example.com',
        role: 'editor',
      })
      membersList.mockResolvedValue([owner, placeholder])
      const wrapper = await mountPage()
      // No display name yet, so the email carries the row and there is no
      // supporting line repeating it.
      expect(whoCells(wrapper)).toContainEqual(['pending@example.com', undefined])
      const roleSelect = wrapper.findAll('select.member-select')[1]
      expect(roleSelect.attributes('aria-label')).toBe('Rol van pending@example.com')
    })

    it('returns "name (email)" when displayName differs from email', async () => {
      const wrapper = await mountPage()
      expect(whoCells(wrapper)).toContainEqual(['Editor One', 'ed@example.com'])
      const roleSelect = wrapper.findAll('select.member-select')[1]
      expect(roleSelect.attributes('aria-label')).toBe('Rol van Editor One (ed@example.com)')
    })
  })

  describe('isOnlyOwner() / ownerCount', () => {
    it('disables the role select and hides delete for the sole owner', async () => {
      membersList.mockResolvedValue([owner, editor])
      const wrapper = await mountPage()

      const selects = wrapper.findAll('select.member-select')
      expect((selects[0].element as HTMLSelectElement).disabled).toBe(true)
      expect((selects[1].element as HTMLSelectElement).disabled).toBe(false)

      const dropdowns = wrapper.findAll('.member-col--role nldd-dropdown')
      expect(dropdowns[0].attributes('disabled')).toBeDefined()
      expect(dropdowns[1].attributes('disabled')).toBeUndefined()

      const deleteButtons = wrapper.findAll('nldd-button.member-delete')
      expect(deleteButtons).toHaveLength(2)
      expect(deleteButtons[0].attributes('variant')).toBe('destructive')
      expect(deleteButtons[0].attributes('text')).toBe('Verwijderen')
      // The sole owner keeps the button but cannot use it.
      expect(deleteButtons[0].attributes('disabled')).toBeDefined()
      expect(deleteButtons[0].attributes('accessible-label')).toContain('enige eigenaar')
      expect(deleteButtons[1].attributes('disabled')).toBeUndefined()
    })

    it('enables owner controls when there is more than one owner', async () => {
      membersList.mockResolvedValue([owner, owner2])
      const wrapper = await mountPage()

      const selects = wrapper.findAll('select.member-select')
      expect((selects[0].element as HTMLSelectElement).disabled).toBe(false)
      expect((selects[1].element as HTMLSelectElement).disabled).toBe(false)

      const buttons = wrapper.findAll('nldd-button.member-delete')
      expect(buttons).toHaveLength(2)
      expect(buttons.every((b) => b.attributes('disabled') === undefined)).toBe(true)
    })

    it('treats a non-owner with a single owner present as not the only owner', async () => {
      membersList.mockResolvedValue([owner, editor])
      const wrapper = await mountPage()
      const selects = wrapper.findAll('select.member-select')
      expect((selects[1].element as HTMLSelectElement).disabled).toBe(false)
    })
  })

  describe('handleInvite()', () => {
    it('returns early without calling add() when the email is empty', async () => {
      const wrapper = await mountPage()
      await wrapper.find('form').trigger('submit.prevent')
      await flushPromises()
      expect(membersAdd).not.toHaveBeenCalled()
      const field = wrapper.find('[input-id="inviteEmail"]')
      expect(field.attributes('invalid')).toBe('true')
      expect(wrapper.find('nldd-form-field-error-text').text()).toBe('Vul een e-mailadres in.')
    })

    it('rejects an address that is not shaped like an email', async () => {
      const wrapper = await mountPage()
      wrapper.find('[input-id="inviteEmail"]').element
        .dispatchEvent(new CustomEvent('input', { detail: { value: 'geen-adres' } }))
      await wrapper.find('form').trigger('submit.prevent')
      await flushPromises()
      expect(membersAdd).not.toHaveBeenCalled()
      expect(wrapper.find('nldd-form-field-error-text').text())
        .toBe('Vul een geldig e-mailadres in, bijvoorbeeld naam@organisatie.nl.')
    })

    it('clears the error as soon as the field is edited again', async () => {
      const wrapper = await mountPage()
      await wrapper.find('form').trigger('submit.prevent')
      await flushPromises()
      expect(wrapper.find('nldd-form-field-error-text').text()).not.toBe('')

      wrapper.find('[input-id="inviteEmail"]').element
        .dispatchEvent(new CustomEvent('input', { detail: { value: 'a@b.nl' } }))
      await flushPromises()
      expect(wrapper.find('nldd-form-field-error-text').text()).toBe('')
      expect(wrapper.find('[input-id="inviteEmail"]').attributes('invalid')).toBeUndefined()
    })

    it('trims surrounding whitespace before validating and sending', async () => {
      const wrapper = await mountPage()
      wrapper.find('[input-id="inviteEmail"]').element
        .dispatchEvent(new CustomEvent('input', { detail: { value: '  ruimte@example.com  ' } }))
      await wrapper.find('form').trigger('submit.prevent')
      await flushPromises()
      expect(membersAdd).toHaveBeenCalledWith('p1', 'ruimte@example.com', 'editor')
    })

    it('adds the member, refreshes the list and clears the email on success', async () => {
      const wrapper = await mountPage()
      membersList.mockClear()
      membersList.mockResolvedValue([owner, editor, makeMember({ userId: 'inv', email: 'new@example.com', displayName: 'New', role: 'editor' })])

      const emailField = wrapper.find('[input-id="inviteEmail"]')
      emailField.element.dispatchEvent(new CustomEvent('input', { detail: { value: 'new@example.com' } }))
      await wrapper.find('form').trigger('submit.prevent')
      await flushPromises()

      expect(membersAdd).toHaveBeenCalledWith('p1', 'new@example.com', 'editor')
      expect(membersList).toHaveBeenCalledWith('p1', 1, 100)
      expect(emailField.attributes('value')).toBe('')
    })

    it('falls back to target.value when the input event carries no detail', async () => {
      const wrapper = await mountPage()
      const host = wrapper.find('[input-id="inviteEmail"]').element as HTMLElement & { value?: string }
      host.value = 'fallback@example.com'
      host.dispatchEvent(new CustomEvent('input'))
      await wrapper.find('form').trigger('submit.prevent')
      await flushPromises()
      expect(membersAdd).toHaveBeenCalledWith('p1', 'fallback@example.com', 'editor')
    })

    it('uses the selected role when inviting', async () => {
      const wrapper = await mountPage()
      wrapper.find('[input-id="inviteEmail"]').element.dispatchEvent(
        new CustomEvent('input', { detail: { value: 'viewer@example.com' } }),
      )
      await wrapper.find('#inviteRole').setValue('viewer')
      await wrapper.find('form').trigger('submit.prevent')
      await flushPromises()
      expect(membersAdd).toHaveBeenCalledWith('p1', 'viewer@example.com', 'viewer')
    })

    it('shows the error message from the thrown error (catch branch)', async () => {
      const wrapper = await mountPage()
      membersAdd.mockRejectedValueOnce(new Error('E-mailadres al uitgenodigd'))
      wrapper.find('[input-id="inviteEmail"]').element.dispatchEvent(
        new CustomEvent('input', { detail: { value: 'dup@example.com' } }),
      )
      await wrapper.find('form').trigger('submit.prevent')
      await flushPromises()
      expect(wrapper.find('nldd-banner').attributes('text')).toBe('E-mailadres al uitgenodigd')
    })

    it('clears a previous error on a subsequent successful invite', async () => {
      const wrapper = await mountPage()
      membersAdd.mockRejectedValueOnce(new Error('Eerdere fout'))
      wrapper.find('[input-id="inviteEmail"]').element.dispatchEvent(
        new CustomEvent('input', { detail: { value: 'a@example.com' } }),
      )
      await wrapper.find('form').trigger('submit.prevent')
      await flushPromises()
      expect(wrapper.find('nldd-banner').exists()).toBe(true)

      wrapper.find('[input-id="inviteEmail"]').element.dispatchEvent(
        new CustomEvent('input', { detail: { value: 'b@example.com' } }),
      )
      await wrapper.find('form').trigger('submit.prevent')
      await flushPromises()
      expect(wrapper.find('nldd-banner').exists()).toBe(false)
    })
  })

  describe('handleRoleChange()', () => {
    it('updates the role and refreshes the list on success', async () => {
      const wrapper = await mountPage()
      membersList.mockClear()
      const selects = wrapper.findAll('select.member-select')
      await selects[1].setValue('viewer')
      await flushPromises()
      expect(membersUpdate).toHaveBeenCalledWith('p1', 'ed1', 'viewer')
      expect(membersList).toHaveBeenCalledWith('p1', 1, 100)
    })

    it('shows the error message when update() rejects (catch branch)', async () => {
      const wrapper = await mountPage()
      membersUpdate.mockRejectedValueOnce(new Error('Rol kan niet gewijzigd'))
      const selects = wrapper.findAll('select.member-select')
      await selects[1].setValue('commenter')
      await flushPromises()
      expect(wrapper.find('nldd-banner').attributes('text')).toBe('Rol kan niet gewijzigd')
    })
  })

  describe('delete modal (watch + open/close + confirmRemove)', () => {
    it('opens the dialog via show() when the delete button is clicked', async () => {
      const wrapper = await mountPage()
      const host = stubModal(wrapper)

      await deleteAction(wrapper, 1).trigger('click')
      await flushPromises()

      expect(host.show).toHaveBeenCalledTimes(1)
      expect(host.hide).not.toHaveBeenCalled()
      expect(wrapper.find('nldd-modal-dialog').attributes('text')).toBe('Lid verwijderen')
      expect(wrapper.find('nldd-modal-dialog strong').text()).toBe('Editor One (ed@example.com)')
    })

    it('opens and closes without crashing while the element is not upgraded (no show/hide)', async () => {
      const wrapper = await mountPage()

      await deleteAction(wrapper, 1).trigger('click')
      await flushPromises()
      expect(wrapper.find('nldd-modal-dialog strong').text()).toBe('Editor One (ed@example.com)')

      await modalButton(wrapper, 'Annuleer').trigger('click')
      await flushPromises()
      expect(wrapper.find('nldd-modal-dialog strong').text()).toBe('')
    })

    it('returns early in the open-state watch when the dialog ref is null (defensive guard)', async () => {
      const wrapper = await mountPage()
      ;(wrapper.vm as unknown as { deleteDialogRef: HTMLElement | null }).deleteDialogRef = null

      await deleteAction(wrapper, 1).trigger('click')
      await flushPromises()
      expect(wrapper.find('nldd-modal-dialog strong').text()).toBe('Editor One (ed@example.com)')
    })

    it('closes the dialog via hide() and clears memberToDelete on cancel', async () => {
      const wrapper = await mountPage()
      const host = stubModal(wrapper)

      await deleteAction(wrapper, 1).trigger('click')
      await flushPromises()

      await modalButton(wrapper, 'Annuleer').trigger('click')
      await flushPromises()

      expect(host.hide).toHaveBeenCalledTimes(1)
      expect(wrapper.find('nldd-modal-dialog strong').text()).toBe('')
    })

    it('routes the modal close event (Esc) through the shared open-state', async () => {
      const wrapper = await mountPage()
      stubModal(wrapper)

      await deleteAction(wrapper, 1).trigger('click')
      await flushPromises()

      wrapper.find('nldd-modal-dialog').element.dispatchEvent(new CustomEvent('close'))
      await flushPromises()

      expect(wrapper.find('nldd-modal-dialog strong').text()).toBe('')
    })

    it('ignores a close event when the modal is already closed (own hide())', async () => {
      const wrapper = await mountPage()
      const host = stubModal(wrapper)

      wrapper.find('nldd-modal-dialog').element.dispatchEvent(new CustomEvent('close'))
      await flushPromises()

      expect(host.hide).not.toHaveBeenCalled()
    })

    it('removes the member from the list on confirm (success branch)', async () => {
      const wrapper = await mountPage()
      stubModal(wrapper)
      // After the remove the list is re-fetched; the server now returns only the owner.
      membersList.mockResolvedValueOnce([owner])

      await deleteAction(wrapper, 1).trigger('click')
      await flushPromises()

      await modalButton(wrapper, 'Verwijderen').trigger('click')
      await flushPromises()

      expect(membersRemove).toHaveBeenCalledWith('p1', 'ed1')
      expect(whoCells(wrapper)).not.toContainEqual(['Editor One', 'ed@example.com'])
      expect(whoCells(wrapper)).toContainEqual(['Owner One', 'owner@example.com'])
    })

    it('shows the error message and still closes when remove() rejects (catch + finally)', async () => {
      const wrapper = await mountPage()
      const host = stubModal(wrapper)
      membersRemove.mockRejectedValueOnce(new Error('Verwijderen mislukt'))

      await deleteAction(wrapper, 1).trigger('click')
      await flushPromises()

      await modalButton(wrapper, 'Verwijderen').trigger('click')
      await flushPromises()

      expect(wrapper.find('nldd-banner').attributes('text')).toBe('Verwijderen mislukt')
      expect(host.hide).toHaveBeenCalledTimes(1)
      expect(whoCells(wrapper)).toContainEqual(['Editor One', 'ed@example.com'])
    })

    it('returns early in confirmRemove when there is no member to delete', async () => {
      const wrapper = await mountPage()
      stubModal(wrapper)

      await deleteAction(wrapper, 1).trigger('click')
      await flushPromises()
      await modalButton(wrapper, 'Annuleer').trigger('click')
      await flushPromises()

      await modalButton(wrapper, 'Verwijderen').trigger('click')
      await flushPromises()

      expect(membersRemove).not.toHaveBeenCalled()
    })

    it('calls hide() on unmount', async () => {
      const wrapper = await mountPage()
      const host = stubModal(wrapper)

      wrapper.unmount()
      expect(host.hide).toHaveBeenCalledTimes(1)
    })

    it('unmounts without crashing while the element is not upgraded (no hide)', async () => {
      const wrapper = await mountPage()
      wrapper.unmount()
    })

    it('skips the unmount hide when the dialog ref is null', async () => {
      const wrapper = await mountPage()
      ;(wrapper.vm as unknown as { deleteDialogRef: HTMLElement | null }).deleteDialogRef = null
      wrapper.unmount()
    })
  })
})

describe('ProjectMembers — load more', () => {
  it('shows a load-more button and appends the next page', async () => {
    membersList
      .mockResolvedValueOnce({ items: [owner, editor], total: 3 })
      .mockResolvedValueOnce({ items: [owner2], total: 3 })
    const wrapper = await mountPage()
    const more = wrapper.find('.version-list__more nldd-button')
    expect(more.exists()).toBe(true)
    expect(more.attributes('text')).toContain('leden')
    await more.trigger('click')
    await flushPromises()
    expect(wrapper.find('.version-list__more').exists()).toBe(false)
  })

  it('shows an error when loading more fails', async () => {
    membersList
      .mockResolvedValueOnce({ items: [owner, editor], total: 3 })
      .mockRejectedValueOnce(new Error('netwerk'))
    const wrapper = await mountPage()
    await wrapper.find('.version-list__more nldd-button').trigger('click')
    await flushPromises()
    expect(wrapper.find('.version-list__error').text()).toContain('mislukt')
  })
})

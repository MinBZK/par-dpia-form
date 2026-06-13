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

const membersList = vi.fn()
const membersAdd = vi.fn()
const membersUpdate = vi.fn()
const membersRemove = vi.fn()
vi.mock('../../src/api', () => ({
  members: {
    list: (...args: unknown[]) => membersList(...args),
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
    global: {
      stubs: { AppHeader: { template: '<header class="app-header-stub" />' } },
    },
  })
  await flushPromises()
  return wrapper
}

// jsdom does not implement HTMLDialogElement.showModal()/close(); add no-op prototype impls so the component's calls run and per-test spies have a property to wrap.
beforeEach(() => {
  if (!(HTMLDialogElement.prototype as { showModal?: unknown }).showModal) {
    HTMLDialogElement.prototype.showModal = function () {}
  }
  if (!(HTMLDialogElement.prototype as { close?: unknown }).close) {
    HTMLDialogElement.prototype.close = function () {}
  }
  routerPush.mockReset()
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
        global: { stubs: { AppHeader: { template: '<header class="app-header-stub" />' } } },
      })
      expect(wrapper.text()).toContain('Laden...')
      expect(wrapper.find('.member-list').exists()).toBe(false)

      resolveList([owner, editor])
      await flushPromises()

      expect(wrapper.text()).not.toContain('Laden...')
      expect(wrapper.find('.member-list').exists()).toBe(true)
      expect(membersList).toHaveBeenCalledWith('p1')
    })

    it('loads members and renders one row per member', async () => {
      const wrapper = await mountPage()
      expect(wrapper.findAll('.member-row')).toHaveLength(3)
      expect(wrapper.text()).toContain('Owner One (owner@example.com)')
    })

    it('sets the error message when list() rejects (catch branch)', async () => {
      membersList.mockRejectedValueOnce(new Error('boom'))
      const wrapper = await mountPage()
      const alert = wrapper.find('.rvo-alert--error')
      expect(alert.exists()).toBe(true)
      expect(alert.text()).toContain('Kan leden niet laden. Probeer het later opnieuw.')
      expect(wrapper.findAll('.member-row')).toHaveLength(1)
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
      const whoCells = wrapper.findAll('.member-col--who')
      const text = wrapper.text()
      expect(text).toContain('pending@example.com')
      expect(text).not.toContain('pending@example.com (pending@example.com)')
      expect(whoCells.length).toBeGreaterThan(0)
    })

    it('returns "name (email)" when displayName differs from email', async () => {
      const wrapper = await mountPage()
      expect(wrapper.text()).toContain('Editor One (ed@example.com)')
    })
  })

  describe('isOnlyOwner() / ownerCount', () => {
    it('disables the role select and hides delete for the sole owner', async () => {
      membersList.mockResolvedValue([owner, editor])
      const wrapper = await mountPage()

      const selects = wrapper.findAll('select.member-select')
      expect((selects[0].element as HTMLSelectElement).disabled).toBe(true)
      expect((selects[1].element as HTMLSelectElement).disabled).toBe(false)

      const deleteButtons = wrapper.findAll('button.member-delete')
      expect(deleteButtons).toHaveLength(1)
    })

    it('enables owner controls when there is more than one owner', async () => {
      membersList.mockResolvedValue([owner, owner2])
      const wrapper = await mountPage()

      const selects = wrapper.findAll('select.member-select')
      expect((selects[0].element as HTMLSelectElement).disabled).toBe(false)
      expect((selects[1].element as HTMLSelectElement).disabled).toBe(false)

      expect(wrapper.findAll('button.member-delete')).toHaveLength(2)
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
    })

    it('adds the member, refreshes the list and clears the email on success', async () => {
      const wrapper = await mountPage()
      membersList.mockClear()
      membersList.mockResolvedValue([owner, editor, makeMember({ userId: 'inv', email: 'new@example.com', displayName: 'New', role: 'editor' })])

      const emailInput = wrapper.find('#inviteEmail')
      await emailInput.setValue('new@example.com')
      await wrapper.find('form').trigger('submit.prevent')
      await flushPromises()

      expect(membersAdd).toHaveBeenCalledWith('p1', 'new@example.com', 'editor')
      expect(membersList).toHaveBeenCalledWith('p1')
      expect((emailInput.element as HTMLInputElement).value).toBe('')
    })

    it('uses the selected role when inviting', async () => {
      const wrapper = await mountPage()
      await wrapper.find('#inviteEmail').setValue('viewer@example.com')
      await wrapper.find('#inviteRole').setValue('viewer')
      await wrapper.find('form').trigger('submit.prevent')
      await flushPromises()
      expect(membersAdd).toHaveBeenCalledWith('p1', 'viewer@example.com', 'viewer')
    })

    it('shows the error message from the thrown error (catch branch)', async () => {
      const wrapper = await mountPage()
      membersAdd.mockRejectedValueOnce(new Error('E-mailadres al uitgenodigd'))
      await wrapper.find('#inviteEmail').setValue('dup@example.com')
      await wrapper.find('form').trigger('submit.prevent')
      await flushPromises()
      expect(wrapper.find('.rvo-alert--error').text()).toContain('E-mailadres al uitgenodigd')
    })

    it('clears a previous error on a subsequent successful invite', async () => {
      const wrapper = await mountPage()
      membersAdd.mockRejectedValueOnce(new Error('Eerdere fout'))
      await wrapper.find('#inviteEmail').setValue('a@example.com')
      await wrapper.find('form').trigger('submit.prevent')
      await flushPromises()
      expect(wrapper.find('.rvo-alert--error').exists()).toBe(true)

      await wrapper.find('#inviteEmail').setValue('b@example.com')
      await wrapper.find('form').trigger('submit.prevent')
      await flushPromises()
      expect(wrapper.find('.rvo-alert--error').exists()).toBe(false)
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
      expect(membersList).toHaveBeenCalledWith('p1')
    })

    it('shows the error message when update() rejects (catch branch)', async () => {
      const wrapper = await mountPage()
      membersUpdate.mockRejectedValueOnce(new Error('Rol kan niet gewijzigd'))
      const selects = wrapper.findAll('select.member-select')
      await selects[1].setValue('commenter')
      await flushPromises()
      expect(wrapper.find('.rvo-alert--error').text()).toContain('Rol kan niet gewijzigd')
    })
  })

  describe('delete modal (watch + open/close + confirmRemove)', () => {
    it('opens the dialog via showModal() when the delete button is clicked', async () => {
      const wrapper = await mountPage()
      const dialog = wrapper.find('dialog.confirm-dialog').element as HTMLDialogElement
      const showModalSpy = vi.spyOn(dialog, 'showModal').mockImplementation(() => {})

      await wrapper.find('button.member-delete').trigger('click')
      await flushPromises()

      expect(showModalSpy).toHaveBeenCalledTimes(1)
      expect(wrapper.find('dialog.confirm-dialog').text()).toContain('Editor One (ed@example.com)')
    })

    it('closes the dialog via close() and clears memberToDelete on cancel', async () => {
      const wrapper = await mountPage()
      const dialog = wrapper.find('dialog.confirm-dialog').element as HTMLDialogElement
      vi.spyOn(dialog, 'showModal').mockImplementation(() => {})
      const closeSpy = vi.spyOn(dialog, 'close').mockImplementation(() => {})

      await wrapper.find('button.member-delete').trigger('click')
      await flushPromises()

      const cancelButton = wrapper
        .findAll('dialog.confirm-dialog button')
        .find((b) => b.text().includes('Annuleer'))!
      await cancelButton.trigger('click')
      await flushPromises()

      expect(closeSpy).toHaveBeenCalled()
      expect(wrapper.find('dialog.confirm-dialog strong').text()).toBe('')
    })

    it('removes the member from the list on confirm (success branch)', async () => {
      const wrapper = await mountPage()
      const dialog = wrapper.find('dialog.confirm-dialog').element as HTMLDialogElement
      vi.spyOn(dialog, 'showModal').mockImplementation(() => {})
      vi.spyOn(dialog, 'close').mockImplementation(() => {})

      await wrapper.find('button.member-delete').trigger('click')
      await flushPromises()

      const confirmButton = wrapper
        .findAll('dialog.confirm-dialog button')
        .find((b) => b.text().trim() === 'Verwijderen')!
      await confirmButton.trigger('click')
      await flushPromises()

      expect(membersRemove).toHaveBeenCalledWith('p1', 'ed1')
      expect(wrapper.text()).not.toContain('Editor One (ed@example.com)')
      expect(wrapper.text()).toContain('Owner One (owner@example.com)')
    })

    it('shows the error message and still closes when remove() rejects (catch + finally)', async () => {
      const wrapper = await mountPage()
      const dialog = wrapper.find('dialog.confirm-dialog').element as HTMLDialogElement
      vi.spyOn(dialog, 'showModal').mockImplementation(() => {})
      const closeSpy = vi.spyOn(dialog, 'close').mockImplementation(() => {})
      membersRemove.mockRejectedValueOnce(new Error('Verwijderen mislukt'))

      await wrapper.find('button.member-delete').trigger('click')
      await flushPromises()

      const confirmButton = wrapper
        .findAll('dialog.confirm-dialog button')
        .find((b) => b.text().trim() === 'Verwijderen')!
      await confirmButton.trigger('click')
      await flushPromises()

      expect(wrapper.find('.rvo-alert--error').text()).toContain('Verwijderen mislukt')
      expect(closeSpy).toHaveBeenCalled()
      expect(wrapper.text()).toContain('Editor One (ed@example.com)')
    })

    it('returns early in confirmRemove when there is no member to delete', async () => {
      const wrapper = await mountPage()
      const dialog = wrapper.find('dialog.confirm-dialog').element as HTMLDialogElement
      vi.spyOn(dialog, 'showModal').mockImplementation(() => {})
      vi.spyOn(dialog, 'close').mockImplementation(() => {})

      await wrapper.find('button.member-delete').trigger('click')
      await flushPromises()
      const cancelButton = wrapper
        .findAll('dialog.confirm-dialog button')
        .find((b) => b.text().includes('Annuleer'))!
      await cancelButton.trigger('click')
      await flushPromises()

      const confirmButton = wrapper
        .findAll('dialog.confirm-dialog button')
        .find((b) => b.text().trim() === 'Verwijderen')!
      await confirmButton.trigger('click')
      await flushPromises()

      expect(membersRemove).not.toHaveBeenCalled()
    })
  })
})

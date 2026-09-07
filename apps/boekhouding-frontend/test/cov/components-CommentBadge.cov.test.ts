/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import CommentBadge from '../../src/components/CommentBadge.vue'
import { useCollaborationStore } from '../../src/stores/collaboration'
import type { CommentThread } from '../../src/api'

function thread(id: string, resolvedAt: string | null): CommentThread {
  return {
    id,
    parentId: null,
    fieldId: 'urn:nl:dpia:3.0?=task_id=1.1',
    authorId: 'user-1',
    authorName: 'Sam',
    body: 'Een opmerking',
    createdAt: '2026-04-12T00:00:00Z',
    updatedAt: '2026-04-12T00:00:00Z',
    resolvedAt,
    resolvedBy: null,
    replies: [],
  } as CommentThread
}

function mountBadge(open: boolean) {
  return mount(CommentBadge, {
    props: { open },
  })
}

describe('CommentBadge', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('open prop', () => {
    it('renders the inactive (closed) state as a transparent accent button', () => {
      const wrapper = mountBadge(false)
      const button = wrapper.get('nldd-button')

      expect(button.attributes('variant')).toBe('accent-transparent')
      expect(button.attributes('size')).toBe('sm')
      expect(button.attributes('start-icon')).toBe('comment')
      expect(button.attributes('expanded')).toBeUndefined()
      expect(button.attributes('accessible-label')).toBe('Opmerkingen')
      expect(wrapper.get('[slot="text"]').text()).toBe('Opmerkingen')
    })

    it('renders the active (open) state as a filled accent button', () => {
      const wrapper = mountBadge(true)
      const button = wrapper.get('nldd-button')

      expect(button.attributes('variant')).toBe('accent-filled')
      expect(button.attributes('expanded')).toBe('true')
    })
  })

  describe('unresolved count', () => {
    it('hides the badge when there are no unresolved threads', () => {
      const wrapper = mountBadge(false)
      const store = useCollaborationStore()

      expect(store.totalUnresolvedCount).toBe(0)
      expect(wrapper.find('nldd-badge').exists()).toBe(false)
    })

    it('hides the badge when all threads are resolved', async () => {
      const wrapper = mountBadge(false)
      const store = useCollaborationStore()

      store.threads = [thread('a', '2026-04-13T00:00:00Z')]
      await wrapper.vm.$nextTick()

      expect(store.totalUnresolvedCount).toBe(0)
      expect(wrapper.find('nldd-badge').exists()).toBe(false)
    })

    it('shows the unresolved count as a decorative badge and in the accessible name', async () => {
      const wrapper = mountBadge(false)
      const store = useCollaborationStore()

      store.threads = [
        thread('a', null),
        thread('b', null),
        thread('c', '2026-04-13T00:00:00Z'),
      ]
      await wrapper.vm.$nextTick()

      expect(store.totalUnresolvedCount).toBe(2)
      const badge = wrapper.get('nldd-badge')
      expect(badge.attributes('number')).toBe('2')
      expect(badge.attributes('color')).toBe('accent')
      expect(badge.attributes('decorative')).toBeDefined()
      expect(wrapper.get('nldd-button').attributes('accessible-label')).toBe('Opmerkingen, 2 onopgelost')
    })

    it('inverts the badge color on the filled (open) button', async () => {
      const wrapper = mountBadge(true)
      const store = useCollaborationStore()

      store.threads = [thread('a', null)]
      await wrapper.vm.$nextTick()

      expect(wrapper.get('nldd-badge').attributes('color')).toBe('inherit')
    })
  })

  describe('toggle event', () => {
    it('emits toggle when the button is clicked', async () => {
      const wrapper = mountBadge(false)

      await wrapper.get('nldd-button').trigger('click')

      expect(wrapper.emitted('toggle')).toHaveLength(1)
      expect(wrapper.emitted('toggle')![0]).toEqual([])
    })
  })
})

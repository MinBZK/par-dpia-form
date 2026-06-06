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
    global: {
      stubs: {
        IconMessage: {
          template: '<svg class="icon-message-stub"></svg>',
        },
      },
    },
  })
}

describe('CommentBadge', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('open prop', () => {
    it('renders the inactive (closed) state', () => {
      const wrapper = mountBadge(false)
      const button = wrapper.get('button.comment-badge')

      expect(button.classes()).not.toContain('comment-badge--active')
      expect(button.attributes('aria-expanded')).toBe('false')
      expect(button.attributes('aria-controls')).toBeUndefined()
      expect(wrapper.get('.comment-badge__label').text()).toBe('Opmerkingen')
    })

    it('renders the active (open) state', () => {
      const wrapper = mountBadge(true)
      const button = wrapper.get('button.comment-badge')

      expect(button.classes()).toContain('comment-badge--active')
      expect(button.attributes('aria-expanded')).toBe('true')
      expect(button.attributes('aria-controls')).toBe('comment-panel')
    })
  })

  describe('unresolved count', () => {
    it('hides the count when there are no unresolved threads', () => {
      const wrapper = mountBadge(false)
      const store = useCollaborationStore()

      expect(store.totalUnresolvedCount).toBe(0)
      expect(wrapper.find('.comment-badge__count').exists()).toBe(false)
    })

    it('hides the count when all threads are resolved', async () => {
      const wrapper = mountBadge(false)
      const store = useCollaborationStore()

      store.threads = [thread('a', '2026-04-13T00:00:00Z')]
      await wrapper.vm.$nextTick()

      expect(store.totalUnresolvedCount).toBe(0)
      expect(wrapper.find('.comment-badge__count').exists()).toBe(false)
    })

    it('shows the unresolved count when there are unresolved threads', async () => {
      const wrapper = mountBadge(true)
      const store = useCollaborationStore()

      store.threads = [
        thread('a', null),
        thread('b', null),
        thread('c', '2026-04-13T00:00:00Z'),
      ]
      await wrapper.vm.$nextTick()

      expect(store.totalUnresolvedCount).toBe(2)
      const count = wrapper.get('.comment-badge__count')
      expect(count.text()).toBe('2')
    })
  })

  describe('toggle event', () => {
    it('emits toggle when the button is clicked', async () => {
      const wrapper = mountBadge(false)

      await wrapper.get('button.comment-badge').trigger('click')

      expect(wrapper.emitted('toggle')).toHaveLength(1)
      expect(wrapper.emitted('toggle')![0]).toEqual([])
    })
  })
})

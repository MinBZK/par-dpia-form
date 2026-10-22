/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { defineComponent, h, ref, nextTick, type Ref } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'

// Stub the API module so importing the collaboration store never makes real requests.
vi.mock('../../src/api', () => ({
  commentsApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), resolve: vi.fn(), reopen: vi.fn() },
  syncApi: { get: vi.fn() },
  SessionExpiredError: class SessionExpiredError extends Error {},
}))

import { useFieldCommentIndicators } from '../../src/composables/useFieldCommentIndicators'
import { useCollaborationStore } from '../../src/stores/collaboration'
import type { CommentThread } from '../../src/api'

function thread(overrides: Partial<CommentThread> = {}): CommentThread {
  return {
    id: 'c1',
    fieldId: '1.1',
    parentId: null,
    authorId: 'u1',
    authorName: 'Sam',
    body: 'Graag de bewaartermijn aanvullen.',
    resolvedAt: null,
    resolvedBy: null,
    resolvedByName: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    replies: [],
    ...overrides,
  }
}

// Runs the composable inside a real component setup so onUnmounted and watchers fire.
function mountHarness(opts: {
  container: HTMLElement | null
  canComment?: boolean
} = { container: null }) {
  const containerRef = ref<HTMLElement | null>(opts.container) as Ref<HTMLElement | null>
  const canComment = ref<boolean>(opts.canComment ?? true)
  const onFieldClick = vi.fn()
  let api: ReturnType<typeof useFieldCommentIndicators> | undefined

  const Host = defineComponent({
    setup() {
      api = useFieldCommentIndicators(containerRef, onFieldClick, canComment)
      return () => h('div')
    },
  })

  const wrapper: VueWrapper = mount(Host)
  return { wrapper, containerRef, canComment, onFieldClick, api: api! }
}

// Builds a `label-<prefix>-<fieldId>` element in a container, optionally inside
// the `.form-field__label` block the button is injected into.
function makeLabel(opts: {
  id: string
  withLabelContainer?: boolean
  withDescription?: boolean
}): { container: HTMLElement; label: HTMLElement; labelContainer: HTMLElement | null } {
  const container = document.createElement('div')
  const label = document.createElement('label')
  label.id = opts.id
  let labelContainer: HTMLElement | null = null

  if (opts.withLabelContainer) {
    labelContainer = document.createElement('div')
    labelContainer.className = 'form-field__label'
    labelContainer.appendChild(label)
    if (opts.withDescription) {
      const desc = document.createElement('div')
      desc.className = 'form-field__description'
      labelContainer.appendChild(desc)
    }
    container.appendChild(labelContainer)
  } else {
    container.appendChild(label)
  }

  return { container, label, labelContainer }
}

let pinia: ReturnType<typeof createPinia>

beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  document.body.innerHTML = ''
})

afterEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
})

describe('useFieldCommentIndicators', () => {
  describe('initial mount with null container', () => {
    it('does nothing and exposes scanAndInject', () => {
      const { api } = mountHarness({ container: null })
      expect(api.scanAndInject).toBeTypeOf('function')
      expect(() => api.scanAndInject()).not.toThrow()
    })
  })

  describe('label parsing', () => {
    it('skips labels whose id has fewer than 2 parts after stripping the prefix', () => {
      const container = document.createElement('div')
      const label = document.createElement('label')
      label.id = 'label-single'
      container.appendChild(label)
      document.body.appendChild(container)

      mountHarness({ container })

      expect(container.querySelector('nldd-button')).toBeNull()
    })

    it('joins multi-segment field ids back together', async () => {
      const { container } = makeLabel({ id: 'label-prefix-2-1-3', withLabelContainer: true })
      document.body.appendChild(container)
      const store = useCollaborationStore()
      store.threads = [thread({ fieldId: '2-1-3', id: 't1' })]
      await nextTick()

      const { onFieldClick } = mountHarness({ container })
      const btn = container.querySelector<HTMLElement>('nldd-button')!
      expect(btn).not.toBeNull()
      btn.click()
      expect(onFieldClick).toHaveBeenCalledWith('2-1-3')
    })
  })

  describe('button rendering by comment count', () => {
    it('renders the quiet icon-only variant when count is 0 and user can comment', () => {
      const { container } = makeLabel({ id: 'label-x-1.1', withLabelContainer: true })
      document.body.appendChild(container)

      mountHarness({ container, canComment: true })

      const btn = container.querySelector<HTMLElement>('nldd-button')!
      expect(btn).not.toBeNull()
      expect(btn.classList.contains('comment-field-label__btn')).toBe(true)
      expect(btn.getAttribute('size')).toBe('xs')
      expect(btn.getAttribute('appearance')).toBe('accent-transparent')
      expect(btn.getAttribute('start-icon')).toBe('comment')
      // No count to show, so no text at all.
      expect(btn.hasAttribute('text')).toBe(false)
      expect(btn.getAttribute('accessible-label')).toBe('Opmerking toevoegen bij deze vraag')
    })

    it('renders a filled button with the bare count and a singular label for one comment', async () => {
      const { container } = makeLabel({ id: 'label-x-1.1', withLabelContainer: true })
      document.body.appendChild(container)
      const store = useCollaborationStore()
      store.threads = [thread({ fieldId: '1.1', id: 't1' })]
      await nextTick()

      mountHarness({ container })

      const btn = container.querySelector<HTMLElement>('nldd-button')!
      expect(btn.getAttribute('appearance')).toBe('accent-filled')
      expect(btn.getAttribute('text')).toBe('1')
      expect(btn.getAttribute('accessible-label')).toBe('1 opmerking bij deze vraag')
    })

    it('renders a plural accessible label for more than one comment', async () => {
      const { container } = makeLabel({ id: 'label-x-1.1', withLabelContainer: true })
      document.body.appendChild(container)
      const store = useCollaborationStore()
      store.threads = [
        thread({ fieldId: '1.1', id: 't1' }),
        thread({ fieldId: '1.1', id: 't2' }),
      ]
      await nextTick()

      mountHarness({ container })

      const btn = container.querySelector<HTMLElement>('nldd-button')!
      expect(btn.getAttribute('appearance')).toBe('accent-filled')
      expect(btn.getAttribute('text')).toBe('2')
      expect(btn.getAttribute('accessible-label')).toBe('2 opmerkingen bij deze vraag')
    })
  })

  describe('button click handler', () => {
    it('prevents default, stops propagation and calls onFieldClick', () => {
      const { container } = makeLabel({ id: 'label-x-1.1', withLabelContainer: true })
      document.body.appendChild(container)

      const { onFieldClick } = mountHarness({ container })
      const btn = container.querySelector<HTMLElement>('nldd-button')!

      const event = new MouseEvent('click', { bubbles: true, cancelable: true })
      const preventSpy = vi.spyOn(event, 'preventDefault')
      const stopSpy = vi.spyOn(event, 'stopPropagation')
      btn.dispatchEvent(event)

      expect(preventSpy).toHaveBeenCalled()
      expect(stopSpy).toHaveBeenCalled()
      expect(onFieldClick).toHaveBeenCalledWith('1.1')
    })
  })

  describe('canComment gating', () => {
    it('does not inject a button when user cannot comment and count is 0', () => {
      const { container } = makeLabel({ id: 'label-x-1.1', withLabelContainer: true })
      document.body.appendChild(container)

      mountHarness({ container, canComment: false })

      expect(container.querySelector('nldd-button')).toBeNull()
    })

    it('removes the button and the grid class when the user can no longer comment', async () => {
      const { container, labelContainer } = makeLabel({ id: 'label-x-1.1', withLabelContainer: true })
      document.body.appendChild(container)
      const store = useCollaborationStore()
      store.threads = [thread({ fieldId: '1.1', id: 't1' })]
      await nextTick()

      const { canComment, api } = mountHarness({ container, canComment: true })
      expect(container.querySelector('nldd-button')).not.toBeNull()
      expect(labelContainer!.classList.contains('comment-field-label--grid')).toBe(true)

      store.threads = [thread({ fieldId: '1.1', id: 't1', resolvedAt: '2026-01-02T00:00:00Z' })]
      canComment.value = false
      api.scanAndInject()

      expect(container.querySelector('nldd-button')).toBeNull()
      expect(labelContainer!.classList.contains('comment-field-label--grid')).toBe(false)
    })

    it('takes the no-existing-button branch when user cannot comment and field never had a button', () => {
      const { container } = makeLabel({ id: 'label-x-1.1', withLabelContainer: true })
      document.body.appendChild(container)

      const { api } = mountHarness({ container, canComment: false })
      api.scanAndInject()
      expect(container.querySelector('nldd-button')).toBeNull()
    })
  })

  describe('updating an existing button', () => {
    it('updates the same button in place on re-scan and keeps its class', async () => {
      const { container } = makeLabel({ id: 'label-x-1.1', withLabelContainer: true })
      document.body.appendChild(container)
      const store = useCollaborationStore()
      store.threads = [thread({ fieldId: '1.1', id: 't1' })]
      await nextTick()

      const { api } = mountHarness({ container })
      const firstBtn = container.querySelector<HTMLElement>('nldd-button')!
      expect(firstBtn.classList.contains('comment-field-label__btn')).toBe(true)

      store.threads = [
        thread({ fieldId: '1.1', id: 't1' }),
        thread({ fieldId: '1.1', id: 't2' }),
      ]
      api.scanAndInject()

      const buttons = container.querySelectorAll('nldd-button')
      expect(buttons.length).toBe(1)
      expect(buttons[0]).toBe(firstBtn)
      expect(firstBtn.getAttribute('text')).toBe('2')
      expect(firstBtn.classList.contains('comment-field-label__btn')).toBe(true)
    })

    it('does not duplicate buttons across repeated scans', () => {
      const { container } = makeLabel({ id: 'label-x-1.1', withLabelContainer: true })
      document.body.appendChild(container)

      const { api } = mountHarness({ container })
      api.scanAndInject()
      api.scanAndInject()

      expect(container.querySelectorAll('nldd-button').length).toBe(1)
    })
  })

  describe('injection placement', () => {
    it('puts the button inside the label block and turns that block into a grid', () => {
      const { container, labelContainer } = makeLabel({
        id: 'label-x-1.1',
        withLabelContainer: true,
        withDescription: true,
      })
      document.body.appendChild(container)

      mountHarness({ container })

      const btn = container.querySelector<HTMLElement>('nldd-button')!
      expect(btn.parentElement).toBe(labelContainer)
      expect(labelContainer!.classList.contains('comment-field-label--grid')).toBe(true)
      // The description keeps the full width, so it stays a sibling of the button.
      expect(container.querySelector('.comment-field-row')).toBeNull()
    })

    it('falls back to its own row after the label when there is no label block', () => {
      const { container, label } = makeLabel({ id: 'label-x-1.1' })
      document.body.appendChild(container)

      mountHarness({ container })

      const row = label.nextElementSibling!
      expect(row.className).toBe('comment-field-row')
      expect(row.querySelector('nldd-button')).not.toBeNull()
      expect(container.querySelector('.comment-field-label--grid')).toBeNull()
    })
  })

  describe('cleanup of stale indicators', () => {
    it('removes the button and the grid class for a field that leaves the DOM', () => {
      const { container, labelContainer: lc1 } = makeLabel({ id: 'label-x-1.1', withLabelContainer: true })
      const lc2 = document.createElement('div')
      lc2.className = 'form-field__label'
      const label2 = document.createElement('label')
      label2.id = 'label-x-2.2'
      lc2.appendChild(label2)
      container.appendChild(lc2)
      document.body.appendChild(container)

      const { api } = mountHarness({ container })
      expect(container.querySelectorAll('nldd-button').length).toBe(2)
      expect(lc2.classList.contains('comment-field-label--grid')).toBe(true)

      label2.removeAttribute('id')
      api.scanAndInject()

      expect(container.querySelectorAll('nldd-button').length).toBe(1)
      expect(lc2.querySelector('nldd-button')).toBeNull()
      expect(lc2.classList.contains('comment-field-label--grid')).toBe(false)
      expect(lc1!.classList.contains('comment-field-label--grid')).toBe(true)
    })

    it('keeps the grid class while another button still sits in the same label block', () => {
      // Two questions sharing one label block: removing one leaves the grid in place.
      const container = document.createElement('div')
      const labelContainer = document.createElement('div')
      labelContainer.className = 'form-field__label'
      const labelA = document.createElement('label')
      labelA.id = 'label-x-1.1'
      const labelB = document.createElement('label')
      labelB.id = 'label-x-2.2'
      labelContainer.append(labelA, labelB)
      container.appendChild(labelContainer)
      document.body.appendChild(container)

      const { api } = mountHarness({ container })
      expect(labelContainer.querySelectorAll('nldd-button').length).toBe(2)

      labelB.removeAttribute('id')
      api.scanAndInject()

      expect(labelContainer.querySelectorAll('nldd-button').length).toBe(1)
      expect(labelContainer.classList.contains('comment-field-label--grid')).toBe(true)
    })

    it('removes a fallback-row button that has no label block around it', () => {
      const { container, label } = makeLabel({ id: 'label-x-1.1' })
      document.body.appendChild(container)

      const { api } = mountHarness({ container })
      expect(container.querySelector('nldd-button')).not.toBeNull()

      label.removeAttribute('id')
      api.scanAndInject()

      expect(container.querySelector('nldd-button')).toBeNull()
    })
  })

  describe('MutationObserver integration', () => {
    it('injects buttons for labels added to the DOM after observing starts', async () => {
      const container = document.createElement('div')
      document.body.appendChild(container)

      mountHarness({ container })
      expect(container.querySelector('nldd-button')).toBeNull()

      const lc = document.createElement('div')
      lc.className = 'form-field__label'
      const label = document.createElement('label')
      label.id = 'label-x-3.3'
      lc.appendChild(label)
      container.appendChild(lc)

      await vi.waitFor(() => {
        expect(container.querySelector('nldd-button')).not.toBeNull()
      })
    })
  })

  describe('store watcher', () => {
    it('re-scans when unresolvedCountByField changes', async () => {
      const { container } = makeLabel({ id: 'label-x-1.1', withLabelContainer: true })
      document.body.appendChild(container)
      const store = useCollaborationStore()

      mountHarness({ container })
      let btn = container.querySelector<HTMLElement>('nldd-button')!
      expect(btn.hasAttribute('text')).toBe(false)

      store.threads = [thread({ fieldId: '1.1', id: 't1' })]
      await nextTick()

      btn = container.querySelector<HTMLElement>('nldd-button')!
      expect(btn.getAttribute('text')).toBe('1')
    })
  })

  describe('scanAndInject without an active observer', () => {
    it('injects without reconnecting an observer when none exists', () => {
      const { containerRef, api } = mountHarness({ container: null })

      const { container } = makeLabel({ id: 'label-x-7.7', withLabelContainer: true })
      document.body.appendChild(container)

      // Deliberately no nextTick: the containerRef watcher has not run, so the
      // observer is still null when scanAndInject runs.
      containerRef.value = container
      api.scanAndInject()

      expect(container.querySelector('nldd-button')).not.toBeNull()
    })
  })

  describe('container ref watcher', () => {
    it('starts observing when the container ref becomes non-null', async () => {
      const { containerRef } = mountHarness({ container: null })

      const container = document.createElement('div')
      const lc = document.createElement('div')
      lc.className = 'form-field__label'
      const label = document.createElement('label')
      label.id = 'label-x-4.4'
      lc.appendChild(label)
      container.appendChild(lc)
      document.body.appendChild(container)

      containerRef.value = container
      await nextTick()

      expect(container.querySelector('nldd-button')).not.toBeNull()
    })

    it('short-circuits startObserving when an observer already exists (ref swaps element)', async () => {
      const { container: containerA } = makeLabel({ id: 'label-x-1.1', withLabelContainer: true })
      document.body.appendChild(containerA)

      const { containerRef } = mountHarness({ container: containerA })
      expect(containerA.querySelector('nldd-button')).not.toBeNull()

      // Swap to a different element with no null in between, so the existing
      // observer short-circuits startObserving and B is never scanned.
      const { container: containerB } = makeLabel({ id: 'label-x-2.2', withLabelContainer: true })
      document.body.appendChild(containerB)
      containerRef.value = containerB
      await nextTick()

      expect(containerB.querySelector('nldd-button')).toBeNull()
    })

    it('stops observing and strips the grid class when the container ref becomes null', async () => {
      const { container, labelContainer } = makeLabel({ id: 'label-x-1.1', withLabelContainer: true })
      document.body.appendChild(container)

      const { containerRef } = mountHarness({ container })
      expect(container.querySelector('nldd-button')).not.toBeNull()

      containerRef.value = null
      await nextTick()

      expect(container.querySelector('nldd-button')).toBeNull()
      expect(labelContainer!.classList.contains('comment-field-label--grid')).toBe(false)
    })
  })

  describe('onUnmounted cleanup', () => {
    it('stops observing and clears buttons when the component unmounts', async () => {
      const { container, labelContainer } = makeLabel({ id: 'label-x-1.1', withLabelContainer: true })
      document.body.appendChild(container)

      const { wrapper } = mountHarness({ container })
      expect(container.querySelector('nldd-button')).not.toBeNull()

      wrapper.unmount()
      await nextTick()

      expect(container.querySelector('nldd-button')).toBeNull()
      expect(labelContainer!.classList.contains('comment-field-label--grid')).toBe(false)
    })
  })
})

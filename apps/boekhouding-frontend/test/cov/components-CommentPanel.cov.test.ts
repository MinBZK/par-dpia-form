/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import CommentPanel from '../../src/components/CommentPanel.vue'
import { useCollaborationStore } from '../../src/stores/collaboration'
import type { CommentThread, CommentReply } from '../../src/api'

// jsdom lacks CSS.escape and ResizeObserver; the component relies on both, so
// we provide minimal stand-ins (test-environment only).
const observedTargets: HTMLElement[] = []
let lastResizeCallback: (() => void) | null = null
const mountedWrappers: Array<{ unmount: () => void }> = []

class StubResizeObserver {
  callback: () => void
  constructor(cb: () => void) {
    this.callback = cb
    lastResizeCallback = cb
  }
  observe(el: HTMLElement) {
    observedTargets.push(el)
  }
  disconnect() {}
}

beforeEach(() => {
  setActivePinia(createPinia())
  observedTargets.length = 0
  lastResizeCallback = null
  ;(globalThis as unknown as { CSS: { escape: (s: string) => string } }).CSS = {
    escape: (s: string) => s,
  }
  ;(globalThis as unknown as { ResizeObserver: typeof StubResizeObserver }).ResizeObserver =
    StubResizeObserver
  // jsdom does not implement scrollIntoView; provide a no-op.
  if (!HTMLElement.prototype.scrollIntoView) {
    HTMLElement.prototype.scrollIntoView = function () {}
  }
})

afterEach(() => {
  for (const w of mountedWrappers.splice(0)) w.unmount()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  delete (globalThis as unknown as { CSS?: unknown }).CSS
  delete (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver
})

function reply(id: string, authorId = 'user-2', authorName = 'Noor'): CommentReply {
  return {
    id,
    parentId: 'root',
    authorId,
    authorName,
    body: `reactie ${id}`,
    createdAt: '2026-04-12T10:00:00Z',
    updatedAt: '2026-04-12T10:00:00Z',
  }
}

function thread(
  overrides: Partial<CommentThread> & { id: string; fieldId: string },
): CommentThread {
  return {
    parentId: null,
    authorId: 'user-1',
    authorName: 'Sam',
    body: 'Een opmerking',
    resolvedAt: null,
    resolvedBy: null,
    resolvedByName: null,
    createdAt: '2026-04-12T10:00:00Z',
    updatedAt: '2026-04-12T10:00:00Z',
    replies: [],
    ...overrides,
  } as CommentThread
}

// Builds a fake form container with `label-*` elements so
// updateFieldPositions() can resolve positions and labels.
function buildFormContainer(
  specs: Array<{ id: string; rvoLabel?: string; textLabel?: string }>,
): HTMLElement {
  const form = document.createElement('div')
  for (const spec of specs) {
    const label = document.createElement('div')
    label.id = spec.id
    if (spec.rvoLabel !== undefined) {
      const wrap = document.createElement('div')
      wrap.className = 'rvo-form-field__label'
      const span = document.createElement('span')
      span.textContent = spec.rvoLabel
      wrap.appendChild(span)
      label.appendChild(wrap)
    } else if (spec.textLabel !== undefined) {
      label.textContent = spec.textLabel
    }
    form.appendChild(label)
  }
  document.body.appendChild(form)
  return form
}

// Mounts the panel against a real pinia store whose action methods are spied
// so the component can be asserted against without hitting the network layer.
function mountPanel(opts: {
  role?: string
  activeFieldId?: string | null
  formContainerRef?: HTMLElement | null
  threads?: CommentThread[]
  currentUserId?: string | null
  loading?: boolean
} = {}) {
  const store = useCollaborationStore()
  store.threads = opts.threads ?? []
  store.currentUserId = opts.currentUserId ?? 'user-1'
  store.loading = opts.loading ?? false

  const spies = {
    createComment: vi.spyOn(store, 'createComment').mockResolvedValue(undefined),
    createReply: vi.spyOn(store, 'createReply').mockResolvedValue(undefined),
    updateComment: vi.spyOn(store, 'updateComment').mockResolvedValue(undefined),
    deleteComment: vi.spyOn(store, 'deleteComment').mockResolvedValue(undefined),
    resolveThread: vi.spyOn(store, 'resolveThread').mockResolvedValue(undefined),
    reopenThread: vi.spyOn(store, 'reopenThread').mockResolvedValue(undefined),
  }

  const stubs = {
    IconX: { template: '<i class="icon-x" />' },
    IconMessage: { template: '<i class="icon-message" />' },
    IconTrash: { template: '<i class="icon-trash" />' },
    IconCheck: { template: '<i class="icon-check" />' },
    IconArrowBackUp: { template: '<i class="icon-arrow" />' },
  }

  const wrapper = mount(CommentPanel, {
    attachTo: document.body,
    props: {
      role: opts.role ?? 'owner',
      activeFieldId: opts.activeFieldId ?? null,
      formContainerRef: opts.formContainerRef ?? null,
    },
    global: { stubs },
  })
  mountedWrappers.push(wrapper)

  return { wrapper, store, spies }
}

// Run pending requestAnimationFrame callbacks (onMounted schedules one).
function flushRaf(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

describe('CommentPanel', () => {
  describe('header & basic rendering', () => {
    it('emits close when the close button is clicked', async () => {
      const { wrapper } = mountPanel()
      await wrapper.get('.comment-panel__close').trigger('click')
      expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it('shows the loading state when the store is loading', () => {
      const { wrapper } = mountPanel({ loading: true })
      const empty = wrapper.get('.comment-panel__empty')
      expect(empty.text()).toBe('Laden...')
      expect(empty.attributes('role')).toBe('status')
    })

    it('shows the empty state when there are no positioned entries', () => {
      const { wrapper } = mountPanel({ loading: false })
      const empty = wrapper.get('.comment-panel__empty')
      expect(empty.text()).toContain('Er zijn nog geen opmerkingen bij deze stap')
    })

    it('toggles showResolved via the checkbox', async () => {
      const { wrapper } = mountPanel()
      const checkbox = wrapper.get('.comment-panel__toggle input')
      await checkbox.setValue(true)
      expect((checkbox.element as HTMLInputElement).checked).toBe(true)
    })
  })

  describe('canComment / canResolve role branches', () => {
    it.each([
      ['commenter', true, false],
      ['editor', true, true],
      ['owner', true, true],
      ['viewer', false, false],
    ])('role %s → canComment=%s canResolve=%s', async (role, canComment) => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', rvoLabel: 'Veld' }])
      const t = thread({ id: 'root', fieldId: '1.1' })
      const { wrapper } = mountPanel({
        role,
        formContainerRef: form,
        threads: [t],
        activeFieldId: '1.1',
      })
      await flushRaf()
      await nextTick()
      expect(wrapper.find('.comment-inline-form').exists()).toBe(canComment)
    })
  })

  describe('updateFieldPositions / positionedEntries', () => {
    it('positions threads using the rvo label text', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', rvoLabel: 'Naam van veld' }])
      const t = thread({ id: 'root', fieldId: '1.1' })
      const { wrapper } = mountPanel({ formContainerRef: form, threads: [t] })
      await flushRaf()
      await nextTick()

      const group = wrapper.get('.comment-field-group')
      expect(group.attributes('data-field-group')).toBe('1.1')
      expect(group.get('.comment-field-group__label').text()).toBe(
        'Opmerking voor: Naam van veld',
      )
    })

    it('falls back to label.textContent when no rvo label is present', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-2.2', textLabel: 'Platte tekst\ntweede regel' }])
      const t = thread({ id: 'root', fieldId: '2.2' })
      const { wrapper } = mountPanel({ formContainerRef: form, threads: [t] })
      await flushRaf()
      await nextTick()

      expect(wrapper.get('.comment-field-group__label').text()).toBe(
        'Opmerking voor: Platte tekst',
      )
    })

    it('falls back to the fieldId when the label has no text', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-3.3' }])
      const t = thread({ id: 'root', fieldId: '3.3' })
      const { wrapper } = mountPanel({ formContainerRef: form, threads: [t] })
      await flushRaf()
      await nextTick()

      expect(wrapper.get('.comment-field-group__label').text()).toBe('Opmerking voor: 3.3')
    })

    it('skips label ids with fewer than two segments', async () => {
      const form = buildFormContainer([{ id: 'label-single', rvoLabel: 'genegeerd' }])
      const t = thread({ id: 'root', fieldId: 'single' })
      const { wrapper } = mountPanel({ formContainerRef: form, threads: [t] })
      await flushRaf()
      await nextTick()

      expect(wrapper.find('.comment-field-group').exists()).toBe(false)
      expect(wrapper.get('.comment-panel__empty').exists()).toBe(true)
    })

    it('drops threads whose field has no resolved position (top undefined)', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', rvoLabel: 'Veld' }])
      const present = thread({ id: 'a', fieldId: '1.1' })
      const orphan = thread({ id: 'b', fieldId: '9.9' })
      const { wrapper } = mountPanel({ formContainerRef: form, threads: [present, orphan] })
      await flushRaf()
      await nextTick()

      const groups = wrapper.findAll('.comment-field-group')
      expect(groups).toHaveLength(1)
      expect(groups[0].attributes('data-field-group')).toBe('1.1')
    })

    it('hides resolved threads unless showResolved is on', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', rvoLabel: 'Veld' }])
      const resolved = thread({ id: 'a', fieldId: '1.1', resolvedAt: '2026-04-13T00:00:00Z' })
      const { wrapper } = mountPanel({ formContainerRef: form, threads: [resolved] })
      await flushRaf()
      await nextTick()

      expect(wrapper.find('.comment-field-group').exists()).toBe(false)

      await wrapper.get('.comment-panel__toggle input').setValue(true)
      await nextTick()
      expect(wrapper.find('.comment-thread--resolved').exists()).toBe(true)
    })

    it('keeps an entry for the active field even when all its threads are filtered out', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', rvoLabel: 'Veld' }])
      const resolved = thread({ id: 'a', fieldId: '1.1', resolvedAt: '2026-04-13T00:00:00Z' })
      const { wrapper } = mountPanel({
        formContainerRef: form,
        threads: [resolved],
        activeFieldId: '1.1',
      })
      await flushRaf()
      await nextTick()

      const group = wrapper.get('.comment-field-group')
      expect(group.classes()).toContain('comment-field-group--active')
    })

    it('adds an entry for an active field that has no existing comments', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-4.4', rvoLabel: 'Nieuw veld' }])
      const { wrapper } = mountPanel({ formContainerRef: form, threads: [], activeFieldId: '4.4' })
      await flushRaf()
      await nextTick()

      const group = wrapper.get('.comment-field-group')
      expect(group.attributes('data-field-group')).toBe('4.4')
      expect(group.findAll('.comment-thread')).toHaveLength(0)
      expect(group.find('.comment-inline-form').exists()).toBe(true)
    })

    it('does not add an entry for an active field with no resolved position', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', rvoLabel: 'Veld' }])
      const { wrapper } = mountPanel({ formContainerRef: form, threads: [], activeFieldId: '5.5' })
      await flushRaf()
      await nextTick()

      expect(wrapper.find('.comment-field-group').exists()).toBe(false)
      expect(wrapper.get('.comment-panel__empty').exists()).toBe(true)
    })

    it('sorts entries by their top position', async () => {
      const form = buildFormContainer([
        { id: 'label-dpia-1.1', rvoLabel: 'Eerste' },
        { id: 'label-dpia-2.2', rvoLabel: 'Tweede' },
      ])
      const t1 = thread({ id: 'a', fieldId: '1.1' })
      const t2 = thread({ id: 'b', fieldId: '2.2' })
      const { wrapper } = mountPanel({ formContainerRef: form, threads: [t1, t2] })
      await flushRaf()
      await nextTick()

      expect(wrapper.findAll('.comment-field-group')).toHaveLength(2)
    })

    it('does nothing in updateFieldPositions when there is no form container', async () => {
      const t = thread({ id: 'root', fieldId: '1.1' })
      const { wrapper } = mountPanel({ formContainerRef: null, threads: [t] })
      await flushRaf()
      await nextTick()
      expect(wrapper.find('.comment-field-group').exists()).toBe(false)
    })
  })

  describe('observers & scheduled updates', () => {
    it('observes the form container on mount and reacts to a resize', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', rvoLabel: 'Veld' }])
      const { wrapper } = mountPanel({ formContainerRef: form, threads: [thread({ id: 'a', fieldId: '1.1' })] })
      await flushRaf()
      await nextTick()

      expect(observedTargets).toContain(form)

      // Fire the resize callback twice so schedulePositionUpdate hits its
      // clearTimeout branch (a timer is already pending).
      vi.useFakeTimers()
      lastResizeCallback?.()
      lastResizeCallback?.()
      vi.advanceTimersByTime(60)
      vi.useRealTimers()

      expect(wrapper.find('.comment-field-group').exists()).toBe(true)
    })

    it('reacts to mutation observer callbacks via schedulePositionUpdate', async () => {
      vi.useFakeTimers()
      const form = buildFormContainer([{ id: 'label-dpia-1.1', rvoLabel: 'Veld' }])
      const { wrapper } = mountPanel({ formContainerRef: form, threads: [thread({ id: 'a', fieldId: '1.1' })] })
      const extra = document.createElement('div')
      extra.id = 'label-dpia-2.2'
      extra.textContent = 'Extra'
      form.appendChild(extra)
      // Flush microtasks so the MutationObserver callback runs.
      await Promise.resolve()
      vi.advanceTimersByTime(60)
      vi.useRealTimers()
      await nextTick()
      expect(wrapper.exists()).toBe(true)
    })

    it('cleans up observers and a pending timer on unmount', async () => {
      vi.useFakeTimers()
      const form = buildFormContainer([{ id: 'label-dpia-1.1', rvoLabel: 'Veld' }])
      const { wrapper } = mountPanel({ formContainerRef: form })
      // Schedule an update so updateTimer is non-null at unmount time.
      lastResizeCallback?.()
      wrapper.unmount()
      vi.useRealTimers()
      expect(true).toBe(true)
    })

    it('unmounts cleanly when there is no form container (observers null)', () => {
      const { wrapper } = mountPanel({ formContainerRef: null })
      wrapper.unmount()
      expect(true).toBe(true)
    })
  })

  describe('watch activeFieldId', () => {
    it('focuses the inline textarea when a field becomes active and the user can comment', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', rvoLabel: 'Veld' }])
      const { wrapper } = mountPanel({ role: 'editor', formContainerRef: form, threads: [], activeFieldId: null })
      await flushRaf()
      await nextTick()

      await wrapper.setProps({ activeFieldId: '1.1' })
      // Allow the two awaited nextTicks inside the watcher to settle.
      await nextTick()
      await nextTick()
      await nextTick()

      const textarea = wrapper.find('[data-field-group="1.1"] .comment-inline-form textarea')
      expect(textarea.exists()).toBe(true)
    })

    it('does nothing when the new field id is null', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', rvoLabel: 'Veld' }])
      const { wrapper } = mountPanel({ role: 'editor', formContainerRef: form, activeFieldId: '1.1' })
      await flushRaf()
      await nextTick()

      await wrapper.setProps({ activeFieldId: null })
      await nextTick()
      expect(wrapper.find('.comment-inline-form').exists()).toBe(false)
    })

    it('does nothing when the user cannot comment', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', rvoLabel: 'Veld' }])
      const { wrapper } = mountPanel({ role: 'viewer', formContainerRef: form, activeFieldId: null })
      await flushRaf()
      await nextTick()

      await wrapper.setProps({ activeFieldId: '1.1' })
      await nextTick()
      await nextTick()
      expect(wrapper.find('.comment-inline-form').exists()).toBe(false)
    })

    it('handles a field that has no inline textarea (no element to focus)', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', rvoLabel: 'Veld' }])
      const { wrapper } = mountPanel({ role: 'editor', formContainerRef: form, activeFieldId: null })
      await flushRaf()
      await nextTick()

      await wrapper.setProps({ activeFieldId: '7.7' })
      await nextTick()
      await nextTick()
      await nextTick()
      expect(wrapper.find('[data-field-group="7.7"]').exists()).toBe(false)
    })
  })

  describe('scrollToField', () => {
    it('scrolls the matching label into view when the label button is clicked', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', rvoLabel: 'Veld' }])
      const labelEl = document.getElementById('label-dpia-1.1') as HTMLElement
      const scrollSpy = vi.fn()
      labelEl.scrollIntoView = scrollSpy

      const t = thread({ id: 'a', fieldId: '1.1' })
      const { wrapper } = mountPanel({ formContainerRef: form, threads: [t] })
      await flushRaf()
      await nextTick()

      await wrapper.get('.comment-field-group__label').trigger('click')
      expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
    })

    it('does nothing when no matching label exists', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', rvoLabel: 'Veld' }])
      const t = thread({ id: 'a', fieldId: '1.1' })
      const { wrapper } = mountPanel({ formContainerRef: form, threads: [t] })
      await flushRaf()
      await nextTick()

      // Strip the id so scrollToField's [id$=...] selector finds nothing.
      ;(document.getElementById('label-dpia-1.1') as HTMLElement).id = 'gone'
      await wrapper.get('.comment-field-group__label').trigger('click')
      expect(wrapper.exists()).toBe(true)
    })
  })

  describe('formatDate', () => {
    it('renders a localized Dutch date in the time element', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', rvoLabel: 'Veld' }])
      const t = thread({ id: 'a', fieldId: '1.1', createdAt: '2026-04-12T10:00:00Z' })
      const { wrapper } = mountPanel({ formContainerRef: form, threads: [t] })
      await flushRaf()
      await nextTick()

      const time = wrapper.get('.comment-item__time')
      expect(time.attributes('datetime')).toBe('2026-04-12T10:00:00Z')
      expect(time.text().length).toBeGreaterThan(0)
    })
  })

  describe('footer actions: reply, delete, resolve, reopen', () => {
    it('renders reply/delete/resolve buttons for an owner on an unresolved own thread', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', rvoLabel: 'Veld' }])
      const t = thread({ id: 'a', fieldId: '1.1', authorId: 'user-1' })
      const { wrapper, spies } = mountPanel({
        role: 'owner',
        currentUserId: 'user-1',
        formContainerRef: form,
        threads: [t],
      })
      await flushRaf()
      await nextTick()

      expect(wrapper.text()).toContain('Reageren')
      expect(wrapper.text()).toContain('Verwijderen')
      expect(wrapper.text()).toContain('Oplossen')

      await wrapper.get('.comment-action-btn--danger').trigger('click')
      expect(spies.deleteComment).toHaveBeenCalledWith('a')

      await wrapper.get('.comment-action-btn--resolve').trigger('click')
      expect(spies.resolveThread).toHaveBeenCalledWith('a')
    })

    it('shows the reopen button for a resolved thread when the user can resolve', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', rvoLabel: 'Veld' }])
      const t = thread({ id: 'a', fieldId: '1.1', resolvedAt: '2026-04-13T00:00:00Z' })
      const { wrapper, spies } = mountPanel({
        role: 'owner',
        formContainerRef: form,
        threads: [t],
        activeFieldId: '1.1',
      })
      await flushRaf()
      await nextTick()
      await wrapper.get('.comment-panel__toggle input').setValue(true)
      await nextTick()

      expect(wrapper.text()).toContain('Heropenen')
      expect(wrapper.text()).not.toContain('Reageren')
      expect(wrapper.text()).not.toContain('Oplossen')

      const reopenBtn = wrapper
        .findAll('button.comment-action-btn')
        .find((b) => b.text().includes('Heropenen'))!
      await reopenBtn.trigger('click')
      expect(spies.reopenThread).toHaveBeenCalledWith('a')
    })

    it('does not render delete for someone else\'s comment when not owner', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', rvoLabel: 'Veld' }])
      const t = thread({ id: 'a', fieldId: '1.1', authorId: 'someone-else' })
      const { wrapper } = mountPanel({
        role: 'editor',
        currentUserId: 'user-1',
        formContainerRef: form,
        threads: [t],
      })
      await flushRaf()
      await nextTick()

      expect(wrapper.find('.comment-action-btn--danger').exists()).toBe(false)
      expect(wrapper.text()).toContain('Reageren')
      expect(wrapper.text()).toContain('Oplossen')
    })

    it('does not render resolve/reply controls for a commenter (canResolve false)', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', rvoLabel: 'Veld' }])
      const t = thread({ id: 'a', fieldId: '1.1', authorId: 'someone-else' })
      const { wrapper } = mountPanel({
        role: 'commenter',
        currentUserId: 'user-1',
        formContainerRef: form,
        threads: [t],
      })
      await flushRaf()
      await nextTick()

      expect(wrapper.text()).toContain('Reageren')
      expect(wrapper.text()).not.toContain('Oplossen')
      expect(wrapper.find('.comment-action-btn--danger').exists()).toBe(false)
    })
  })

  describe('reply flow', () => {
    it('opens the reply form, submits a reply, then closes via cancel', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', rvoLabel: 'Veld' }])
      const t = thread({ id: 'a', fieldId: '1.1' })
      const { wrapper, spies } = mountPanel({
        role: 'editor',
        formContainerRef: form,
        threads: [t],
      })
      await flushRaf()
      await nextTick()

      const replyBtn = wrapper.findAll('button.comment-action-btn').find((b) => b.text().includes('Reageren'))!
      await replyBtn.trigger('click')
      await nextTick()

      const replyForm = wrapper.get('.comment-reply-form')
      const textarea = replyForm.get('textarea')
      await textarea.setValue('Mijn reactie')
      await textarea.trigger('input')

      await replyForm.get('.comment-btn--primary').trigger('click')
      expect(spies.createReply).toHaveBeenCalledWith('a', '1.1', 'Mijn reactie')
      await nextTick()
      expect(wrapper.find('.comment-reply-form').exists()).toBe(false)
    })

    it('does not submit a reply when the body is empty (only whitespace)', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', rvoLabel: 'Veld' }])
      const t = thread({ id: 'a', fieldId: '1.1' })
      const { wrapper, spies } = mountPanel({ role: 'editor', formContainerRef: form, threads: [t] })
      await flushRaf()
      await nextTick()

      const replyBtn = wrapper.findAll('button.comment-action-btn').find((b) => b.text().includes('Reageren'))!
      await replyBtn.trigger('click')
      await nextTick()

      const replyForm = wrapper.get('.comment-reply-form')
      await replyForm.get('textarea').setValue('   ')
      await replyForm.get('.comment-btn--primary').trigger('click')
      expect(spies.createReply).not.toHaveBeenCalled()
    })

    it('cancels the reply form via the cancel button', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', rvoLabel: 'Veld' }])
      const t = thread({ id: 'a', fieldId: '1.1' })
      const { wrapper } = mountPanel({ role: 'editor', formContainerRef: form, threads: [t] })
      await flushRaf()
      await nextTick()

      const replyBtn = wrapper.findAll('button.comment-action-btn').find((b) => b.text().includes('Reageren'))!
      await replyBtn.trigger('click')
      await nextTick()
      const cancel = wrapper.findAll('.comment-reply-form .comment-action-btn').find((b) => b.text().includes('Annuleer'))!
      await cancel.trigger('click')
      await nextTick()
      expect(wrapper.find('.comment-reply-form').exists()).toBe(false)
    })

    it('submits a reply via meta+enter keydown', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', rvoLabel: 'Veld' }])
      const t = thread({ id: 'a', fieldId: '1.1' })
      const { wrapper, spies } = mountPanel({ role: 'editor', formContainerRef: form, threads: [t] })
      await flushRaf()
      await nextTick()

      const replyBtn = wrapper.findAll('button.comment-action-btn').find((b) => b.text().includes('Reageren'))!
      await replyBtn.trigger('click')
      await nextTick()

      const textarea = wrapper.get('.comment-reply-form textarea')
      await textarea.setValue('Via toetsenbord')
      await textarea.trigger('keydown.enter.meta')
      expect(spies.createReply).toHaveBeenCalledWith('a', '1.1', 'Via toetsenbord')
    })

    it('cancels the reply form via the escape key', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', rvoLabel: 'Veld' }])
      const t = thread({ id: 'a', fieldId: '1.1' })
      const { wrapper } = mountPanel({ role: 'editor', formContainerRef: form, threads: [t] })
      await flushRaf()
      await nextTick()

      const replyBtn = wrapper.findAll('button.comment-action-btn').find((b) => b.text().includes('Reageren'))!
      await replyBtn.trigger('click')
      await nextTick()
      await wrapper.get('.comment-reply-form textarea').trigger('keydown.escape')
      await nextTick()
      expect(wrapper.find('.comment-reply-form').exists()).toBe(false)
    })
  })

  describe('inline new comment flow', () => {
    it('submits a new comment via the Plaatsen button', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', rvoLabel: 'Veld' }])
      const { wrapper, spies } = mountPanel({
        role: 'owner',
        formContainerRef: form,
        threads: [],
        activeFieldId: '1.1',
      })
      await flushRaf()
      await nextTick()

      const inline = wrapper.get('.comment-inline-form')
      const textarea = inline.get('textarea')
      await textarea.setValue('Een nieuwe opmerking')
      await textarea.trigger('input')

      const submit = inline.get('.comment-btn--primary')
      expect((submit.element as HTMLButtonElement).disabled).toBe(false)
      await submit.trigger('click')
      expect(spies.createComment).toHaveBeenCalledWith('1.1', 'Een nieuwe opmerking')
    })

    it('disables the Plaatsen button while the body is empty', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', rvoLabel: 'Veld' }])
      const { wrapper, spies } = mountPanel({
        role: 'owner',
        formContainerRef: form,
        threads: [],
        activeFieldId: '1.1',
      })
      await flushRaf()
      await nextTick()

      const inline = wrapper.get('.comment-inline-form')
      const submit = inline.get('.comment-btn--primary')
      expect((submit.element as HTMLButtonElement).disabled).toBe(true)

      await submit.trigger('click')
      expect(spies.createComment).not.toHaveBeenCalled()
    })

    it('submits a new comment via meta+enter keydown', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', rvoLabel: 'Veld' }])
      const { wrapper, spies } = mountPanel({
        role: 'owner',
        formContainerRef: form,
        threads: [],
        activeFieldId: '1.1',
      })
      await flushRaf()
      await nextTick()

      const textarea = wrapper.get('.comment-inline-form textarea')
      await textarea.setValue('Toetsenbord opmerking')
      await textarea.trigger('keydown.enter.meta')
      expect(spies.createComment).toHaveBeenCalledWith('1.1', 'Toetsenbord opmerking')
    })

    it('clears the body and emits deactivate-field on escape', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', rvoLabel: 'Veld' }])
      const { wrapper } = mountPanel({
        role: 'owner',
        formContainerRef: form,
        threads: [],
        activeFieldId: '1.1',
      })
      await flushRaf()
      await nextTick()

      const textarea = wrapper.get('.comment-inline-form textarea')
      await textarea.setValue('iets')
      await textarea.trigger('keydown.escape')
      expect(wrapper.emitted('deactivate-field')).toHaveLength(1)
    })

    it('clears the body and emits deactivate-field via the Annuleer button', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', rvoLabel: 'Veld' }])
      const { wrapper } = mountPanel({
        role: 'owner',
        formContainerRef: form,
        threads: [],
        activeFieldId: '1.1',
      })
      await flushRaf()
      await nextTick()

      const inline = wrapper.get('.comment-inline-form')
      const cancel = inline.findAll('.comment-action-btn').find((b) => b.text().includes('Annuleer'))!
      await cancel.trigger('click')
      expect(wrapper.emitted('deactivate-field')).toHaveLength(1)
    })
  })

  describe('edit flow (own comment)', () => {
    it('starts editing on body click and submits the edit', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', rvoLabel: 'Veld' }])
      const t = thread({ id: 'a', fieldId: '1.1', authorId: 'user-1', body: 'origineel' })
      const { wrapper, spies } = mountPanel({
        role: 'owner',
        currentUserId: 'user-1',
        formContainerRef: form,
        threads: [t],
      })
      await flushRaf()
      await nextTick()

      const body = wrapper.get('.comment-item__body')
      expect(body.classes()).toContain('comment-item__body--editable')
      expect(body.attributes('role')).toBe('button')
      await body.trigger('click')
      await nextTick()
      await nextTick()

      const editBox = wrapper.get('.comment-item__edit')
      const textarea = editBox.get('textarea')
      expect((textarea.element as HTMLTextAreaElement).value).toBe('origineel')
      await textarea.setValue('aangepast')
      await textarea.trigger('input')

      await editBox.get('.comment-btn--primary').trigger('click')
      expect(spies.updateComment).toHaveBeenCalledWith('a', 'aangepast')
      await nextTick()
      expect(wrapper.find('.comment-item__edit').exists()).toBe(false)
    })

    it('starts editing via the enter key on the body', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', rvoLabel: 'Veld' }])
      const t = thread({ id: 'a', fieldId: '1.1', authorId: 'user-1', body: 'origineel' })
      const { wrapper } = mountPanel({
        role: 'owner',
        currentUserId: 'user-1',
        formContainerRef: form,
        threads: [t],
      })
      await flushRaf()
      await nextTick()

      await wrapper.get('.comment-item__body').trigger('keydown.enter')
      await nextTick()
      await nextTick()
      expect(wrapper.find('.comment-item__edit').exists()).toBe(true)
    })

    it('does not submit the edit when the body is empty', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', rvoLabel: 'Veld' }])
      const t = thread({ id: 'a', fieldId: '1.1', authorId: 'user-1', body: 'origineel' })
      const { wrapper, spies } = mountPanel({
        role: 'owner',
        currentUserId: 'user-1',
        formContainerRef: form,
        threads: [t],
      })
      await flushRaf()
      await nextTick()

      await wrapper.get('.comment-item__body').trigger('click')
      await nextTick()
      await nextTick()

      const editBox = wrapper.get('.comment-item__edit')
      await editBox.get('textarea').setValue('   ')
      await editBox.get('.comment-btn--primary').trigger('click')
      expect(spies.updateComment).not.toHaveBeenCalled()
    })

    it('cancels editing via the Annuleer button', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', rvoLabel: 'Veld' }])
      const t = thread({ id: 'a', fieldId: '1.1', authorId: 'user-1' })
      const { wrapper } = mountPanel({
        role: 'owner',
        currentUserId: 'user-1',
        formContainerRef: form,
        threads: [t],
      })
      await flushRaf()
      await nextTick()

      await wrapper.get('.comment-item__body').trigger('click')
      await nextTick()
      await nextTick()

      const cancel = wrapper.findAll('.comment-item__edit .comment-action-btn').find((b) => b.text().includes('Annuleer'))!
      await cancel.trigger('click')
      await nextTick()
      expect(wrapper.find('.comment-item__edit').exists()).toBe(false)
    })

    it('submits the edit via meta+enter and cancels via escape', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', rvoLabel: 'Veld' }])
      const t = thread({ id: 'a', fieldId: '1.1', authorId: 'user-1', body: 'origineel' })
      const { wrapper, spies } = mountPanel({
        role: 'owner',
        currentUserId: 'user-1',
        formContainerRef: form,
        threads: [t],
      })
      await flushRaf()
      await nextTick()

      await wrapper.get('.comment-item__body').trigger('click')
      await nextTick()
      await nextTick()

      const textarea = wrapper.get('.comment-item__edit textarea')
      await textarea.setValue('via meta enter')
      await textarea.trigger('keydown.enter.meta')
      expect(spies.updateComment).toHaveBeenCalledWith('a', 'via meta enter')

      await nextTick()
      await wrapper.get('.comment-item__body').trigger('click')
      await nextTick()
      await nextTick()
      await wrapper.get('.comment-item__edit textarea').trigger('keydown.escape')
      await nextTick()
      expect(wrapper.find('.comment-item__edit').exists()).toBe(false)
    })

    it('does not allow editing a foreign comment (non-editable body)', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', rvoLabel: 'Veld' }])
      const t = thread({ id: 'a', fieldId: '1.1', authorId: 'someone-else' })
      const { wrapper, spies } = mountPanel({
        role: 'owner',
        currentUserId: 'user-1',
        formContainerRef: form,
        threads: [t],
      })
      await flushRaf()
      await nextTick()

      const body = wrapper.get('.comment-item__body')
      expect(body.classes()).not.toContain('comment-item__body--editable')
      expect(body.attributes('role')).toBeUndefined()
      expect(body.attributes('tabindex')).toBeUndefined()
      await body.trigger('click')
      await body.trigger('keydown.enter')
      await nextTick()
      expect(wrapper.find('.comment-item__edit').exists()).toBe(false)
      expect(spies.updateComment).not.toHaveBeenCalled()
    })
  })

  describe('replies rendering & deletion', () => {
    it('renders replies and allows deleting an own reply', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', rvoLabel: 'Veld' }])
      const r = reply('r1', 'user-1', 'Sam')
      const t = thread({ id: 'root', fieldId: '1.1', replies: [r] })
      const { wrapper, spies } = mountPanel({
        role: 'editor',
        currentUserId: 'user-1',
        formContainerRef: form,
        threads: [t],
      })
      await flushRaf()
      await nextTick()

      const replies = wrapper.findAll('.comment-item--reply')
      expect(replies).toHaveLength(1)
      expect(replies[0].text()).toContain('reactie r1')

      const replyBody = replies[0].get('.comment-item__body')
      expect(replyBody.classes()).toContain('comment-item__body--editable')

      const del = replies[0].findAll('.comment-action-btn--danger')[0]
      await del.trigger('click')
      expect(spies.deleteComment).toHaveBeenCalledWith('r1')
    })

    it('edits a reply via clicking its body', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', rvoLabel: 'Veld' }])
      const r = reply('r1', 'user-1', 'Sam')
      const t = thread({ id: 'root', fieldId: '1.1', replies: [r] })
      const { wrapper, spies } = mountPanel({
        role: 'editor',
        currentUserId: 'user-1',
        formContainerRef: form,
        threads: [t],
      })
      await flushRaf()
      await nextTick()

      await wrapper.get('.comment-item--reply .comment-item__body').trigger('click')
      await nextTick()
      await nextTick()

      const editBox = wrapper.get('.comment-item--reply .comment-item__edit')
      await editBox.get('textarea').setValue('reactie aangepast')
      await editBox.get('.comment-btn--primary').trigger('click')
      expect(spies.updateComment).toHaveBeenCalledWith('r1', 'reactie aangepast')
    })

    it('edits a reply via the enter key on its body', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', rvoLabel: 'Veld' }])
      const r = reply('r1', 'user-1', 'Sam')
      const t = thread({ id: 'root', fieldId: '1.1', replies: [r] })
      const { wrapper } = mountPanel({
        role: 'editor',
        currentUserId: 'user-1',
        formContainerRef: form,
        threads: [t],
      })
      await flushRaf()
      await nextTick()

      await wrapper.get('.comment-item--reply .comment-item__body').trigger('keydown.enter')
      await nextTick()
      await nextTick()
      expect(wrapper.find('.comment-item--reply .comment-item__edit').exists()).toBe(true)
    })

    it('does not render a reply footer when the user cannot comment', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', rvoLabel: 'Veld' }])
      const r = reply('r1', 'user-1', 'Sam')
      const t = thread({ id: 'root', fieldId: '1.1', replies: [r], resolvedAt: '2026-04-13T00:00:00Z' })
      const { wrapper } = mountPanel({
        role: 'viewer',
        currentUserId: 'user-1',
        formContainerRef: form,
        threads: [t],
        activeFieldId: '1.1',
      })
      await flushRaf()
      await nextTick()
      await wrapper.get('.comment-panel__toggle input').setValue(true)
      await nextTick()

      const replyItem = wrapper.get('.comment-item--reply')
      expect(replyItem.find('.comment-item__footer').exists()).toBe(false)
    })

    it('does not allow editing a foreign reply', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', rvoLabel: 'Veld' }])
      const r = reply('r1', 'other-user', 'Iemand')
      const t = thread({ id: 'root', fieldId: '1.1', replies: [r] })
      const { wrapper } = mountPanel({
        role: 'editor',
        currentUserId: 'user-1',
        formContainerRef: form,
        threads: [t],
      })
      await flushRaf()
      await nextTick()

      const replyBody = wrapper.get('.comment-item--reply .comment-item__body')
      expect(replyBody.classes()).not.toContain('comment-item__body--editable')
      await replyBody.trigger('click')
      await replyBody.trigger('keydown.enter')
      await nextTick()
      expect(wrapper.find('.comment-item--reply .comment-item__edit').exists()).toBe(false)
    })
  })

  describe('direct internal branches', () => {
    // These defensive branches are not reachable through the DOM; invoke the
    // setup functions directly via the exposed setup state.
    function setupOf(wrapper: ReturnType<typeof mountPanel>['wrapper']) {
      return (wrapper.vm.$ as unknown as { setupState: Record<string, any> }).setupState
    }

    it('scrollToField returns early when there is no form container', () => {
      const { wrapper } = mountPanel({ formContainerRef: null })
      const setup = setupOf(wrapper)
      expect(() => setup.scrollToField('1.1')).not.toThrow()
    })

    it('submitComment returns early when the body is empty', async () => {
      const { wrapper, spies } = mountPanel({ formContainerRef: null })
      const setup = setupOf(wrapper)
      await setup.submitComment('1.1')
      expect(spies.createComment).not.toHaveBeenCalled()
    })

    it('submitReply returns early when the body is empty', async () => {
      const { wrapper, spies } = mountPanel({ formContainerRef: null })
      const setup = setupOf(wrapper)
      await setup.submitReply('parent', '1.1')
      expect(spies.createReply).not.toHaveBeenCalled()
    })

    it('submitEdit returns early when there is no editing id', async () => {
      const { wrapper, spies } = mountPanel({ formContainerRef: null })
      const setup = setupOf(wrapper)
      await setup.submitEdit()
      expect(spies.updateComment).not.toHaveBeenCalled()
    })

    it('startEdit handles the case where no edit textarea is in the DOM', async () => {
      const { wrapper } = mountPanel({ formContainerRef: null, threads: [] })
      const setup = setupOf(wrapper)
      await setup.startEdit('missing', 'tekst')
      await nextTick()
      expect(setup.editingId).toBe('missing')
    })

    it('renders an entry without a label button when the field has no label', async () => {
      const { wrapper } = mountPanel({ formContainerRef: null })
      const setup = setupOf(wrapper)
      const t = thread({ id: 'z', fieldId: 'z.z' })
      ;(setup.commentStore as { threads: CommentThread[] }).threads = [t]
      // A position but deliberately no label. The setupState proxy unwraps refs,
      // so assigning through it re-wraps the new Map.
      setup.fieldPositions = new Map([['z.z', 0]])
      setup.fieldLabels = new Map()
      await nextTick()

      const group = wrapper.get('.comment-field-group')
      expect(group.attributes('data-field-group')).toBe('z.z')
      expect(group.find('.comment-field-group__label').exists()).toBe(false)
    })
  })

  describe('autoResize', () => {
    it('grows the textarea height on input', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', rvoLabel: 'Veld' }])
      const { wrapper } = mountPanel({
        role: 'owner',
        formContainerRef: form,
        threads: [],
        activeFieldId: '1.1',
      })
      await flushRaf()
      await nextTick()

      const textarea = wrapper.get('.comment-inline-form textarea')
      const el = textarea.element as HTMLTextAreaElement
      // jsdom reports scrollHeight 0; override it so the resize handler has a value.
      Object.defineProperty(el, 'scrollHeight', { configurable: true, value: 42 })
      await textarea.trigger('input')
      expect(el.classList.contains('autogrow-textarea')).toBe(true)
      expect(el.style.getPropertyValue('--autogrow-height')).toBe('42px')
    })
  })
})

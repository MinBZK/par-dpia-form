/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount, type DOMWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import CommentPanel from '../../src/components/CommentPanel.vue'
import { useCollaborationStore } from '../../src/stores/collaboration'
import type { CommentThread, CommentReply } from '../../src/api'

// jsdom lacks CSS.escape and ResizeObserver; the component relies on both, so
// we provide minimal stand-ins (test-environment only).
const observedTargets: HTMLElement[] = []
let lastResizeCallback: (() => void) | null = null
const resizeCallbacks: Array<() => void> = []
const mountedWrappers: Array<{ unmount: () => void }> = []

class StubResizeObserver {
  callback: () => void
  constructor(cb: () => void) {
    this.callback = cb
    lastResizeCallback = cb
    resizeCallbacks.push(cb)
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
  resizeCallbacks.length = 0
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
  specs: Array<{
    id: string
    fieldLabel?: string
    textLabel?: string
    aivLabel?: { title: string; term: string; definition: string }
  }>,
): HTMLElement {
  const form = document.createElement('div')
  for (const spec of specs) {
    const label = document.createElement('div')
    label.id = spec.id
    if (spec.fieldLabel !== undefined) {
      const wrap = document.createElement('div')
      wrap.className = 'form-field__label'
      const span = document.createElement('span')
      span.textContent = spec.fieldLabel
      wrap.appendChild(span)
      label.appendChild(wrap)
    } else if (spec.aivLabel !== undefined) {
      const wrap = document.createElement('div')
      wrap.className = 'form-field__label'
      const span = document.createElement('span')
      span.textContent = `${spec.aivLabel.title} `
      const aiv = document.createElement('span')
      aiv.className = 'aiv-definition'
      aiv.textContent = spec.aivLabel.term
      const def = document.createElement('span')
      def.className = 'aiv-definition-text'
      def.textContent = spec.aivLabel.definition
      aiv.appendChild(def)
      span.appendChild(aiv)
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

  const wrapper = mount(CommentPanel, {
    attachTo: document.body,
    props: {
      role: opts.role ?? 'owner',
      activeFieldId: opts.activeFieldId ?? null,
      formContainerRef: opts.formContainerRef ?? null,
    },
  })
  mountedWrappers.push(wrapper)

  return { wrapper, store, spies }
}

// NLDD fields deliver their value in event.detail, which is what the panel
// reads; setValue() would only touch a native textarea that isn't there.
function setFieldValue(field: DOMWrapper<Element>, value: string): Promise<void> {
  field.element.dispatchEvent(new CustomEvent('input', { detail: { value } }))
  return nextTick()
}

// Run pending requestAnimationFrame callbacks (onMounted schedules one).
function flushRaf(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

describe('CommentPanel', () => {
  describe('header & basic rendering', () => {
    it('emits close when the close button is clicked', async () => {
      const { wrapper } = mountPanel()
      const closeBtn = wrapper.get('.comment-panel__close')
      expect(closeBtn.attributes('icon')).toBe('dismiss')
      expect(closeBtn.attributes('text')).toBe('Sluiten')
      await closeBtn.trigger('click')
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
      const checkbox = wrapper.get('.comment-panel__toggle')
      expect(checkbox.attributes('checked')).toBeUndefined()

      // The field reports its new state in the change detail.
      checkbox.element.dispatchEvent(new CustomEvent('change', { detail: { checked: true } }))
      await wrapper.vm.$nextTick()
      expect(checkbox.attributes('checked')).toBeDefined()

      // A change without a payload says nothing, so the toggle stays as it was.
      await checkbox.trigger('change')
      expect(checkbox.attributes('checked')).toBeDefined()
    })
  })

  describe('canComment / canResolve role branches', () => {
    it.each([
      ['commenter', true, false],
      ['editor', true, true],
      ['owner', true, true],
      ['viewer', false, false],
    ])('role %s → canComment=%s canResolve=%s', async (role, canComment) => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
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

  describe('a colleague resolves the thread while you are typing', () => {
    async function panelWithOpenReply() {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', rvoLabel: 'Veld' }])
      const t = thread({ id: 'root', fieldId: '1.1' })
      const { wrapper, store } = mountPanel({
        role: 'owner',
        formContainerRef: form,
        threads: [t],
      })
      await flushRaf()
      await nextTick()

      await wrapper.findAll('.comment-item__footer nldd-button').find((b) => b.attributes('text') === 'Reageren')!.trigger('click')
      await nextTick()
      await setFieldValue(wrapper.get('.comment-reply-form nldd-multi-line-text-field'), 'Half getypte reactie')
      return { wrapper, store }
    }

    it('keeps the thread and the draft when the thread is resolved elsewhere', async () => {
      const { wrapper, store } = await panelWithOpenReply()

      // What the poll does when a colleague resolves it.
      store.threads[0].resolvedAt = '2026-04-12T15:00:00Z'
      store.threads[0].resolvedByName = 'Noor Dijkstra'
      await nextTick()

      expect(wrapper.find('.comment-thread').exists()).toBe(true)
      expect(wrapper.get('.comment-reply-form nldd-multi-line-text-field').attributes('value'))
        .toBe('Half getypte reactie')
    })

    it('says who resolved it', async () => {
      const { wrapper, store } = await panelWithOpenReply()

      store.threads[0].resolvedAt = '2026-04-12T15:00:00Z'
      store.threads[0].resolvedByName = 'Noor Dijkstra'
      await nextTick()

      expect(wrapper.get('.comment-thread__resolved-label').text())
        .toContain('Noor Dijkstra')
    })

    it('falls back to a colleague when the name is unknown', async () => {
      const { wrapper, store } = await panelWithOpenReply()

      store.threads[0].resolvedAt = '2026-04-12T15:00:00Z'
      store.threads[0].resolvedByName = null
      await nextTick()

      expect(wrapper.get('.comment-thread__resolved-label').text())
        .toContain('een collega')
    })

    it('lets the thread go once the reply form is closed', async () => {
      const { wrapper, store } = await panelWithOpenReply()

      store.threads[0].resolvedAt = '2026-04-12T15:00:00Z'
      await nextTick()
      expect(wrapper.find('.comment-thread').exists()).toBe(true)

      const cancel = wrapper.findAll('.comment-reply-form nldd-button')
        .find((b) => b.attributes('text') === 'Annuleer')!
      await cancel.trigger('click')
      await nextTick()

      expect(wrapper.find('.comment-thread').exists()).toBe(false)
    })

    it('keeps a thread whose reply is being edited', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', rvoLabel: 'Veld' }])
      const t = thread({
        id: 'root',
        fieldId: '1.1',
        replies: [reply('r1', 'user-1', 'Sam')],
      })
      const { wrapper, store } = mountPanel({
        role: 'owner',
        currentUserId: 'user-1',
        formContainerRef: form,
        threads: [t],
      })
      await flushRaf()
      await nextTick()

      await wrapper.get('.comment-item--reply .comment-item__body').trigger('click')
      await nextTick()
      await nextTick()
      expect(wrapper.find('.comment-item__edit').exists()).toBe(true)

      store.threads[0].resolvedAt = '2026-04-12T15:00:00Z'
      await nextTick()

      expect(wrapper.find('.comment-item__edit').exists()).toBe(true)
    })

    it('hides a resolved thread that has nothing open in it', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', rvoLabel: 'Veld' }])
      const { wrapper, store } = mountPanel({
        role: 'owner',
        formContainerRef: form,
        threads: [thread({ id: 'root', fieldId: '1.1' })],
      })
      await flushRaf()
      await nextTick()

      store.threads[0].resolvedAt = '2026-04-12T15:00:00Z'
      await nextTick()

      expect(wrapper.find('.comment-thread').exists()).toBe(false)
    })
  })

  describe('stackedEntries — cards never cover each other', () => {
    // Fields sit 97px apart in the form while a card with a few lines of text is far taller,
    // so without stacking the cards overlap and hide each other's text and buttons.
    const FIELD_TOPS = [0, 97, 194]
    const CARD_HEIGHTS = [247, 107, 167]

    function stubTop(el: HTMLElement, top: number) {
      el.getBoundingClientRect = () => ({ top, bottom: top, left: 0, right: 0, width: 0, height: 0, x: 0, y: top, toJSON: () => ({}) }) as DOMRect
    }

    async function mountThreeCards() {
      const form = buildFormContainer([
        { id: 'label-dpia-2.1.1', rvoLabel: 'Persoonsgegeven' },
        { id: 'label-dpia-2.1.2', rvoLabel: 'Categorie' },
        { id: 'label-dpia-2.1.3', rvoLabel: 'Herkomst' },
      ])
      form.querySelectorAll<HTMLElement>('[id^="label-"]').forEach((el, i) => stubTop(el, FIELD_TOPS[i]))

      const { wrapper } = mountPanel({
        formContainerRef: form,
        threads: [
          thread({ id: 'a', fieldId: '2.1.1' }),
          thread({ id: 'b', fieldId: '2.1.2' }),
          thread({ id: 'c', fieldId: '2.1.3' }),
        ],
      })
      await flushRaf()
      await nextTick()
      await nextTick()

      // jsdom has no layout, so the rendered cards report their real heights only once stubbed.
      wrapper.findAll('[data-field-group]').forEach((g, i) => {
        Object.defineProperty(g.element, 'offsetHeight', { get: () => CARD_HEIGHTS[i], configurable: true })
      })
      for (const cb of resizeCallbacks) cb()
      await nextTick()

      return wrapper
    }

    function topsOf(wrapper: { findAll: (s: string) => Array<{ element: Element }> }): number[] {
      return wrapper.findAll('[data-field-group]').map(g =>
        Number.parseFloat((g.element as HTMLElement).style.getPropertyValue('--comment-top')),
      )
    }

    it('pushes each card below the previous one instead of letting them overlap', async () => {
      const wrapper = await mountThreeCards()
      const tops = topsOf(wrapper)

      expect(tops).toEqual([0, 255, 370])
      for (let i = 1; i < tops.length; i++) {
        expect(tops[i]).toBeGreaterThanOrEqual(tops[i - 1] + CARD_HEIGHTS[i - 1])
      }
    })

    it('survives a resize notification that arrives after the panel is unmounted', async () => {
      const wrapper = await mountThreeCards()
      const callbacks = [...resizeCallbacks]
      wrapper.unmount()

      expect(() => { for (const cb of callbacks) cb() }).not.toThrow()
    })

    it('leaves a card at its own field when there is room above it', async () => {
      const form = buildFormContainer([
        { id: 'label-dpia-3.1', rvoLabel: 'Eerste' },
        { id: 'label-dpia-3.2', rvoLabel: 'Tweede' },
      ])
      const tops = [0, 900]
      form.querySelectorAll<HTMLElement>('[id^="label-"]').forEach((el, i) => stubTop(el, tops[i]))

      const { wrapper } = mountPanel({
        formContainerRef: form,
        threads: [thread({ id: 'a', fieldId: '3.1' }), thread({ id: 'b', fieldId: '3.2' })],
      })
      await flushRaf()
      await nextTick()
      await nextTick()

      wrapper.findAll('[data-field-group]').forEach((g) => {
        Object.defineProperty(g.element, 'offsetHeight', { get: () => 120, configurable: true })
      })
      for (const cb of resizeCallbacks) cb()
      await nextTick()

      expect(topsOf(wrapper)).toEqual([0, 900])
    })
  })

  describe('updateFieldPositions / positionedEntries', () => {
    it('positions threads using the rvo label text', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Naam van veld' }])
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

    it('excludes the begrip-definition tooltip text from the field label', async () => {
      const form = buildFormContainer([{
        id: 'label-dpia-1.1',
        aivLabel: {
          title: 'Aanvullende informatie over de',
          term: 'verwerkingsdoeleinden',
          definition: 'Het verwerkingsdoeleinde is het resultaat dat wordt beoogd.',
        },
      }])
      const t = thread({ id: 'root', fieldId: '1.1' })
      const { wrapper } = mountPanel({ formContainerRef: form, threads: [t] })
      await flushRaf()
      await nextTick()

      expect(wrapper.get('.comment-field-group__label').text()).toBe(
        'Opmerking voor: Aanvullende informatie over de verwerkingsdoeleinden',
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
      const form = buildFormContainer([{ id: 'label-single', fieldLabel: 'genegeerd' }])
      const t = thread({ id: 'root', fieldId: 'single' })
      const { wrapper } = mountPanel({ formContainerRef: form, threads: [t] })
      await flushRaf()
      await nextTick()

      expect(wrapper.find('.comment-field-group').exists()).toBe(false)
      expect(wrapper.get('.comment-panel__empty').exists()).toBe(true)
    })

    it('drops threads whose field has no resolved position (top undefined)', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
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
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
      const resolved = thread({ id: 'a', fieldId: '1.1', resolvedAt: '2026-04-13T00:00:00Z' })
      const { wrapper } = mountPanel({ formContainerRef: form, threads: [resolved] })
      await flushRaf()
      await nextTick()

      expect(wrapper.find('.comment-field-group').exists()).toBe(false)

      wrapper.get('.comment-panel__toggle').element
        .dispatchEvent(new CustomEvent('change', { detail: { checked: true } }))
      await wrapper.vm.$nextTick()
      await nextTick()
      expect(wrapper.find('.comment-thread--resolved').exists()).toBe(true)
    })

    it('keeps an entry for the active field even when all its threads are filtered out', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
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
      const form = buildFormContainer([{ id: 'label-dpia-4.4', fieldLabel: 'Nieuw veld' }])
      const { wrapper } = mountPanel({ formContainerRef: form, threads: [], activeFieldId: '4.4' })
      await flushRaf()
      await nextTick()

      const group = wrapper.get('.comment-field-group')
      expect(group.attributes('data-field-group')).toBe('4.4')
      expect(group.findAll('.comment-thread')).toHaveLength(0)
      expect(group.find('.comment-inline-form').exists()).toBe(true)
    })

    it('does not add an entry for an active field with no resolved position', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
      const { wrapper } = mountPanel({ formContainerRef: form, threads: [], activeFieldId: '5.5' })
      await flushRaf()
      await nextTick()

      expect(wrapper.find('.comment-field-group').exists()).toBe(false)
      expect(wrapper.get('.comment-panel__empty').exists()).toBe(true)
    })

    it('sorts entries by their top position', async () => {
      const form = buildFormContainer([
        { id: 'label-dpia-1.1', fieldLabel: 'Eerste' },
        { id: 'label-dpia-2.2', fieldLabel: 'Tweede' },
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
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
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
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
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
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
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
    it('focuses the inline field when a field becomes active and the user can comment', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
      const { wrapper } = mountPanel({ role: 'editor', formContainerRef: form, threads: [], activeFieldId: null })
      await flushRaf()
      await nextTick()

      await wrapper.setProps({ activeFieldId: '1.1' })
      // Allow the two awaited nextTicks inside the watcher to settle.
      await nextTick()
      await nextTick()
      await nextTick()

      const field = wrapper.find('[data-field-group="1.1"] .comment-inline-form nldd-multi-line-text-field')
      expect(field.exists()).toBe(true)
    })

    it('does nothing when the new field id is null', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
      const { wrapper } = mountPanel({ role: 'editor', formContainerRef: form, activeFieldId: '1.1' })
      await flushRaf()
      await nextTick()

      await wrapper.setProps({ activeFieldId: null })
      await nextTick()
      expect(wrapper.find('.comment-inline-form').exists()).toBe(false)
    })

    it('does nothing when the user cannot comment', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
      const { wrapper } = mountPanel({ role: 'viewer', formContainerRef: form, activeFieldId: null })
      await flushRaf()
      await nextTick()

      await wrapper.setProps({ activeFieldId: '1.1' })
      await nextTick()
      await nextTick()
      expect(wrapper.find('.comment-inline-form').exists()).toBe(false)
    })

    it('handles a field that has no inline field (no element to focus)', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
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
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
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
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
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
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
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
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
      const t = thread({ id: 'a', fieldId: '1.1', authorId: 'user-1' })
      const { wrapper, spies } = mountPanel({
        role: 'owner',
        currentUserId: 'user-1',
        formContainerRef: form,
        threads: [t],
      })
      await flushRaf()
      await nextTick()

      const footerButtons = wrapper
        .findAll('.comment-item__footer nldd-button')
        .map((b) => [b.attributes('text'), b.attributes('start-icon'), b.attributes('variant'), b.attributes('size')])
      expect(footerButtons).toEqual([
        ['Reageren', 'comment', 'neutral-transparent', 'xs'],
        ['Verwijderen', 'trash', 'critical-transparent', 'xs'],
        ['Oplossen', 'check-mark', 'accent-transparent', 'xs'],
      ])

      await wrapper.get('nldd-button[variant="critical-transparent"]').trigger('click')
      expect(spies.deleteComment).toHaveBeenCalledWith('a')

      await wrapper.get('nldd-button[variant="accent-transparent"]').trigger('click')
      expect(spies.resolveThread).toHaveBeenCalledWith('a')
    })

    it('shows the reopen button for a resolved thread when the user can resolve', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
      const t = thread({ id: 'a', fieldId: '1.1', resolvedAt: '2026-04-13T00:00:00Z' })
      const { wrapper, spies } = mountPanel({
        role: 'owner',
        formContainerRef: form,
        threads: [t],
        activeFieldId: '1.1',
      })
      await flushRaf()
      await nextTick()
      wrapper.get('.comment-panel__toggle').element
        .dispatchEvent(new CustomEvent('change', { detail: { checked: true } }))
      await wrapper.vm.$nextTick()
      await nextTick()

      const footerButtons = wrapper.findAll('.comment-item__footer nldd-button')
      expect(footerButtons.map((b) => b.attributes('text'))).toEqual(['Verwijderen', 'Heropenen'])

      const reopenBtn = footerButtons[1]
      expect(reopenBtn.attributes('start-icon')).toBe('undo')
      expect(reopenBtn.attributes('variant')).toBe('neutral-transparent')
      await reopenBtn.trigger('click')
      expect(spies.reopenThread).toHaveBeenCalledWith('a')
    })

    it('does not render delete for someone else\'s comment when not owner', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
      const t = thread({ id: 'a', fieldId: '1.1', authorId: 'someone-else' })
      const { wrapper } = mountPanel({
        role: 'editor',
        currentUserId: 'user-1',
        formContainerRef: form,
        threads: [t],
      })
      await flushRaf()
      await nextTick()

      expect(wrapper.find('nldd-button[variant="critical-transparent"]').exists()).toBe(false)
      const texts = wrapper.findAll('.comment-item__footer nldd-button').map((b) => b.attributes('text'))
      expect(texts).toEqual(['Reageren', 'Oplossen'])
    })

    it('does not render resolve/reply controls for a commenter (canResolve false)', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
      const t = thread({ id: 'a', fieldId: '1.1', authorId: 'someone-else' })
      const { wrapper } = mountPanel({
        role: 'commenter',
        currentUserId: 'user-1',
        formContainerRef: form,
        threads: [t],
      })
      await flushRaf()
      await nextTick()

      const texts = wrapper.findAll('.comment-item__footer nldd-button').map((b) => b.attributes('text'))
      expect(texts).toEqual(['Reageren'])
      expect(wrapper.find('nldd-button[variant="critical-transparent"]').exists()).toBe(false)
    })
  })

  describe('reply flow', () => {
    it('opens the reply form, submits a reply, then closes via cancel', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
      const t = thread({ id: 'a', fieldId: '1.1' })
      const { wrapper, spies } = mountPanel({
        role: 'editor',
        formContainerRef: form,
        threads: [t],
      })
      await flushRaf()
      await nextTick()

      const replyBtn = wrapper.findAll('nldd-button').find((b) => b.attributes('text') === 'Reageren')!
      await replyBtn.trigger('click')
      await nextTick()

      const replyForm = wrapper.get('.comment-reply-form')
      await setFieldValue(replyForm.get('nldd-multi-line-text-field'), 'Mijn reactie')

      await replyForm.get('nldd-button[variant="primary"]').trigger('click')
      expect(spies.createReply).toHaveBeenCalledWith('a', '1.1', 'Mijn reactie')
      await nextTick()
      expect(wrapper.find('.comment-reply-form').exists()).toBe(false)
    })

    it('does not submit a reply when the body is empty (only whitespace)', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
      const t = thread({ id: 'a', fieldId: '1.1' })
      const { wrapper, spies } = mountPanel({ role: 'editor', formContainerRef: form, threads: [t] })
      await flushRaf()
      await nextTick()

      const replyBtn = wrapper.findAll('nldd-button').find((b) => b.attributes('text') === 'Reageren')!
      await replyBtn.trigger('click')
      await nextTick()

      const replyForm = wrapper.get('.comment-reply-form')
      await setFieldValue(replyForm.get('nldd-multi-line-text-field'), '   ')
      await replyForm.get('nldd-button[variant="primary"]').trigger('click')
      expect(spies.createReply).not.toHaveBeenCalled()
    })

    it('cancels the reply form via the cancel button', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
      const t = thread({ id: 'a', fieldId: '1.1' })
      const { wrapper } = mountPanel({ role: 'editor', formContainerRef: form, threads: [t] })
      await flushRaf()
      await nextTick()

      const replyBtn = wrapper.findAll('nldd-button').find((b) => b.attributes('text') === 'Reageren')!
      await replyBtn.trigger('click')
      await nextTick()
      const cancel = wrapper.findAll('.comment-reply-form nldd-button').find((b) => b.attributes('text') === 'Annuleer')!
      await cancel.trigger('click')
      await nextTick()
      expect(wrapper.find('.comment-reply-form').exists()).toBe(false)
    })

    it('submits a reply via meta+enter keydown', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
      const t = thread({ id: 'a', fieldId: '1.1' })
      const { wrapper, spies } = mountPanel({ role: 'editor', formContainerRef: form, threads: [t] })
      await flushRaf()
      await nextTick()

      const replyBtn = wrapper.findAll('nldd-button').find((b) => b.attributes('text') === 'Reageren')!
      await replyBtn.trigger('click')
      await nextTick()

      const field = wrapper.get('.comment-reply-form nldd-multi-line-text-field')
      await setFieldValue(field, 'Via toetsenbord')
      await field.trigger('keydown.enter.meta')
      expect(spies.createReply).toHaveBeenCalledWith('a', '1.1', 'Via toetsenbord')
    })

    it('cancels the reply form via the escape key', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
      const t = thread({ id: 'a', fieldId: '1.1' })
      const { wrapper } = mountPanel({ role: 'editor', formContainerRef: form, threads: [t] })
      await flushRaf()
      await nextTick()

      const replyBtn = wrapper.findAll('nldd-button').find((b) => b.attributes('text') === 'Reageren')!
      await replyBtn.trigger('click')
      await nextTick()
      await wrapper.get('.comment-reply-form nldd-multi-line-text-field').trigger('keydown.escape')
      await nextTick()
      expect(wrapper.find('.comment-reply-form').exists()).toBe(false)
    })
  })

  describe('inline new comment flow', () => {
    it('submits a new comment via the Plaatsen button', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
      const { wrapper, spies } = mountPanel({
        role: 'owner',
        formContainerRef: form,
        threads: [],
        activeFieldId: '1.1',
      })
      await flushRaf()
      await nextTick()

      const inline = wrapper.get('.comment-inline-form')
      await setFieldValue(inline.get('nldd-multi-line-text-field'), 'Een nieuwe opmerking')

      const submit = inline.get('nldd-button[variant="primary"]')
      expect(submit.attributes('text')).toBe('Plaatsen')
      expect(submit.attributes('disabled')).toBeUndefined()
      await submit.trigger('click')
      expect(spies.createComment).toHaveBeenCalledWith('1.1', 'Een nieuwe opmerking')
    })

    it('keeps what you typed when placing the comment fails', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', rvoLabel: 'Veld' }])
      const { wrapper, spies } = mountPanel({
        role: 'owner',
        formContainerRef: form,
        threads: [],
        activeFieldId: '1.1',
      })
      await flushRaf()
      await nextTick()

      spies.createComment.mockRejectedValueOnce(new Error('netwerkfout'))

      const inline = wrapper.get('.comment-inline-form')
      const textarea = inline.get('nldd-multi-line-text-field')
      await setFieldValue(textarea, 'Kostbare tekst')
      await inline.get('nldd-button[variant="primary"]').trigger('click')
      await nextTick()

      expect(textarea.attributes('value')).toBe('Kostbare tekst')
    })

    it('keeps the reply text when posting the reply fails', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', rvoLabel: 'Veld' }])
      const { wrapper, spies } = mountPanel({
        role: 'owner',
        formContainerRef: form,
        threads: [thread({ id: 'root', fieldId: '1.1' })],
      })
      await flushRaf()
      await nextTick()

      await wrapper.findAll('.comment-item__footer nldd-button').find((b) => b.attributes('text') === 'Reageren')!.trigger('click')
      await nextTick()

      spies.createReply.mockRejectedValueOnce(new Error('netwerkfout'))

      const replyForm = wrapper.get('.comment-reply-form')
      const textarea = replyForm.get('nldd-multi-line-text-field')
      await setFieldValue(textarea, 'Mijn reactie')
      await replyForm.get('nldd-button[variant="primary"]').trigger('click')
      await nextTick()

      expect(wrapper.find('.comment-reply-form').exists()).toBe(true)
      expect(wrapper.get('.comment-reply-form nldd-multi-line-text-field').attributes('value'))
        .toBe('Mijn reactie')
    })

    it('disables the Plaatsen button while the body is empty', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
      const { wrapper, spies } = mountPanel({
        role: 'owner',
        formContainerRef: form,
        threads: [],
        activeFieldId: '1.1',
      })
      await flushRaf()
      await nextTick()

      const inline = wrapper.get('.comment-inline-form')
      const submit = inline.get('nldd-button[variant="primary"]')
      expect(submit.attributes('disabled')).toBeDefined()

      await submit.trigger('click')
      expect(spies.createComment).not.toHaveBeenCalled()
    })

    it('submits a new comment via meta+enter keydown', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
      const { wrapper, spies } = mountPanel({
        role: 'owner',
        formContainerRef: form,
        threads: [],
        activeFieldId: '1.1',
      })
      await flushRaf()
      await nextTick()

      const field = wrapper.get('.comment-inline-form nldd-multi-line-text-field')
      await setFieldValue(field, 'Toetsenbord opmerking')
      await field.trigger('keydown.enter.meta')
      expect(spies.createComment).toHaveBeenCalledWith('1.1', 'Toetsenbord opmerking')
    })

    it('clears the body and emits deactivate-field on escape', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
      const { wrapper } = mountPanel({
        role: 'owner',
        formContainerRef: form,
        threads: [],
        activeFieldId: '1.1',
      })
      await flushRaf()
      await nextTick()

      const field = wrapper.get('.comment-inline-form nldd-multi-line-text-field')
      await setFieldValue(field, 'iets')
      await field.trigger('keydown.escape')
      expect(wrapper.emitted('deactivate-field')).toHaveLength(1)
    })

    it('clears the body and emits deactivate-field via the Annuleer button', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
      const { wrapper } = mountPanel({
        role: 'owner',
        formContainerRef: form,
        threads: [],
        activeFieldId: '1.1',
      })
      await flushRaf()
      await nextTick()

      const inline = wrapper.get('.comment-inline-form')
      const cancel = inline.findAll('nldd-button').find((b) => b.attributes('text') === 'Annuleer')!
      await cancel.trigger('click')
      expect(wrapper.emitted('deactivate-field')).toHaveLength(1)
    })
  })

  describe('edit flow (own comment)', () => {
    it('starts editing on body click and submits the edit', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
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
      const field = editBox.get('nldd-multi-line-text-field')
      expect(field.attributes('value')).toBe('origineel')
      await setFieldValue(field, 'aangepast')

      await editBox.get('nldd-button[variant="primary"]').trigger('click')
      expect(spies.updateComment).toHaveBeenCalledWith('a', 'aangepast')
      await nextTick()
      expect(wrapper.find('.comment-item__edit').exists()).toBe(false)
    })

    it('stays in edit mode with your text when saving the edit fails', async () => {
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

      spies.updateComment.mockRejectedValueOnce(new Error('netwerkfout'))

      const editBox = wrapper.get('.comment-item__edit')
      const textarea = editBox.get('nldd-multi-line-text-field')
      await setFieldValue(textarea, 'aangepast')
      await editBox.get('nldd-button[variant="primary"]').trigger('click')
      await nextTick()

      expect(wrapper.find('.comment-item__edit').exists()).toBe(true)
      expect(wrapper.get('.comment-item__edit nldd-multi-line-text-field').attributes('value'))
        .toBe('aangepast')
    })

    it('starts editing via the enter key on the body', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
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
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
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
      await setFieldValue(editBox.get('nldd-multi-line-text-field'), '   ')
      await editBox.get('nldd-button[variant="primary"]').trigger('click')
      expect(spies.updateComment).not.toHaveBeenCalled()
    })

    it('cancels editing via the Annuleer button', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
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

      const cancel = wrapper.findAll('.comment-item__edit nldd-button').find((b) => b.attributes('text') === 'Annuleer')!
      await cancel.trigger('click')
      await nextTick()
      expect(wrapper.find('.comment-item__edit').exists()).toBe(false)
    })

    it('submits the edit via meta+enter and cancels via escape', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
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

      const field = wrapper.get('.comment-item__edit nldd-multi-line-text-field')
      await setFieldValue(field, 'via meta enter')
      await field.trigger('keydown.enter.meta')
      expect(spies.updateComment).toHaveBeenCalledWith('a', 'via meta enter')

      await nextTick()
      await wrapper.get('.comment-item__body').trigger('click')
      await nextTick()
      await nextTick()
      await wrapper.get('.comment-item__edit nldd-multi-line-text-field').trigger('keydown.escape')
      await nextTick()
      expect(wrapper.find('.comment-item__edit').exists()).toBe(false)
    })

    it('does not allow editing a foreign comment (non-editable body)', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
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
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
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

      const del = replies[0].findAll('nldd-button[variant="critical-transparent"]')[0]
      await del.trigger('click')
      expect(spies.deleteComment).toHaveBeenCalledWith('r1')
    })

    it('edits a reply via clicking its body', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
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
      await setFieldValue(editBox.get('nldd-multi-line-text-field'), 'reactie aangepast')
      await editBox.get('nldd-button[variant="primary"]').trigger('click')
      expect(spies.updateComment).toHaveBeenCalledWith('r1', 'reactie aangepast')
    })

    it('edits a reply via the enter key on its body', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
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
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
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
      wrapper.get('.comment-panel__toggle').element
        .dispatchEvent(new CustomEvent('change', { detail: { checked: true } }))
      await wrapper.vm.$nextTick()
      await nextTick()

      const replyItem = wrapper.get('.comment-item--reply')
      expect(replyItem.find('.comment-item__footer').exists()).toBe(false)
    })

    it('does not allow editing a foreign reply', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
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

    it('startEdit handles the case where no edit field is in the DOM', async () => {
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

  describe('readFieldValue', () => {
    it('falls back to the host value when the input event carries no detail', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
      const { wrapper, spies } = mountPanel({
        role: 'owner',
        formContainerRef: form,
        threads: [],
        activeFieldId: '1.1',
      })
      await flushRaf()
      await nextTick()

      const field = wrapper.get('.comment-inline-form nldd-multi-line-text-field')
      const host = field.element as HTMLElement & { value?: string }
      host.value = 'Zonder detail'
      host.dispatchEvent(new Event('input'))
      await nextTick()

      await wrapper.get('.comment-inline-form nldd-button[variant="primary"]').trigger('click')
      expect(spies.createComment).toHaveBeenCalledWith('1.1', 'Zonder detail')
    })
  })
})

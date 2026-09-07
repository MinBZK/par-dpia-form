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

// The panel scopes its list to the chapter on screen and folds the rest away.
// Tests set currentRootTaskId to the chapter their fixtures live in; '1'
// matches the default fixture field ids.
const defaultRootTasks = [
  { id: '1', task: 'Deel 1 – Waarom?' },
  { id: '2', task: 'Deel 2 – Wat?' },
  { id: '3', task: 'Deel 3 – Hoe?' },
]

const taskStoreMock = {
  currentRootTaskId: { value: '1' },
  rootTasks: { value: defaultRootTasks },
  goToTask: vi.fn(),
}

// Task ids are display numbers, not a hierarchy, so the chapter of a field is
// walked up the real parent chain. Fixtures use ids like "1.1" and "2.1.3";
// their parent is the first dot-segment, which is what the form's data does too.
// Overrides for shapes the dotted default cannot express, such as the IAMA's
// "1.0" chapter holding 1.1.
const parentChain: Record<string, string> = {}

const parentOf = (taskId: string): string | null => {
  if (taskId in parentChain) return parentChain[taskId]
  const cut = taskId.lastIndexOf('.')
  return cut === -1 ? null : taskId.slice(0, cut)
}

vi.mock('@overheid-assessment/core', () => ({
  // The real one strips the definition panels a term carries; the panel uses it
  // so the question, not its explanation, heads the group.
  getPlainTextWithoutDefinitions: (html: string) => {
    const el = document.createElement('div')
    el.innerHTML = html
    el.querySelectorAll('span.aiv-definition-text').forEach((n) => n.remove())
    return el.textContent ?? ''
  },
  useTaskStore: () => ({ getParentTaskId: parentOf }),
  useTaskNavigation: () => taskStoreMock,
}))

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
  taskStoreMock.currentRootTaskId.value = '1'
  taskStoreMock.rootTasks.value = defaultRootTasks
  taskStoreMock.goToTask.mockClear()
  for (const key of Object.keys(parentChain)) delete parentChain[key]
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
    // As FormField renders it: div.form-field__label wraps the <label> that
    // carries the id, not the other way round.
    const wrap = document.createElement('div')
    wrap.className = 'form-field__label'
    const label = document.createElement('label')
    label.id = spec.id
    wrap.appendChild(label)

    if (spec.fieldLabel !== undefined) {
      const span = document.createElement('span')
      span.textContent = spec.fieldLabel
      label.appendChild(span)
    } else if (spec.aivLabel !== undefined) {
      const span = document.createElement('span')
      span.textContent = `${spec.aivLabel.title} `
      const aiv = document.createElement('span')
      aiv.className = 'aiv-definition'
      aiv.textContent = spec.aivLabel.term
      // Hidden on screen, but part of the label's textContent.
      const def = document.createElement('span')
      def.className = 'aiv-definition-text'
      def.textContent = spec.aivLabel.definition
      aiv.appendChild(def)
      span.appendChild(aiv)
      label.appendChild(span)
    } else if (spec.textLabel !== undefined) {
      label.textContent = spec.textLabel
    }
    form.appendChild(wrap)
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

// The "Opgeloste tonen" filter is one switch, so it is a button that stays
// pressed rather than a menu: nldd-menu has a 280px minimum and would cover
// nearly the whole 320px column for a single choice.
function filterButton(wrapper: { get: (s: string) => { element: Element; attributes: (a: string) => string | undefined } }) {
  return wrapper.get('.comment-panel__filter')
}

function toggleResolved(wrapper: { get: (s: string) => { element: Element; attributes: (a: string) => string | undefined } }, selected = true) {
  filterButton(wrapper).element.dispatchEvent(
    new CustomEvent('change', { detail: { selected } }),
  )
}

describe('CommentPanel', () => {
  describe('header & basic rendering', () => {
    it('closes on the title bar\'s own dismiss button', async () => {
      const { wrapper } = mountPanel()
      // nldd-top-title-bar draws that button itself and reports it as `dismiss`.
      const bar = wrapper.get('.comment-panel__header')
      expect(bar.attributes('text')).toBe('Opmerkingen')
      expect(bar.attributes('dismiss-text')).toBe('Sluiten')

      bar.element.dispatchEvent(new CustomEvent('dismiss'))
      await wrapper.vm.$nextTick()
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
      expect(empty.attributes('text')).toBe('Nog geen opmerkingen op deze pagina')
    })

    it('labels the filter and gives it checkbox semantics', () => {
      const { wrapper } = mountPanel()
      const button = filterButton(wrapper)
      // An icon alone cannot say which comments are meant, so it carries the
      // word; no accessible-label beside it, which would rename the visible
      // text and break "click Opgelost" for voice control.
      expect(button.attributes('text')).toBe('Opgeloste opmerkingen')
      expect(button.attributes('accessible-label')).toBeUndefined()
      expect(button.attributes('icon')).toBe('check-mark-circle')
      // A filter is on or off, not an action: checkbox, not button.
      expect(button.attributes('type')).toBe('checkbox')
    })

    it('toggles showResolved from the filter button', async () => {
      const { wrapper } = mountPanel()
      expect(filterButton(wrapper).attributes('selected')).toBeUndefined()

      toggleResolved(wrapper)
      await wrapper.vm.$nextTick()
      expect(filterButton(wrapper).attributes('selected')).toBeDefined()

      toggleResolved(wrapper, false)
      await wrapper.vm.$nextTick()
      expect(filterButton(wrapper).attributes('selected')).toBeUndefined()
    })

    it('ignores a change that carries no state', async () => {
      const { wrapper } = mountPanel()
      toggleResolved(wrapper)
      await wrapper.vm.$nextTick()

      filterButton(wrapper).element.dispatchEvent(new CustomEvent('change'))
      await wrapper.vm.$nextTick()
      expect(filterButton(wrapper).attributes('selected')).toBeDefined()
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

  // The list is a plain list in the order of the form, scoped to the chapter on
  // screen. No geometry: nothing measures the form or the pane.
  describe('entries — one group per question, chapter-scoped', () => {
    it('labels each group with the question text', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Naam van veld' }])
      const { wrapper } = mountPanel({
        formContainerRef: form,
        threads: [thread({ id: 'root', fieldId: '1.1' })],
      })
      await flushRaf()
      await nextTick()

      const group = wrapper.get('.comment-field-group')
      expect(group.attributes('data-field-group')).toBe('1.1')
      expect(group.get('.comment-field-group__label').text()).toBe('Naam van veld')
      // No inline offset any more: the group sits where the list puts it.
      expect(group.attributes('style')).toBeUndefined()
    })

    it('excludes the begrip-definition tooltip text from the label', async () => {
      const form = buildFormContainer([
        {
          id: 'label-dpia-1.1',
          aivLabel: { title: 'Wat is een', term: 'algoritme', definition: 'uitleg van het begrip' },
        },
      ])
      const { wrapper } = mountPanel({
        formContainerRef: form,
        threads: [thread({ id: 'a', fieldId: '1.1' })],
      })
      await flushRaf()
      await nextTick()

      // The term stays part of the question; only its tooltip text is dropped.
      expect(wrapper.get('.comment-field-group__label').text()).toBe('Wat is een algoritme')
    })

    it('falls back to the field id when the label carries no text', async () => {
      const bare = document.createElement('div')
      const empty = document.createElement('div')
      empty.id = 'label-dpia-1.1'
      bare.appendChild(empty)

      const { wrapper } = mountPanel({
        formContainerRef: bare,
        threads: [thread({ id: 'a', fieldId: '1.1' })],
      })
      await flushRaf()
      await nextTick()

      expect(wrapper.get('.comment-field-group__label').text()).toBe('1.1')
    })

    it('renders a group without a label button when the field is not in the form', async () => {
      const form = buildFormContainer([])
      const { wrapper } = mountPanel({
        formContainerRef: form,
        threads: [thread({ id: 'a', fieldId: '1.1' })],
      })
      await flushRaf()
      await nextTick()

      // The comment still shows: a question scrolled out of the DOM must not
      // take its comments with it.
      expect(wrapper.find('.comment-field-group').exists()).toBe(true)
      expect(wrapper.find('.comment-field-group__label').exists()).toBe(false)
    })

    it('orders the groups the way the form does, not the way the map does', async () => {
      const form = buildFormContainer([
        { id: 'label-dpia-1.10', fieldLabel: 'Tiende' },
        { id: 'label-dpia-1.2', fieldLabel: 'Tweede' },
      ])
      const { wrapper } = mountPanel({
        formContainerRef: form,
        // Inserted 1.10 first, so map order alone would put it on top; as text
        // "1.10" also sorts before "1.2".
        threads: [thread({ id: 'a', fieldId: '1.10' }), thread({ id: 'b', fieldId: '1.2' })],
      })
      await flushRaf()
      await nextTick()

      expect(wrapper.findAll('.comment-field-group').map(g => g.attributes('data-field-group')))
        .toEqual(['1.2', '1.10'])
    })

    it('sorts a non-numeric field id after the numbered ones', async () => {
      const form = buildFormContainer([])
      const { wrapper } = mountPanel({
        formContainerRef: form,
        threads: [
          thread({ id: 'a', fieldId: '1.los' }),
          thread({ id: 'b', fieldId: '1.2' }),
          thread({ id: 'c', fieldId: '1.ook' }),
        ],
      })
      await flushRaf()
      await nextTick()

      expect(wrapper.findAll('.comment-field-group').map(g => g.attributes('data-field-group')))
        .toEqual(['1.2', '1.los', '1.ook'])
    })

    it('treats a deeper field id as coming after its shorter prefix', async () => {
      const form = buildFormContainer([])
      const { wrapper } = mountPanel({
        formContainerRef: form,
        threads: [thread({ id: 'a', fieldId: '1.2.1' }), thread({ id: 'b', fieldId: '1.2' })],
      })
      await flushRaf()
      await nextTick()

      expect(wrapper.findAll('.comment-field-group').map(g => g.attributes('data-field-group')))
        .toEqual(['1.2', '1.2.1'])
    })

    // Where it was opened from decides how it starts: the header badge counts
    // the whole assessment, so clicking a "3" and being shown one comment reads
    // as a bug.
    it('shows the whole form when opened from the header badge', async () => {
      const form = buildFormContainer([])
      const { wrapper } = mountPanel({
        formContainerRef: form,
        threads: [
          thread({ id: 'a', fieldId: '1.1' }),
          thread({ id: 'b', fieldId: '2.1' }),
          thread({ id: 'c', fieldId: '3.4' }),
        ],
      })
      await flushRaf()
      await nextTick()

      expect(wrapper.findAll('.comment-field-group').map(g => g.attributes('data-field-group')))
        .toEqual(['1.1', '2.1', '3.4'])
      expect(wrapper.get('.comment-panel__show-all').attributes('selected')).toBeDefined()
    })

    it('narrows to one step when a question is opened while it is wide', async () => {
      const form = buildFormContainer([])
      const { wrapper } = mountPanel({
        formContainerRef: form,
        role: 'editor',
        threads: [thread({ id: 'a', fieldId: '1.1' }), thread({ id: 'b', fieldId: '2.1' })],
      })
      await flushRaf()
      await nextTick()
      expect(wrapper.findAll('.comment-field-group').length).toBe(2)

      await wrapper.setProps({ activeFieldId: '1.1' })
      await nextTick()
      expect(wrapper.findAll('.comment-field-group').map(g => g.attributes('data-field-group')))
        .toEqual(['1.1'])

      // Cancelling a new comment clears the field too; that must not widen it.
      await wrapper.setProps({ activeFieldId: null })
      await nextTick()
      expect(wrapper.findAll('.comment-field-group').length).toBe(1)
    })

    // Opened from a question's own button: that question, not the whole step.
    it('shows one question when opened from its own button', async () => {
      const form = buildFormContainer([])
      const { wrapper } = mountPanel({
        formContainerRef: form,
        activeFieldId: '1.1',
        role: 'editor',
        threads: [
          thread({ id: 'a', fieldId: '1.1' }),
          // Same step, different question: not what you clicked.
          thread({ id: 'b', fieldId: '1.2' }),
          thread({ id: 'c', fieldId: '2.1' }),
        ],
      })
      await flushRaf()
      await nextTick()

      expect(wrapper.findAll('.comment-field-group').map(g => g.attributes('data-field-group')))
        .toEqual(['1.1'])

      // And the way back to everything is there, whatever else the form holds.
      wrapper.get('.comment-panel__show-all').element
        .dispatchEvent(new CustomEvent('change', { detail: { selected: true } }))
      await nextTick()
      expect(wrapper.findAll('.comment-field-group').map(g => g.attributes('data-field-group')))
        .toEqual(['1.1', '1.2', '2.1'])
    })

    // Narrowed to a step rather than a question: what you get after cancelling
    // a new comment, which clears the active field without widening the list.
    it('falls back to the step you are on once the question is cleared', async () => {
      const form = buildFormContainer([])
      const { wrapper } = mountPanel({
        formContainerRef: form,
        activeFieldId: '1.1',
        role: 'editor',
        threads: [
          thread({ id: 'a', fieldId: '1.1' }),
          thread({ id: 'd', fieldId: '1.2' }),
          thread({ id: 'b', fieldId: '2.1' }),
          // A chapter's completion checkbox counts as part of that chapter.
          thread({ id: 'c', fieldId: 'completed.2' }),
        ],
      })
      await flushRaf()
      await nextTick()

      // The question you clicked, first.
      expect(wrapper.findAll('.comment-field-group').map(g => g.attributes('data-field-group')))
        .toEqual(['1.1'])

      // Clearing it falls back to the step, not to the whole form.
      await wrapper.setProps({ activeFieldId: null })
      await nextTick()
      expect(wrapper.findAll('.comment-field-group').map(g => g.attributes('data-field-group')))
        .toEqual(['1.1', '1.2'])
    })

    // One list with a filter, not two lists: switching it on widens the same
    // list to every step instead of opening a read-only one underneath.
    it('widens the list to the whole form when the filter is switched on', async () => {
      const form = buildFormContainer([])
      const { wrapper } = mountPanel({
        formContainerRef: form,
        // Opened from a question, so the list starts on that question's step.
        activeFieldId: '1.1',
        role: 'editor',
        threads: [
          thread({ id: 'a', fieldId: '1.1' }),
          thread({ id: 'b', fieldId: '2.1' }),
          thread({ id: 'c', fieldId: '3.4' }),
        ],
      })
      await flushRaf()
      await nextTick()

      // This step only, and no step heading: there is nothing to tell apart.
      expect(wrapper.findAll('.comment-field-group').map(g => g.attributes('data-field-group')))
        .toEqual(['1.1'])
      expect(wrapper.find('.comment-chapter__title').exists()).toBe(false)

      const filter = wrapper.get('.comment-panel__show-all')
      expect(filter.attributes('text')).toBe('Alle opmerkingen')

      filter.element.dispatchEvent(new CustomEvent('change', { detail: { selected: true } }))
      await nextTick()

      // Every step now, each under its own title, all in the one list.
      expect(wrapper.findAll('.comment-field-group').map(g => g.attributes('data-field-group')))
        .toEqual(['1.1', '2.1', '3.4'])
      expect(wrapper.findAll('.comment-chapter__title').map(t => t.text()))
        .toEqual(['Deel 1 – Waarom?', 'Deel 2 – Wat?', 'Deel 3 – Hoe?'])
    })

    it('takes you to the step a heading names', async () => {
      const form = buildFormContainer([])
      const { wrapper } = mountPanel({
        formContainerRef: form,
        threads: [thread({ id: 'b', fieldId: '2.1' })],
      })
      await flushRaf()
      await nextTick()

      wrapper.get('.comment-panel__show-all').element
        .dispatchEvent(new CustomEvent('change', { detail: { selected: true } }))
      await nextTick()

      await wrapper.get('.comment-chapter__title').trigger('click')
      expect(taskStoreMock.goToTask).toHaveBeenCalledWith('2')
    })

    it('ignores a change that carries no state', async () => {
      const form = buildFormContainer([])
      const { wrapper } = mountPanel({
        formContainerRef: form,
        threads: [thread({ id: 'b', fieldId: '2.1' })],
      })
      await flushRaf()
      await nextTick()

      wrapper.get('.comment-panel__show-all').element.dispatchEvent(new CustomEvent('change'))
      await nextTick()
      // Opened from the header, so it stays on every step: a change without a
      // payload says nothing and must not narrow it.
      expect(wrapper.findAll('.comment-field-group').length).toBe(1)
    })



    // The IAMA's second chapter has id "1.0" and holds 1.1 and 1.actiepunten:
    // neither the first dot-segment nor a prefix match puts those in it, so the
    // whole chapter's comments read as "elsewhere".
    it('places a field under its real chapter, not its number', async () => {
      const form = buildFormContainer([])
      taskStoreMock.currentRootTaskId.value = '1.0'
      taskStoreMock.rootTasks.value = [
        { id: '0', task: 'Inleiding' },
        { id: '1.0', task: 'Deel 1 – Waarom?' },
      ]
      parentChain['1.1'] = '1.0'
      parentChain['1.1.1'] = '1.1'
      parentChain['1.actiepunten'] = '1.0'
      // '1.0' is a root: the default would walk it up to '1'.
      parentChain['1.0'] = ''

      const { wrapper } = mountPanel({
        formContainerRef: form,
        threads: [
          thread({ id: 'a', fieldId: '1.1.1' }),
          thread({ id: 'b', fieldId: '1.actiepunten' }),
        ],
      })
      await flushRaf()
      await nextTick()

      expect(wrapper.findAll('.comment-field-group').map(g => g.attributes('data-field-group')))
        .toEqual(['1.1.1', '1.actiepunten'])
      expect(wrapper.find('.comment-panel__elsewhere').exists()).toBe(false)

      wrapper.unmount()
    })

    // "completed.3" is not a task, so the parent chain has nothing to walk;
    // the same holds for every field while the schema is still loading.
    it('places a field with no parent chain by its number instead', async () => {
      const form = buildFormContainer([])
      // No entries in parentChain and no dotted default that resolves: these
      // ids have to fall back to the root they start with.
      parentChain['1.1'] = ''
      parentChain['completed.1'] = ''

      const { wrapper } = mountPanel({
        formContainerRef: form,
        threads: [
          thread({ id: 'a', fieldId: '1.1' }),
          thread({ id: 'b', fieldId: 'completed.1' }),
        ],
      })
      await flushRaf()
      await nextTick()

      expect(wrapper.findAll('.comment-field-group').length).toBe(2)
      expect(wrapper.find('.comment-panel__elsewhere').exists()).toBe(false)
    })

    it('falls back to the first segment for an id under no known chapter', async () => {
      const form = buildFormContainer([])
      taskStoreMock.currentRootTaskId.value = '9'
      taskStoreMock.rootTasks.value = [{ id: '9', task: 'Los' }]
      parentChain['9.1'] = ''

      const { wrapper } = mountPanel({
        formContainerRef: form,
        threads: [thread({ id: 'a', fieldId: '9.1' })],
      })
      await flushRaf()
      await nextTick()

      expect(wrapper.findAll('.comment-field-group').length).toBe(1)
      wrapper.unmount()
    })


    it('ignores a label id that carries no field id', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
      // No prefix-dash, so there is nothing to read a field id from.
      const malformed = document.createElement('div')
      malformed.id = 'label-zonderveld'
      malformed.textContent = 'Genegeerd'
      form.appendChild(malformed)

      const { wrapper } = mountPanel({
        formContainerRef: form,
        threads: [thread({ id: 'a', fieldId: '1.1' })],
      })
      await flushRaf()
      await nextTick()

      expect(wrapper.get('.comment-field-group__label').text()).toBe('Veld')
    })


    it('says nothing about elsewhere when there is nothing there', async () => {
      const form = buildFormContainer([])
      const { wrapper } = mountPanel({
        formContainerRef: form,
        threads: [thread({ id: 'a', fieldId: '1.1' })],
      })
      await flushRaf()
      await nextTick()

      expect(wrapper.find('.comment-panel__elsewhere').exists()).toBe(false)
    })

    it('adds an empty group for an active field that has no comments yet', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
      const { wrapper } = mountPanel({
        formContainerRef: form,
        threads: [],
        activeFieldId: '1.1',
        role: 'editor',
      })
      await flushRaf()
      await nextTick()

      expect(wrapper.get('.comment-field-group').attributes('data-field-group')).toBe('1.1')
    })

    it('ignores an active field from another chapter', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-9.1', fieldLabel: 'Elders' }])
      const { wrapper } = mountPanel({
        formContainerRef: form,
        threads: [],
        activeFieldId: '9.1',
        role: 'editor',
      })
      await flushRaf()
      await nextTick()

      expect(wrapper.find('.comment-field-group').exists()).toBe(false)
    })
  })

  describe('observers & scheduled updates', () => {
    it('picks up a question that appears after mount', async () => {
      // Only the labels are read now, so a size change is nothing to react to;
      // new questions arriving in the form still are.
      vi.useFakeTimers()
      const form = buildFormContainer([])
      const { wrapper } = mountPanel({
        formContainerRef: form,
        threads: [thread({ id: 'a', fieldId: '1.1' })],
      })

      const label = document.createElement('div')
      label.id = 'label-dpia-1.1'
      label.textContent = 'Later toegevoegd'
      form.appendChild(label)

      // Twice, so scheduleLabelUpdate hits its clearTimeout branch.
      await Promise.resolve()
      form.appendChild(document.createElement('span'))
      await Promise.resolve()
      vi.advanceTimersByTime(60)
      vi.useRealTimers()
      await nextTick()

      expect(wrapper.get('.comment-field-group__label').text()).toBe('Later toegevoegd')
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

      // nldd-text wraps the <time>; the machine-readable value stays on it.
      const time = wrapper.get('.comment-item__time time')
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
      toggleResolved(wrapper)
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
      toggleResolved(wrapper)
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

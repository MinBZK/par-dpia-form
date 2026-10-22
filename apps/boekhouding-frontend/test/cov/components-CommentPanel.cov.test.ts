/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import CommentPanel from '../../src/components/CommentPanel.vue'
import { useCollaborationStore } from '../../src/stores/collaboration'
import type { CommentThread, CommentReply } from '../../src/api'

// The panel shows one question at a time and walks the questions that have
// comments in the order of the form: chapter by chapter, field id inside a
// chapter. '1' is the chapter the default fixture field ids live in.
const defaultRootTasks = [
  { id: '1', task: 'Deel 1 - Waarom?' },
  { id: '2', task: 'Deel 2 - Wat?' },
  { id: '3', task: 'Deel 3 - Hoe?' },
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

const mountedWrappers: Array<{ unmount: () => void }> = []

beforeEach(() => {
  setActivePinia(createPinia())
  taskStoreMock.currentRootTaskId.value = '1'
  taskStoreMock.rootTasks.value = defaultRootTasks
  taskStoreMock.goToTask.mockClear()
  for (const key of Object.keys(parentChain)) delete parentChain[key]
  // jsdom lacks CSS.escape; the panel escapes a field id into a selector.
  ;(globalThis as unknown as { CSS: { escape: (s: string) => string } }).CSS = {
    escape: (s: string) => s,
  }
  // jsdom implements neither of these scroll methods; the panel calls both.
  HTMLElement.prototype.scrollIntoView = function () {}
  HTMLElement.prototype.scrollTo = function () {}
})

afterEach(() => {
  for (const w of mountedWrappers.splice(0)) w.unmount()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  delete (globalThis as unknown as { CSS?: unknown }).CSS
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

// Builds a fake form container with `label-*` elements so updateFieldLabels()
// can resolve the question text that heads the panel.
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

type Panel = ReturnType<typeof mountPanel>['wrapper']

// NLDD fields deliver their value in event.detail, which is what the panel
// reads; setValue() would only touch a native textarea that isn't there.
function setFieldValue(field: DOMWrapper<Element>, value: string): Promise<void> {
  field.element.dispatchEvent(new CustomEvent('input', { detail: { value } }))
  return nextTick()
}

// Settles the awaited nextTicks inside goToEntry and the activeFieldId watcher.
async function settle(): Promise<void> {
  await nextTick()
  await nextTick()
  await nextTick()
}

// The "Opgeloste opmerkingen" filter is one switch, so it is a button that
// stays pressed rather than a menu: nldd-menu has a 280px minimum and would
// cover nearly the whole 320px column for a single choice.
function filterButton(wrapper: Panel) {
  return wrapper.get('.comment-panel__filter')
}

function toggleResolved(wrapper: Panel, selected = true) {
  filterButton(wrapper).element.dispatchEvent(
    new CustomEvent('change', { detail: { selected } }),
  )
}

// The arrows are icon-buttons: an arrow plus the question it walks to, named in
// `text` because there is no visible label beside them.
function navButton(wrapper: Panel, direction: 'Vorige' | 'Volgende') {
  const icon = direction === 'Vorige' ? 'arrow-left' : 'arrow-right'
  return wrapper.get(`.comment-panel__nav nldd-icon-button[icon="${icon}"]`)
}

// The scope control is one picker with two stops, so switching is reporting the
// value that was picked.
function pickScope(wrapper: Panel, value: unknown) {
  wrapper.get('nldd-segmented-control').element.dispatchEvent(
    new CustomEvent('change', { detail: { value } }),
  )
  return nextTick()
}

// Every question the panel asked the editor to show, in order.
function selected(wrapper: Panel): string[] {
  return (wrapper.emitted('select-field') as string[][] | undefined ?? []).map((a) => a[0])
}

// The panel does not own the active field: it asks, the editor answers. One
// step of the walk is therefore a click plus the prop coming back.
async function step(wrapper: Panel, direction: 'Vorige' | 'Volgende'): Promise<void> {
  await navButton(wrapper, direction).trigger('click')
  await settle()
  const latest = selected(wrapper).at(-1)
  if (latest !== undefined) await wrapper.setProps({ activeFieldId: latest })
  await settle()
}

function group(wrapper: Panel) {
  return wrapper.get('.comment-field-group')
}

// Every question the body renders, in order.
function groupIds(wrapper: Panel): string[] {
  return wrapper.findAll('.comment-field-group')
    .map((g) => g.attributes('data-field-group')!)
}

// The one of those the arrows are parked on.
function currentGroupId(wrapper: Panel): string | undefined {
  return wrapper.find('.comment-field-group--current').attributes('data-field-group')
}

function positionText(wrapper: Panel): string {
  return wrapper.get('.comment-panel__position').text()
}

describe('CommentPanel', () => {
  describe('header & basic rendering', () => {
    it('closes on a dismiss button of its own in the title bar', async () => {
      const { wrapper } = mountPanel()
      const bar = wrapper.get('.comment-panel__header')
      expect(bar.attributes('text')).toBe('Opmerkingen')
      // The bar's own dismiss button is hidden on an inspector pane, so the
      // close button is ours and sits in the bar's toolbar slot.
      expect(bar.attributes('dismiss-text')).toBeUndefined()

      const close = bar.get('nldd-icon-button[icon="dismiss"]')
      expect(close.attributes('slot')).toBe('toolbar')
      expect(close.attributes('text')).toBe('Opmerkingen sluiten')

      await close.trigger('click')
      expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it('shows the loading state when the store is loading', () => {
      const { wrapper } = mountPanel({ loading: true })
      const empty = wrapper.get('.comment-panel__empty')
      expect(empty.text()).toBe('Laden...')
      expect(empty.attributes('role')).toBe('status')
    })

    it('shows the empty state when there is no question to show', () => {
      const { wrapper } = mountPanel({ loading: false })
      expect(wrapper.get('.comment-panel__empty').attributes('text')).toBe('Nog geen opmerkingen')
      // Nothing to walk, so no arrows either.
      expect(wrapper.find('.comment-panel__nav').exists()).toBe(false)
    })

    it('labels the filter and gives it checkbox semantics', () => {
      const { wrapper } = mountPanel()
      const button = filterButton(wrapper)
      // Short enough to sit beside the scope control, with the whole sentence
      // on the accessible label so it still says which comments are meant.
      expect(button.attributes('text')).toBe('Ook opgeloste')
      expect(button.attributes('accessible-label')).toBe('Toon ook opgeloste opmerkingen')
      expect(button.attributes('icon')).toBe('check-mark-circle')
      // A filter is on or off, not an action: checkbox, not button.
      expect(button.attributes('type')).toBe('checkbox')
    })

    it('toggles showResolved from the filter button', async () => {
      const { wrapper } = mountPanel()
      expect(filterButton(wrapper).attributes('selected')).toBeUndefined()

      toggleResolved(wrapper)
      await nextTick()
      expect(filterButton(wrapper).attributes('selected')).toBeDefined()

      toggleResolved(wrapper, false)
      await nextTick()
      expect(filterButton(wrapper).attributes('selected')).toBeUndefined()
    })

    it('ignores a change that carries no state', async () => {
      const { wrapper } = mountPanel()
      toggleResolved(wrapper)
      await nextTick()

      filterButton(wrapper).element.dispatchEvent(new CustomEvent('change'))
      await nextTick()
      expect(filterButton(wrapper).attributes('selected')).toBeDefined()
    })
  })

  describe('canComment / canResolve role branches', () => {
    it.each([
      ['commenter', true],
      ['editor', true],
      ['owner', true],
      ['viewer', false],
    ])('role %s may write a comment: %s', async (role, canComment) => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
      const { wrapper } = mountPanel({
        role,
        formContainerRef: form,
        threads: [thread({ id: 'root', fieldId: '1.1' })],
        activeFieldId: '1.1',
      })
      await settle()
      expect(wrapper.find('.comment-inline-form').exists()).toBe(canComment)
    })
  })

  describe('the question on screen', () => {
    it('heads the question with its chapter and its own text', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Naam van veld' }])
      const { wrapper } = mountPanel({
        formContainerRef: form,
        threads: [thread({ id: 'root', fieldId: '1.1' })],
      })
      await settle()

      expect(group(wrapper).attributes('data-field-group')).toBe('1.1')
      expect(wrapper.get('.comment-field-group__chapter').text()).toBe('Deel 1 - Waarom?')
      expect(wrapper.get('.comment-field-group__heading .comment-field-group__label').text())
        .toBe('Naam van veld')
    })

    it('excludes the begrip-definition tooltip text from the question', async () => {
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
      await settle()

      // The term stays part of the question; only its tooltip text is dropped.
      expect(wrapper.get('.comment-field-group__label').text()).toBe('Wat is een algoritme')
    })

    it('falls back to the field id when the label carries no text', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1' }])
      const { wrapper } = mountPanel({
        formContainerRef: form,
        threads: [thread({ id: 'a', fieldId: '1.1' })],
      })
      await settle()

      expect(wrapper.get('.comment-field-group__label').text()).toBe('1.1')
    })

    it('falls back to the field id when the question is not in the form at all', async () => {
      const form = buildFormContainer([])
      const { wrapper } = mountPanel({
        formContainerRef: form,
        threads: [thread({ id: 'a', fieldId: '1.1' })],
      })
      await settle()

      // The comment still shows: a question scrolled out of the DOM must not
      // take its comments with it.
      expect(wrapper.get('.comment-field-group__label').text()).toBe('1.1')
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
      await settle()

      expect(wrapper.get('.comment-field-group__label').text()).toBe('Veld')
    })

    // Opened from a question's own button to write the first comment on it:
    // that question has no thread yet, so it is not one of the stops.
    it('shows a question that has no comments yet', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
      const { wrapper } = mountPanel({
        formContainerRef: form,
        threads: [],
        activeFieldId: '1.1',
        role: 'editor',
      })
      await settle()

      expect(group(wrapper).attributes('data-field-group')).toBe('1.1')
      expect(wrapper.get('.comment-field-group__chapter').text()).toBe('Deel 1 - Waarom?')
      expect(wrapper.find('.comment-thread').exists()).toBe(false)
      expect(wrapper.find('.comment-inline-form').exists()).toBe(true)
    })

    it('leaves the chapter line empty for a question under no known chapter', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-9.1', fieldLabel: 'Elders' }])
      const { wrapper } = mountPanel({
        formContainerRef: form,
        threads: [],
        activeFieldId: '9.1',
        role: 'editor',
      })
      await settle()

      expect(group(wrapper).attributes('data-field-group')).toBe('9.1')
      expect(wrapper.get('.comment-field-group__chapter').text()).toBe('')
    })
  })

  describe('the walk through the questions with comments', () => {
    it('starts on the first question and counts from one', async () => {
      const form = buildFormContainer([])
      const { wrapper } = mountPanel({
        formContainerRef: form,
        threads: [
          thread({ id: 'a', fieldId: '1.1' }),
          thread({ id: 'b', fieldId: '2.1' }),
          thread({ id: 'c', fieldId: '3.4' }),
        ],
      })
      await settle()

      // Opened from the toolbar: the panel takes the form to the first comment
      // so the two never show a different question.
      expect(selected(wrapper)).toEqual(['1.1'])
      expect(positionText(wrapper)).toBe('1 van 3')
      expect(navButton(wrapper, 'Vorige').attributes('disabled')).toBeDefined()
      expect(navButton(wrapper, 'Volgende').attributes('disabled')).toBeUndefined()
    })

    it('walks chapter by chapter and takes the form along', async () => {
      const form = buildFormContainer([])
      const { wrapper } = mountPanel({
        formContainerRef: form,
        threads: [
          thread({ id: 'c', fieldId: '3.4' }),
          thread({ id: 'b', fieldId: '2.1' }),
          thread({ id: 'a', fieldId: '1.1' }),
        ],
      })
      await settle()
      // Chapter order, not the order the store happened to hold them in.
      expect(selected(wrapper)).toEqual(['1.1'])
      expect(taskStoreMock.goToTask).not.toHaveBeenCalled()

      await step(wrapper, 'Volgende')
      expect(selected(wrapper)).toEqual(['1.1', '2.1'])
      expect(positionText(wrapper)).toBe('2 van 3')
      // Another chapter has to be opened before its question can be scrolled to.
      expect(taskStoreMock.goToTask).toHaveBeenCalledWith('2')

      await step(wrapper, 'Volgende')
      expect(selected(wrapper).at(-1)).toBe('3.4')
      expect(positionText(wrapper)).toBe('3 van 3')
      expect(navButton(wrapper, 'Volgende').attributes('disabled')).toBeDefined()
      expect(navButton(wrapper, 'Vorige').attributes('disabled')).toBeUndefined()

      await step(wrapper, 'Vorige')
      expect(selected(wrapper).at(-1)).toBe('2.1')
    })

    it('orders the questions inside a chapter the way the form does', async () => {
      const form = buildFormContainer([])
      const { wrapper } = mountPanel({
        formContainerRef: form,
        // Inserted 1.10 first, so map order alone would put it on top; as text
        // "1.10" also sorts before "1.2".
        threads: [thread({ id: 'a', fieldId: '1.10' }), thread({ id: 'b', fieldId: '1.2' })],
      })
      await settle()

      expect(selected(wrapper)).toEqual(['1.2'])
      await step(wrapper, 'Volgende')
      expect(selected(wrapper)).toEqual(['1.2', '1.10'])
      // One chapter, so the form never had to be taken anywhere.
      expect(taskStoreMock.goToTask).not.toHaveBeenCalled()
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
      await settle()

      await step(wrapper, 'Volgende')
      await step(wrapper, 'Volgende')
      expect(selected(wrapper)).toEqual(['1.2', '1.los', '1.ook'])
    })

    it('treats a deeper field id as coming after its shorter prefix', async () => {
      const form = buildFormContainer([])
      const { wrapper } = mountPanel({
        formContainerRef: form,
        threads: [thread({ id: 'a', fieldId: '1.2.1' }), thread({ id: 'b', fieldId: '1.2' })],
      })
      await settle()

      await step(wrapper, 'Volgende')
      expect(selected(wrapper)).toEqual(['1.2', '1.2.1'])
    })

    it('stays put at either end of the walk', async () => {
      const form = buildFormContainer([])
      const { wrapper } = mountPanel({
        formContainerRef: form,
        threads: [thread({ id: 'a', fieldId: '1.1' })],
      })
      await settle()
      expect(selected(wrapper)).toEqual(['1.1'])

      await step(wrapper, 'Vorige')
      await step(wrapper, 'Volgende')
      // One question: both arrows have nowhere to go.
      expect(selected(wrapper)).toEqual(['1.1'])
      expect(positionText(wrapper)).toBe('1 van 1')
    })

    // Writing the first comment on a question: that question is not a stop, so
    // the counter says where you are instead of pretending otherwise.
    it('says how many questions lie elsewhere while a first comment is written', async () => {
      const form = buildFormContainer([])
      const { wrapper } = mountPanel({
        formContainerRef: form,
        activeFieldId: '1.5',
        threads: [thread({ id: 'a', fieldId: '1.1' }), thread({ id: 'b', fieldId: '2.1' })],
      })
      await settle()

      expect(positionText(wrapper)).toBe('Nieuwe opmerking, 2 elders')
      // Not a stop itself, so both arrows lead somewhere: you are never parked
      // on a question with nothing around it.
      expect(navButton(wrapper, 'Vorige').attributes('disabled')).toBeUndefined()
      expect(navButton(wrapper, 'Volgende').attributes('disabled')).toBeUndefined()
    })

    it('walks forward to the first question from one that is not a stop', async () => {
      const form = buildFormContainer([])
      const { wrapper } = mountPanel({
        formContainerRef: form,
        activeFieldId: '1.5',
        threads: [thread({ id: 'a', fieldId: '1.1' }), thread({ id: 'b', fieldId: '2.1' })],
      })
      await settle()

      await step(wrapper, 'Volgende')
      expect(selected(wrapper)).toEqual(['1.1'])
      expect(positionText(wrapper)).toBe('1 van 2')
    })

    it('walks back to the last question from one that is not a stop', async () => {
      const form = buildFormContainer([])
      const { wrapper } = mountPanel({
        formContainerRef: form,
        activeFieldId: '1.5',
        threads: [thread({ id: 'a', fieldId: '1.1' }), thread({ id: 'b', fieldId: '2.1' })],
      })
      await settle()

      await step(wrapper, 'Vorige')
      expect(selected(wrapper)).toEqual(['2.1'])
      expect(positionText(wrapper)).toBe('2 van 2')
      expect(taskStoreMock.goToTask).toHaveBeenCalledWith('2')
    })

    // Opened from a question rather than from the toolbar: the panel must not
    // walk away from the question you clicked.
    it('does not jump when it was opened on a question', async () => {
      const form = buildFormContainer([])
      const { wrapper } = mountPanel({
        formContainerRef: form,
        activeFieldId: '2.1',
        threads: [thread({ id: 'a', fieldId: '1.1' }), thread({ id: 'b', fieldId: '2.1' })],
      })
      await settle()

      expect(selected(wrapper)).toEqual([])
      expect(positionText(wrapper)).toBe('2 van 2')
    })

    it('jumps once, and only once', async () => {
      const form = buildFormContainer([])
      const { wrapper, store } = mountPanel({ formContainerRef: form, threads: [] })
      // Nothing to jump to yet.
      await settle()
      expect(selected(wrapper)).toEqual([])

      store.threads = [thread({ id: 'a', fieldId: '1.1' })]
      await settle()
      expect(selected(wrapper)).toEqual(['1.1'])

      // A colleague's comment arriving in the poll must not move the panel.
      store.threads = [...store.threads, thread({ id: 'b', fieldId: '2.1' })]
      await settle()
      expect(selected(wrapper)).toEqual(['1.1'])
    })
  })

  describe('one question or the whole chapter', () => {
    function panelInChapterOne(activeFieldId: string | null = null) {
      const form = buildFormContainer([
        { id: 'label-dpia-1.1', fieldLabel: 'Eerste vraag' },
        { id: 'label-dpia-1.2', fieldLabel: 'Tweede vraag' },
      ])
      return mountPanel({
        role: 'owner',
        formContainerRef: form,
        activeFieldId,
        threads: [
          thread({ id: 'a', fieldId: '1.1' }),
          thread({ id: 'b', fieldId: '1.2' }),
          thread({ id: 'c', fieldId: '2.1' }),
        ],
      })
    }

    it('offers both stops, with the question picked to begin with', async () => {
      const { wrapper } = panelInChapterOne()
      await settle()

      const control = wrapper.get('nldd-segmented-control')
      expect(control.attributes('value')).toBe('question')
      expect(control.attributes('accessible-label')).toBe('Welke opmerkingen')
      expect(wrapper.findAll('nldd-segmented-control-item')
        .map((i) => [i.attributes('value'), i.attributes('text')]))
        .toEqual([['question', 'Deze vraag'], ['section', 'Hele sectie']])
    })

    it('shows the question alone in question scope', async () => {
      const { wrapper } = panelInChapterOne()
      await settle()

      expect(groupIds(wrapper)).toEqual(['1.1'])
      expect(currentGroupId(wrapper)).toBe('1.1')
    })

    it('shows every question of the chapter in section scope', async () => {
      const { wrapper } = panelInChapterOne()
      await settle()

      await pickScope(wrapper, 'section')
      // Chapter 1 only: 2.1 belongs to another chapter.
      expect(groupIds(wrapper)).toEqual(['1.1', '1.2'])
      // The chapter heads the body once, not once per question.
      expect(wrapper.findAll('.comment-field-group__chapter')).toHaveLength(1)
      expect(wrapper.findAll('.comment-field-group__label').map((l) => l.text()))
        .toEqual(['Eerste vraag', 'Tweede vraag'])
      // The one the arrows are on stays marked among its neighbours.
      expect(currentGroupId(wrapper)).toBe('1.1')
      // And the comment box belongs to that one alone.
      expect(wrapper.findAll('.comment-inline-form')).toHaveLength(1)
      expect(wrapper.get('.comment-field-group--current .comment-inline-form').exists()).toBe(true)
    })

    it('adds a question that has no comments yet to its chapter', async () => {
      const form = buildFormContainer([
        { id: 'label-dpia-1.1', fieldLabel: 'Eerste vraag' },
        { id: 'label-dpia-1.5', fieldLabel: 'Nog lege vraag' },
      ])
      const { wrapper } = mountPanel({
        role: 'owner',
        formContainerRef: form,
        activeFieldId: '1.5',
        threads: [thread({ id: 'a', fieldId: '1.1' })],
      })
      await settle()

      await pickScope(wrapper, 'section')
      // Not one of the stops, so it is appended rather than looked up.
      expect(groupIds(wrapper)).toEqual(['1.1', '1.5'])
      expect(currentGroupId(wrapper)).toBe('1.5')
      expect(wrapper.findAll('.comment-thread')).toHaveLength(1)
    })

    it('goes back to the question alone', async () => {
      const { wrapper } = panelInChapterOne()
      await settle()

      await pickScope(wrapper, 'section')
      expect(groupIds(wrapper)).toEqual(['1.1', '1.2'])

      await pickScope(wrapper, 'question')
      expect(groupIds(wrapper)).toEqual(['1.1'])
    })

    it('ignores a scope change that names no stop', async () => {
      const { wrapper } = panelInChapterOne()
      await settle()

      await pickScope(wrapper, 'section')
      await pickScope(wrapper, 'iets anders')
      expect(groupIds(wrapper)).toEqual(['1.1', '1.2'])

      wrapper.get('nldd-segmented-control').element.dispatchEvent(new CustomEvent('change'))
      await nextTick()
      expect(groupIds(wrapper)).toEqual(['1.1', '1.2'])
    })
  })

  describe('which chapter a question belongs to', () => {
    // The IAMA's second chapter has id "1.0" and holds 1.1 and 1.actiepunten:
    // neither the first dot-segment nor a prefix match puts those in it.
    it('places a field under its real chapter, not its number', async () => {
      const form = buildFormContainer([])
      taskStoreMock.currentRootTaskId.value = '1.0'
      taskStoreMock.rootTasks.value = [
        { id: '0', task: 'Inleiding' },
        { id: '1.0', task: 'Deel 1 - Waarom?' },
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
      await settle()

      expect(selected(wrapper)).toEqual(['1.1.1'])
      expect(wrapper.get('.comment-field-group__chapter').text()).toBe('Deel 1 - Waarom?')
      await step(wrapper, 'Volgende')
      expect(selected(wrapper)).toEqual(['1.1.1', '1.actiepunten'])
    })

    // "completed.3" is not a task, so the parent chain has nothing to walk;
    // the same holds for every field while the schema is still loading.
    it('places a field with no parent chain by its number instead', async () => {
      const form = buildFormContainer([])
      parentChain['1.1'] = ''
      parentChain['2'] = ''

      const { wrapper } = mountPanel({
        formContainerRef: form,
        threads: [
          thread({ id: 'a', fieldId: '1.1' }),
          thread({ id: 'b', fieldId: 'completed.2' }),
        ],
      })
      await settle()

      expect(positionText(wrapper)).toBe('1 van 2')
      await step(wrapper, 'Volgende')
      expect(selected(wrapper)).toEqual(['1.1', 'completed.2'])
      expect(wrapper.get('.comment-field-group__chapter').text()).toBe('Deel 2 - Wat?')
    })

    it('prefers the longest chapter id the field id starts with', async () => {
      const form = buildFormContainer([])
      taskStoreMock.rootTasks.value = [
        { id: '1.0', task: 'Lang' },
        { id: '1', task: 'Kort' },
      ]
      // Nothing to walk, so the chapter comes from the id itself.
      parentChain['1.0.3'] = ''

      const { wrapper } = mountPanel({
        formContainerRef: form,
        threads: [thread({ id: 'a', fieldId: '1.0.3' })],
      })
      await settle()

      expect(wrapper.get('.comment-field-group__chapter').text()).toBe('Lang')
    })

    it('reads a field id that is itself a chapter id', async () => {
      const form = buildFormContainer([])
      // Walks up to a task that is no chapter, so the id has to speak for itself.
      parentChain['2'] = 'zz'

      const { wrapper } = mountPanel({
        formContainerRef: form,
        threads: [thread({ id: 'a', fieldId: 'completed.2' })],
      })
      await settle()

      expect(wrapper.get('.comment-field-group__chapter').text()).toBe('Deel 2 - Wat?')
    })

    it('survives a parent chain that loops back on itself', async () => {
      const form = buildFormContainer([])
      parentChain['1.1'] = 'kring'
      parentChain['kring'] = '1.1'

      const { wrapper } = mountPanel({
        formContainerRef: form,
        threads: [thread({ id: 'a', fieldId: '1.1' })],
      })
      await settle()

      expect(wrapper.get('.comment-field-group__chapter').text()).toBe('Deel 1 - Waarom?')
    })

    it('falls back to the first segment for an id under no known chapter', async () => {
      const form = buildFormContainer([])
      taskStoreMock.currentRootTaskId.value = '9'
      taskStoreMock.rootTasks.value = [{ id: '9', task: 'Los' }]
      parentChain['8.1'] = ''

      const { wrapper } = mountPanel({
        formContainerRef: form,
        threads: [thread({ id: 'a', fieldId: '8.1' })],
      })
      await settle()

      // Chapter '8' is not in rootTasks, so there is nothing to show at all.
      expect(wrapper.find('.comment-field-group').exists()).toBe(false)
      expect(wrapper.get('.comment-panel__empty').attributes('text')).toBe('Nog geen opmerkingen')
    })
  })

  describe('a colleague resolves the thread while you are typing', () => {
    async function panelWithOpenReply() {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
      const { wrapper, store } = mountPanel({
        role: 'owner',
        formContainerRef: form,
        threads: [thread({ id: 'root', fieldId: '1.1' })],
      })
      await settle()

      await wrapper.findAll('.comment-item__footer nldd-button')
        .find((b) => b.attributes('text') === 'Reageren')!.trigger('click')
      await nextTick()
      await setFieldValue(
        wrapper.get('.comment-reply-form nldd-multi-line-text-field'),
        'Half getypte reactie',
      )
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

      expect(wrapper.get('.comment-thread__resolved-label').text()).toContain('Noor Dijkstra')
    })

    it('falls back to a colleague when the name is unknown', async () => {
      const { wrapper, store } = await panelWithOpenReply()

      store.threads[0].resolvedAt = '2026-04-12T15:00:00Z'
      store.threads[0].resolvedByName = null
      await nextTick()

      expect(wrapper.get('.comment-thread__resolved-label').text()).toContain('een collega')
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
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
      const { wrapper, store } = mountPanel({
        role: 'owner',
        currentUserId: 'user-1',
        formContainerRef: form,
        threads: [thread({ id: 'root', fieldId: '1.1', replies: [reply('r1', 'user-1', 'Sam')] })],
      })
      await settle()

      await wrapper.get('.comment-item--reply .comment-item__body').trigger('click')
      await settle()
      expect(wrapper.find('.comment-item__edit').exists()).toBe(true)

      store.threads[0].resolvedAt = '2026-04-12T15:00:00Z'
      await nextTick()

      expect(wrapper.find('.comment-item__edit').exists()).toBe(true)
    })

    it('hides a resolved thread that has nothing open in it', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
      const { wrapper, store } = mountPanel({
        role: 'owner',
        formContainerRef: form,
        threads: [thread({ id: 'root', fieldId: '1.1' })],
      })
      await settle()

      store.threads[0].resolvedAt = '2026-04-12T15:00:00Z'
      await nextTick()

      expect(wrapper.find('.comment-thread').exists()).toBe(false)
    })

    it('brings resolved threads back when the filter is switched on', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
      const { wrapper } = mountPanel({
        role: 'owner',
        formContainerRef: form,
        activeFieldId: '1.1',
        threads: [thread({ id: 'root', fieldId: '1.1', resolvedAt: '2026-04-13T00:00:00Z' })],
      })
      await settle()
      expect(wrapper.find('.comment-thread').exists()).toBe(false)

      toggleResolved(wrapper)
      await settle()

      const card = wrapper.get('.comment-thread')
      expect(card.classes()).toContain('comment-thread--resolved')
      expect(card.attributes('background')).toBe('tinted')
      expect(positionText(wrapper)).toBe('1 van 1')
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

    it('cleans up observers and a pending timer on unmount', async () => {
      vi.useFakeTimers()
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
      const { wrapper } = mountPanel({ formContainerRef: form })
      // Schedule an update so updateTimer is non-null at unmount time.
      form.appendChild(document.createElement('span'))
      await Promise.resolve()
      wrapper.unmount()
      vi.useRealTimers()
      expect(document.body.querySelector('.comment-panel__body')).toBeNull()
    })

    it('unmounts cleanly when there is no form container (observer null)', () => {
      const { wrapper } = mountPanel({ formContainerRef: null })
      wrapper.unmount()
      expect(document.body.querySelector('.comment-panel__body')).toBeNull()
    })
  })

  describe('a question swapped in is a fresh sheet of paper', () => {
    it('drops the draft, the open reply and the open edit, and scrolls back up', async () => {
      const form = buildFormContainer([
        { id: 'label-dpia-1.1', fieldLabel: 'Eerste' },
        { id: 'label-dpia-1.2', fieldLabel: 'Tweede' },
      ])
      const { wrapper } = mountPanel({
        role: 'owner',
        currentUserId: 'user-1',
        formContainerRef: form,
        activeFieldId: '1.1',
        threads: [thread({ id: 'a', fieldId: '1.1' }), thread({ id: 'b', fieldId: '1.2' })],
      })
      await settle()

      await setFieldValue(wrapper.get('.comment-inline-form nldd-multi-line-text-field'), 'begin')
      await wrapper.findAll('.comment-item__footer nldd-button')
        .find((b) => b.attributes('text') === 'Reageren')!.trigger('click')
      await nextTick()
      expect(wrapper.find('.comment-reply-form').exists()).toBe(true)

      const scrollSpy = vi.fn()
      ;(wrapper.get('.comment-panel__body').element as HTMLElement).scrollTo = scrollSpy

      await wrapper.setProps({ activeFieldId: '1.2' })
      await settle()

      expect(wrapper.get('.comment-inline-form nldd-multi-line-text-field').attributes('value'))
        .toBe('')
      expect(wrapper.find('.comment-reply-form').exists()).toBe(false)
      expect(wrapper.find('.comment-item__edit').exists()).toBe(false)
      expect(scrollSpy).toHaveBeenCalledWith({ top: 0 })
    })

    it('keeps the draft when the question is only cleared', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
      const { wrapper } = mountPanel({
        role: 'owner',
        formContainerRef: form,
        activeFieldId: '1.1',
        threads: [thread({ id: 'a', fieldId: '1.1' })],
      })
      await settle()

      await setFieldValue(wrapper.get('.comment-inline-form nldd-multi-line-text-field'), 'begin')
      await wrapper.setProps({ activeFieldId: null })
      await settle()

      expect(wrapper.get('.comment-inline-form nldd-multi-line-text-field').attributes('value'))
        .toBe('begin')
    })
  })

  describe('scrollToField', () => {
    it('scrolls the matching label into view when the question is clicked', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
      const labelEl = document.getElementById('label-dpia-1.1') as HTMLElement
      const scrollSpy = vi.fn()
      labelEl.scrollIntoView = scrollSpy

      const { wrapper } = mountPanel({
        formContainerRef: form,
        threads: [thread({ id: 'a', fieldId: '1.1' })],
      })
      await settle()

      scrollSpy.mockClear()
      await wrapper.get('.comment-field-group__label').trigger('click')
      expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
    })

    it('does nothing when no matching label exists', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
      const { wrapper } = mountPanel({
        formContainerRef: form,
        threads: [thread({ id: 'a', fieldId: '1.1' })],
      })
      await settle()

      // Strip the id so scrollToField's [id$=...] selector finds nothing.
      ;(document.getElementById('label-dpia-1.1') as HTMLElement).id = 'gone'
      await wrapper.get('.comment-field-group__label').trigger('click')
      expect(wrapper.find('.comment-field-group').exists()).toBe(true)
    })
  })

  describe('formatDate', () => {
    it('renders a localized Dutch date in the time element', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
      const { wrapper } = mountPanel({
        formContainerRef: form,
        threads: [thread({ id: 'a', fieldId: '1.1', createdAt: '2026-04-12T10:00:00Z' })],
      })
      await settle()

      // nldd-text wraps the <time>; the machine-readable value stays on it.
      const time = wrapper.get('.comment-item__time time')
      expect(time.attributes('datetime')).toBe('2026-04-12T10:00:00Z')
      expect(time.text().length).toBeGreaterThan(0)
    })
  })

  describe('footer actions: reply, delete, resolve, reopen', () => {
    it('renders reply/delete/resolve buttons for an owner on an unresolved own thread', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
      const { wrapper, spies } = mountPanel({
        role: 'owner',
        currentUserId: 'user-1',
        formContainerRef: form,
        threads: [thread({ id: 'a', fieldId: '1.1', authorId: 'user-1' })],
      })
      await settle()

      const footerButtons = wrapper
        .findAll('.comment-item__footer nldd-button')
        .map((b) => [b.attributes('text'), b.attributes('start-icon'), b.attributes('appearance'), b.attributes('size')])
      expect(footerButtons).toEqual([
        ['Reageren', 'comment', 'neutral-transparent', 'xs'],
        ['Verwijderen', 'trash', 'critical-transparent', 'xs'],
        ['Oplossen', 'check-mark', 'accent-transparent', 'xs'],
      ])

      await wrapper.get('nldd-button[appearance="critical-transparent"]').trigger('click')
      expect(spies.deleteComment).toHaveBeenCalledWith('a')

      await wrapper.get('nldd-button[appearance="accent-transparent"]').trigger('click')
      expect(spies.resolveThread).toHaveBeenCalledWith('a')
    })

    it('shows the reopen button for a resolved thread when the user can resolve', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
      const { wrapper, spies } = mountPanel({
        role: 'owner',
        formContainerRef: form,
        threads: [thread({ id: 'a', fieldId: '1.1', resolvedAt: '2026-04-13T00:00:00Z' })],
        activeFieldId: '1.1',
      })
      await settle()
      toggleResolved(wrapper)
      await settle()

      const footerButtons = wrapper.findAll('.comment-item__footer nldd-button')
      expect(footerButtons.map((b) => b.attributes('text'))).toEqual(['Verwijderen', 'Heropenen'])

      const reopenBtn = footerButtons[1]
      expect(reopenBtn.attributes('start-icon')).toBe('undo')
      expect(reopenBtn.attributes('appearance')).toBe('neutral-transparent')
      await reopenBtn.trigger('click')
      expect(spies.reopenThread).toHaveBeenCalledWith('a')
    })

    it('does not render delete for someone else\'s comment when not owner', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
      const { wrapper } = mountPanel({
        role: 'editor',
        currentUserId: 'user-1',
        formContainerRef: form,
        threads: [thread({ id: 'a', fieldId: '1.1', authorId: 'someone-else' })],
      })
      await settle()

      expect(wrapper.find('nldd-button[appearance="critical-transparent"]').exists()).toBe(false)
      const texts = wrapper.findAll('.comment-item__footer nldd-button').map((b) => b.attributes('text'))
      expect(texts).toEqual(['Reageren', 'Oplossen'])
    })

    it('does not render resolve controls for a commenter (canResolve false)', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
      const { wrapper } = mountPanel({
        role: 'commenter',
        currentUserId: 'user-1',
        formContainerRef: form,
        threads: [thread({ id: 'a', fieldId: '1.1', authorId: 'someone-else' })],
      })
      await settle()

      const texts = wrapper.findAll('.comment-item__footer nldd-button').map((b) => b.attributes('text'))
      expect(texts).toEqual(['Reageren'])
      expect(wrapper.find('nldd-button[appearance="critical-transparent"]').exists()).toBe(false)
    })
  })

  describe('reply flow', () => {
    function panelWithThread(role = 'editor') {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
      return mountPanel({
        role,
        formContainerRef: form,
        threads: [thread({ id: 'a', fieldId: '1.1' })],
      })
    }

    async function openReplyForm(wrapper: Panel) {
      const replyBtn = wrapper.findAll('nldd-button').find((b) => b.attributes('text') === 'Reageren')!
      await replyBtn.trigger('click')
      await nextTick()
      return wrapper.get('.comment-reply-form')
    }

    it('opens the reply form, submits a reply, then closes', async () => {
      const { wrapper, spies } = panelWithThread()
      await settle()

      const replyForm = await openReplyForm(wrapper)
      await setFieldValue(replyForm.get('nldd-multi-line-text-field'), 'Mijn reactie')

      await replyForm.get('nldd-button[appearance="primary"]').trigger('click')
      expect(spies.createReply).toHaveBeenCalledWith('a', '1.1', 'Mijn reactie')
      await nextTick()
      expect(wrapper.find('.comment-reply-form').exists()).toBe(false)
    })

    it('does not submit a reply when the body is only whitespace', async () => {
      const { wrapper, spies } = panelWithThread()
      await settle()

      const replyForm = await openReplyForm(wrapper)
      await setFieldValue(replyForm.get('nldd-multi-line-text-field'), '   ')
      await replyForm.get('nldd-button[appearance="primary"]').trigger('click')
      expect(spies.createReply).not.toHaveBeenCalled()
    })

    it('cancels the reply form via the cancel button', async () => {
      const { wrapper } = panelWithThread()
      await settle()

      await openReplyForm(wrapper)
      const cancel = wrapper.findAll('.comment-reply-form nldd-button')
        .find((b) => b.attributes('text') === 'Annuleer')!
      await cancel.trigger('click')
      await nextTick()
      expect(wrapper.find('.comment-reply-form').exists()).toBe(false)
    })

    it('submits a reply via meta+enter keydown', async () => {
      const { wrapper, spies } = panelWithThread()
      await settle()

      const replyForm = await openReplyForm(wrapper)
      const field = replyForm.get('nldd-multi-line-text-field')
      await setFieldValue(field, 'Via toetsenbord')
      await field.trigger('keydown.enter.meta')
      expect(spies.createReply).toHaveBeenCalledWith('a', '1.1', 'Via toetsenbord')
    })

    it('cancels the reply form via the escape key', async () => {
      const { wrapper } = panelWithThread()
      await settle()

      const replyForm = await openReplyForm(wrapper)
      await replyForm.get('nldd-multi-line-text-field').trigger('keydown.escape')
      await nextTick()
      expect(wrapper.find('.comment-reply-form').exists()).toBe(false)
    })

    it('keeps the reply text when posting the reply fails', async () => {
      const { wrapper, spies } = panelWithThread('owner')
      await settle()

      const replyForm = await openReplyForm(wrapper)
      spies.createReply.mockRejectedValueOnce(new Error('netwerkfout'))
      await setFieldValue(replyForm.get('nldd-multi-line-text-field'), 'Mijn reactie')
      await replyForm.get('nldd-button[appearance="primary"]').trigger('click')
      await nextTick()

      expect(wrapper.find('.comment-reply-form').exists()).toBe(true)
      expect(wrapper.get('.comment-reply-form nldd-multi-line-text-field').attributes('value'))
        .toBe('Mijn reactie')
    })
  })

  describe('inline new comment flow', () => {
    function panelOnEmptyField() {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
      return mountPanel({
        role: 'owner',
        formContainerRef: form,
        threads: [],
        activeFieldId: '1.1',
      })
    }

    it('submits a new comment via the Plaatsen button', async () => {
      const { wrapper, spies } = panelOnEmptyField()
      await settle()

      const inline = wrapper.get('.comment-inline-form')
      await setFieldValue(inline.get('nldd-multi-line-text-field'), 'Een nieuwe opmerking')

      const submit = inline.get('nldd-button[appearance="primary"]')
      expect(submit.attributes('text')).toBe('Plaatsen')
      expect(submit.attributes('disabled')).toBeUndefined()
      await submit.trigger('click')
      expect(spies.createComment).toHaveBeenCalledWith('1.1', 'Een nieuwe opmerking')
    })

    it('keeps what you typed when placing the comment fails', async () => {
      const { wrapper, spies } = panelOnEmptyField()
      await settle()

      spies.createComment.mockRejectedValueOnce(new Error('netwerkfout'))

      const inline = wrapper.get('.comment-inline-form')
      const textarea = inline.get('nldd-multi-line-text-field')
      await setFieldValue(textarea, 'Kostbare tekst')
      await inline.get('nldd-button[appearance="primary"]').trigger('click')
      await nextTick()

      expect(textarea.attributes('value')).toBe('Kostbare tekst')
    })

    it('disables the Plaatsen button while the body is empty', async () => {
      const { wrapper, spies } = panelOnEmptyField()
      await settle()

      const submit = wrapper.get('.comment-inline-form nldd-button[appearance="primary"]')
      expect(submit.attributes('disabled')).toBeDefined()

      await submit.trigger('click')
      expect(spies.createComment).not.toHaveBeenCalled()
    })

    it('submits a new comment via meta+enter keydown', async () => {
      const { wrapper, spies } = panelOnEmptyField()
      await settle()

      const field = wrapper.get('.comment-inline-form nldd-multi-line-text-field')
      await setFieldValue(field, 'Toetsenbord opmerking')
      await field.trigger('keydown.enter.meta')
      expect(spies.createComment).toHaveBeenCalledWith('1.1', 'Toetsenbord opmerking')
    })

    it('clears the body on escape', async () => {
      const { wrapper } = panelOnEmptyField()
      await settle()

      const field = wrapper.get('.comment-inline-form nldd-multi-line-text-field')
      await setFieldValue(field, 'iets')
      await field.trigger('keydown.escape')
      await nextTick()
      expect(field.attributes('value')).toBe('')
    })

    // Nothing typed is nothing to clear, so the button is not there to ignore.
    it('offers Wissen only once something has been typed', async () => {
      const { wrapper } = panelOnEmptyField()
      await settle()

      const wissen = () => wrapper.findAll('.comment-inline-form nldd-button')
        .find((b) => b.attributes('text') === 'Wissen')
      expect(wissen()).toBeUndefined()

      const field = wrapper.get('.comment-inline-form nldd-multi-line-text-field')
      await setFieldValue(field, 'iets')
      await wissen()!.trigger('click')
      await nextTick()

      expect(field.attributes('value')).toBe('')
      expect(wissen()).toBeUndefined()
    })

    // The question on screen always has a comment box: the panel is where you
    // write, whether or not the question already has a thread.
    it('offers the comment box on a question you walked to', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
      const { wrapper, spies } = mountPanel({
        role: 'owner',
        formContainerRef: form,
        threads: [thread({ id: 'a', fieldId: '1.1' })],
      })
      await settle()

      const inline = wrapper.get('.comment-inline-form')
      await setFieldValue(inline.get('nldd-multi-line-text-field'), 'Nog een opmerking')
      await inline.get('nldd-button[appearance="primary"]').trigger('click')
      expect(spies.createComment).toHaveBeenCalledWith('1.1', 'Nog een opmerking')
    })
  })

  describe('edit flow (own comment)', () => {
    function panelWithOwnComment(body = 'origineel') {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
      return mountPanel({
        role: 'owner',
        currentUserId: 'user-1',
        formContainerRef: form,
        threads: [thread({ id: 'a', fieldId: '1.1', authorId: 'user-1', body })],
      })
    }

    it('starts editing on body click and submits the edit', async () => {
      const { wrapper, spies } = panelWithOwnComment()
      await settle()

      const body = wrapper.get('.comment-item__body')
      expect(body.classes()).toContain('comment-item__body--editable')
      expect(body.attributes('role')).toBe('button')
      await body.trigger('click')
      await settle()

      const editBox = wrapper.get('.comment-item__edit')
      const field = editBox.get('nldd-multi-line-text-field')
      expect(field.attributes('value')).toBe('origineel')
      await setFieldValue(field, 'aangepast')

      await editBox.get('nldd-button[appearance="primary"]').trigger('click')
      expect(spies.updateComment).toHaveBeenCalledWith('a', 'aangepast')
      await nextTick()
      expect(wrapper.find('.comment-item__edit').exists()).toBe(false)
    })

    it('stays in edit mode with your text when saving the edit fails', async () => {
      const { wrapper, spies } = panelWithOwnComment()
      await settle()

      await wrapper.get('.comment-item__body').trigger('click')
      await settle()

      spies.updateComment.mockRejectedValueOnce(new Error('netwerkfout'))

      const editBox = wrapper.get('.comment-item__edit')
      await setFieldValue(editBox.get('nldd-multi-line-text-field'), 'aangepast')
      await editBox.get('nldd-button[appearance="primary"]').trigger('click')
      await nextTick()

      expect(wrapper.find('.comment-item__edit').exists()).toBe(true)
      expect(wrapper.get('.comment-item__edit nldd-multi-line-text-field').attributes('value'))
        .toBe('aangepast')
    })

    it('starts editing via the enter key on the body', async () => {
      const { wrapper } = panelWithOwnComment()
      await settle()

      await wrapper.get('.comment-item__body').trigger('keydown.enter')
      await settle()
      expect(wrapper.find('.comment-item__edit').exists()).toBe(true)
    })

    it('does not submit the edit when the body is empty', async () => {
      const { wrapper, spies } = panelWithOwnComment()
      await settle()

      await wrapper.get('.comment-item__body').trigger('click')
      await settle()

      const editBox = wrapper.get('.comment-item__edit')
      await setFieldValue(editBox.get('nldd-multi-line-text-field'), '   ')
      await editBox.get('nldd-button[appearance="primary"]').trigger('click')
      expect(spies.updateComment).not.toHaveBeenCalled()
    })

    it('cancels editing via the Annuleer button', async () => {
      const { wrapper } = panelWithOwnComment()
      await settle()

      await wrapper.get('.comment-item__body').trigger('click')
      await settle()

      const cancel = wrapper.findAll('.comment-item__edit nldd-button')
        .find((b) => b.attributes('text') === 'Annuleer')!
      await cancel.trigger('click')
      await nextTick()
      expect(wrapper.find('.comment-item__edit').exists()).toBe(false)
    })

    it('submits the edit via meta+enter and cancels via escape', async () => {
      const { wrapper, spies } = panelWithOwnComment()
      await settle()

      await wrapper.get('.comment-item__body').trigger('click')
      await settle()

      const field = wrapper.get('.comment-item__edit nldd-multi-line-text-field')
      await setFieldValue(field, 'via meta enter')
      await field.trigger('keydown.enter.meta')
      expect(spies.updateComment).toHaveBeenCalledWith('a', 'via meta enter')

      await nextTick()
      await wrapper.get('.comment-item__body').trigger('click')
      await settle()
      await wrapper.get('.comment-item__edit nldd-multi-line-text-field').trigger('keydown.escape')
      await nextTick()
      expect(wrapper.find('.comment-item__edit').exists()).toBe(false)
    })

    it('does not allow editing a foreign comment (non-editable body)', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
      const { wrapper, spies } = mountPanel({
        role: 'owner',
        currentUserId: 'user-1',
        formContainerRef: form,
        threads: [thread({ id: 'a', fieldId: '1.1', authorId: 'someone-else' })],
      })
      await settle()

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
      const { wrapper, spies } = mountPanel({
        role: 'editor',
        currentUserId: 'user-1',
        formContainerRef: form,
        threads: [thread({ id: 'root', fieldId: '1.1', replies: [reply('r1', 'user-1', 'Sam')] })],
      })
      await settle()

      const replies = wrapper.findAll('.comment-item--reply')
      expect(replies).toHaveLength(1)
      expect(replies[0].text()).toContain('reactie r1')

      expect(replies[0].get('.comment-item__body').classes())
        .toContain('comment-item__body--editable')

      await replies[0].findAll('nldd-button[appearance="critical-transparent"]')[0].trigger('click')
      expect(spies.deleteComment).toHaveBeenCalledWith('r1')
    })

    it('edits a reply via clicking its body', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
      const { wrapper, spies } = mountPanel({
        role: 'editor',
        currentUserId: 'user-1',
        formContainerRef: form,
        threads: [thread({ id: 'root', fieldId: '1.1', replies: [reply('r1', 'user-1', 'Sam')] })],
      })
      await settle()

      await wrapper.get('.comment-item--reply .comment-item__body').trigger('click')
      await settle()

      const editBox = wrapper.get('.comment-item--reply .comment-item__edit')
      await setFieldValue(editBox.get('nldd-multi-line-text-field'), 'reactie aangepast')
      await editBox.get('nldd-button[appearance="primary"]').trigger('click')
      expect(spies.updateComment).toHaveBeenCalledWith('r1', 'reactie aangepast')
    })

    it('edits a reply via the enter key on its body', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
      const { wrapper } = mountPanel({
        role: 'editor',
        currentUserId: 'user-1',
        formContainerRef: form,
        threads: [thread({ id: 'root', fieldId: '1.1', replies: [reply('r1', 'user-1', 'Sam')] })],
      })
      await settle()

      await wrapper.get('.comment-item--reply .comment-item__body').trigger('keydown.enter')
      await settle()
      expect(wrapper.find('.comment-item--reply .comment-item__edit').exists()).toBe(true)
    })

    it('does not render a reply footer when the user cannot comment', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
      const { wrapper } = mountPanel({
        role: 'viewer',
        currentUserId: 'user-1',
        formContainerRef: form,
        threads: [thread({
          id: 'root',
          fieldId: '1.1',
          replies: [reply('r1', 'user-1', 'Sam')],
          resolvedAt: '2026-04-13T00:00:00Z',
        })],
        activeFieldId: '1.1',
      })
      await settle()
      toggleResolved(wrapper)
      await settle()

      expect(wrapper.get('.comment-item--reply').find('.comment-item__footer').exists()).toBe(false)
    })

    it('does not allow editing a foreign reply', async () => {
      const form = buildFormContainer([{ id: 'label-dpia-1.1', fieldLabel: 'Veld' }])
      const { wrapper } = mountPanel({
        role: 'editor',
        currentUserId: 'user-1',
        formContainerRef: form,
        threads: [thread({ id: 'root', fieldId: '1.1', replies: [reply('r1', 'other-user', 'Iemand')] })],
      })
      await settle()

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
    function setupOf(wrapper: VueWrapper) {
      return (wrapper.vm.$ as unknown as { setupState: Record<string, any> }).setupState
    }

    // With nothing to walk the nav row is not rendered, so neither of these is
    // read from the template; they still have to hold up on their own.
    it('has no position and no index while there is nothing to walk', () => {
      const { wrapper } = mountPanel({ threads: [] })
      expect(setupOf(wrapper).positionLabel).toBe('')
      expect(setupOf(wrapper).currentIndex).toBe(-1)
    })

    // With no question to show the body renders the empty state instead, so
    // shownEntries is never read from the template.
    it('has nothing to show while there is no question', () => {
      const { wrapper } = mountPanel({ threads: [] })
      expect(setupOf(wrapper).shownEntries).toEqual([])
    })

    it('scrollToField returns early when there is no form container', () => {
      const { wrapper } = mountPanel({ formContainerRef: null })
      expect(() => setupOf(wrapper).scrollToField('1.1')).not.toThrow()
    })

    it('goToEntry returns early for an index that is no question', async () => {
      const { wrapper } = mountPanel({ formContainerRef: null, threads: [] })
      await setupOf(wrapper).goToEntry(3)
      expect(selected(wrapper)).toEqual([])
    })

    it('submitComment returns early when the body is empty', async () => {
      const { wrapper, spies } = mountPanel({ formContainerRef: null })
      await setupOf(wrapper).submitComment('1.1')
      expect(spies.createComment).not.toHaveBeenCalled()
    })

    it('submitReply returns early when the body is empty', async () => {
      const { wrapper, spies } = mountPanel({ formContainerRef: null })
      await setupOf(wrapper).submitReply('parent', '1.1')
      expect(spies.createReply).not.toHaveBeenCalled()
    })

    it('submitEdit returns early when there is no editing id', async () => {
      const { wrapper, spies } = mountPanel({ formContainerRef: null })
      await setupOf(wrapper).submitEdit()
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
      await settle()

      const field = wrapper.get('.comment-inline-form nldd-multi-line-text-field')
      const host = field.element as HTMLElement & { value?: string }
      host.value = 'Zonder detail'
      host.dispatchEvent(new Event('input'))
      await nextTick()

      await wrapper.get('.comment-inline-form nldd-button[appearance="primary"]').trigger('click')
      expect(spies.createComment).toHaveBeenCalledWith('1.1', 'Zonder detail')
    })
  })
})

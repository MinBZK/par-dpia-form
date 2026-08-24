import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ProgressTracker from '../../src/components/ProgressTracker.vue'
import { type FlatTask, useTaskStore } from '../../src/stores/tasks'
import { useAnswerStore } from '../../src/stores/answers'
import { PERSISTENCE_KEY, type PersistenceProvider } from '../../src/persistence'
import { FormType } from '../../src/models/dpia'

// The tracker builds a vertical step list on nldd-list / nldd-list-item
// (stubbed in jsdom via the @nldd alias), so tests assert on host attributes
// and light-DOM children: <nldd-list-item class="toc-item toc-item--{node}"
// button current> with a <nldd-timeline-track-cell variant="step" status
// position> whose marker carries icon="check-mark" (done), a slotted
// .toc-progress-core (started) or text="<num>" (the chapter number).

function flatTask(partial: Partial<FlatTask> & { id: string }): FlatTask {
  return {
    task: `Task ${partial.id}`,
    type: ['task_group'],
    parentId: null,
    childrenIds: [],
    is_official_id: true,
    ...partial,
  } as FlatTask
}

function seedRootTasks(taskStore: ReturnType<typeof useTaskStore>, tasks: FlatTask[]) {
  const ns = taskStore.activeNamespace
  const map: Record<string, FlatTask> = {}
  for (const t of tasks) map[t.id] = t
  taskStore.flatTasks[ns] = map
  taskStore.rootTaskIds[ns] = tasks.map(t => t.id)
}

function seedAnswers(
  taskStore: ReturnType<typeof useTaskStore>,
  answerStore: ReturnType<typeof useAnswerStore>,
  entries: Record<string, unknown>,
) {
  const ns = taskStore.activeNamespace
  answerStore.answers[ns] = {}
  for (const [key, value] of Object.entries(entries)) {
    answerStore.answers[ns][key] = { value: value as never }
  }
}

function mountTracker(
  opts: {
    props?: { disabled?: boolean; navigable?: boolean; commentedTaskIds?: string[] }
    persistence?: Partial<PersistenceProvider> | null
  } = {},
) {
  const provide: Record<symbol, unknown> = {}
  // persistence === null is left unprovided so inject() returns undefined.
  if (opts.persistence !== null) {
    provide[PERSISTENCE_KEY as unknown as symbol] = opts.persistence ?? {}
  }
  return mount(ProgressTracker, {
    props: opts.props ?? {},
    global: { provide },
  })
}

function items(wrapper: ReturnType<typeof mountTracker>) {
  return wrapper.findAll('.toc-item')
}
function titles(wrapper: ReturnType<typeof mountTracker>): (string | undefined)[] {
  return wrapper.findAll('.toc-title').map(t => t.attributes('text'))
}
function nodeKind(item: ReturnType<typeof items>[number]): string {
  return ['done', 'current', 'progress', 'open'].find(k => item.classes().includes(`toc-item--${k}`)) ?? '?'
}
function trackStatus(item: ReturnType<typeof items>[number]): string | undefined {
  return item.find('nldd-timeline-track-cell').attributes('status')
}
function markerIcon(item: ReturnType<typeof items>[number]): string | undefined {
  return item.find('nldd-timeline-track-cell').attributes('icon')
}
function markerText(item: ReturnType<typeof items>[number]): string | undefined {
  return item.find('nldd-timeline-track-cell').attributes('text')
}

describe('ProgressTracker.vue', () => {
  let taskStore: ReturnType<typeof useTaskStore>
  let answerStore: ReturnType<typeof useAnswerStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    taskStore = useTaskStore()
    answerStore = useAnswerStore()
  })

  describe('structuur', () => {
    it('rendert de titel en een nldd-list met accessible-label en een timeline-track per stap', () => {
      seedRootTasks(taskStore, [flatTask({ id: '0', task: 'Inleiding' })])

      const wrapper = mountTracker()
      expect(wrapper.find('.progress-tracker__title').text()).toBe('Inhoudsopgave')
      const list = wrapper.find('nldd-list')
      expect(list.exists()).toBe(true)
      expect(list.attributes('accessible-label')).toBe('Inhoudsopgave')
      const cells = wrapper.findAll('nldd-timeline-track-cell')
      expect(cells.length).toBe(items(wrapper).length)
      for (const cell of cells) expect(cell.attributes('variant')).toBe('step')
    })

    it('sluit zonder conclusietaak af met een niet-navigeerbaar "Proces voltooid"-item (geen button-attribuut)', () => {
      seedRootTasks(taskStore, [flatTask({ id: '0', task: 'Inleiding' })])

      const wrapper = mountTracker({ props: { navigable: true } })
      const last = items(wrapper)[items(wrapper).length - 1]

      expect(last.find('.toc-title').attributes('text')).toBe('Proces voltooid')
      expect(markerText(last)).toBeUndefined()
      expect(nodeKind(last)).toBe('open')
      expect(markerIcon(last)).toBeUndefined()
      // Not navigable -> no button attribute on the list-item.
      expect(last.attributes('button')).toBeUndefined()
    })
  })

  describe('regularTasks / conclusionTask splitsing en childOf', () => {
    it('zet een signing-taak als conclusie-item achteraan met child first/between/last', () => {
      seedRootTasks(taskStore, [
        flatTask({ id: '0', task: 'Inleiding' }),
        flatTask({ id: '1', task: 'Vragen' }),
        flatTask({ id: '2', task: 'Ondertekening', type: ['signing'], is_official_id: true }),
      ])
      taskStore.currentRootTaskId[FormType.DPIA] = '0'

      const wrapper = mountTracker({ props: { navigable: true } })
      // The number sits in the step marker, not in the title.
      expect(titles(wrapper)).toEqual(['Inleiding', 'Vragen', 'Ondertekening'])
      expect(titles(wrapper)).not.toContain('Proces voltooid')
      expect(wrapper.findAll('nldd-timeline-track-cell').map(c => c.attributes('text')))
        .toEqual(['0', '1', undefined])

      const positions = wrapper.findAll('nldd-timeline-track-cell').map(c => c.attributes('position'))
      expect(positions).toEqual(['first', 'between', 'last'])
    })

    it('markeert een lijst met precies een stap als position="only" (geen lijnstompjes)', () => {
      seedRootTasks(taskStore, [])

      const wrapper = mountTracker()
      const cells = wrapper.findAll('nldd-timeline-track-cell')
      expect(cells).toHaveLength(1)
      expect(cells[0].attributes('position')).toBe('only')
      expect(titles(wrapper)).toEqual(['Proces voltooid'])
    })

    it('behandelt een root-taak zonder type als reguliere stap (optional chaining falsy)', () => {
      const noType = flatTask({ id: '0', task: 'Geen type' })
      ;(noType as { type?: unknown }).type = undefined

      seedRootTasks(taskStore, [noType])

      const wrapper = mountTracker()
      expect(titles(wrapper)).toEqual(['Geen type', 'Proces voltooid'])
      expect(markerText(items(wrapper)[0])).toBe('0')
    })
  })

  describe('stepParts: nummer en titel', () => {
    it('toont geen nummer wanneer is_official_id false is', () => {
      seedRootTasks(taskStore, [flatTask({ id: '0', task: 'Zonder prefix', is_official_id: false })])

      const wrapper = mountTracker()
      expect(markerText(items(wrapper)[0])).toBeUndefined()
      expect(items(wrapper)[0].find('.toc-title').attributes('text')).toBe('Zonder prefix')
    })

    it('zet het nummer voor een officieel id in de marker van een gewone taak', () => {
      seedRootTasks(taskStore, [flatTask({ id: '3', task: 'Met nummer', is_official_id: true, type: ['task_group'] })])

      const wrapper = mountTracker()
      expect(markerText(items(wrapper)[0])).toBe('3')
      expect(items(wrapper)[0].find('.toc-title').attributes('text')).toBe('Met nummer')
    })

    it('toont geen nummer voor een informational taak met officieel id (rechter OR-tak)', () => {
      seedRootTasks(taskStore, [flatTask({ id: '0', task: 'Toelichting', type: ['informational'], is_official_id: true })])

      const wrapper = mountTracker()
      expect(markerText(items(wrapper)[0])).toBeUndefined()
      expect(items(wrapper)[0].find('.toc-title').attributes('text')).toBe('Toelichting')
    })

    it('toont geen nummer voor een signing-taak met officieel id', () => {
      seedRootTasks(taskStore, [
        flatTask({ id: '0', task: 'Inleiding' }),
        flatTask({ id: '2', task: 'Slot', type: ['signing'], is_official_id: true }),
      ])

      const wrapper = mountTracker()
      const last = items(wrapper)[items(wrapper).length - 1]
      expect(markerText(last)).toBeUndefined()
      expect(last.find('.toc-title').attributes('text')).toBe('Slot')
    })
  })

  describe('describe(): done / current / open + status-attribuut', () => {
    it('markeert een voltooide stap als done (past + check-marker + ", voltooid"), open stap als future', () => {
      seedRootTasks(taskStore, [
        flatTask({ id: '0', task: 'Inleiding' }),
        flatTask({ id: '1', task: 'Vragen' }),
        flatTask({ id: '2', task: 'Slot' }),
      ])
      taskStore.currentRootTaskId[FormType.DPIA] = '2'
      taskStore.completedRootTaskIds[FormType.DPIA] = new Set(['1'])

      const wrapper = mountTracker({ props: { navigable: true } })
      const done = items(wrapper)[1]
      const open = items(wrapper)[0]

      expect(nodeKind(done)).toBe('done')
      expect(trackStatus(done)).toBe('past')
      // The marker carries both: the chapter number and, through its past
      // status, that the chapter is done. No second tick at the row end.
      expect(markerIcon(done)).toBeUndefined()
      expect(markerText(done)).toBe('1')
      expect(done.find('.toc-done').exists()).toBe(false)
      expect(done.find('.sr-only').text()).toBe(', voltooid')
      expect(done.attributes('current')).toBeUndefined()

      expect(nodeKind(open)).toBe('open')
      expect(trackStatus(open)).toBe('future')
      expect(markerIcon(open)).toBeUndefined()
      expect(markerText(open)).toBe('0')
      expect(open.find('.sr-only').exists()).toBe(false)
    })

    it('markeert de huidige, niet-voltooide stap als current met nummer en het current-attribuut', () => {
      seedRootTasks(taskStore, [
        flatTask({ id: '0', task: 'Inleiding' }),
        flatTask({ id: '1', task: 'Vragen' }),
      ])
      taskStore.currentRootTaskId[FormType.DPIA] = '1'

      const wrapper = mountTracker({ props: { navigable: true } })
      const current = items(wrapper)[1]

      expect(nodeKind(current)).toBe('current')
      expect(trackStatus(current)).toBe('current')
      expect(markerText(current)).toBe('1')
      expect(current.attributes('current')).toBe('true')
      expect(markerIcon(current)).toBeUndefined()
    })

    it('een voltooide huidige stap houdt de check (node done) maar krijgt ook het current-attribuut', () => {
      seedRootTasks(taskStore, [flatTask({ id: '0', task: 'Inleiding' })])
      taskStore.currentRootTaskId[FormType.DPIA] = '0'
      taskStore.completedRootTaskIds[FormType.DPIA] = new Set(['0'])

      const wrapper = mountTracker({ props: { navigable: true } })
      const first = items(wrapper)[0]

      expect(nodeKind(first)).toBe('done')
      expect(trackStatus(first)).toBe('past')
      expect(first.attributes('current')).toBe('true')
    })

    it('toont geen done/current wanneer disabled: alles open (future) zonder current-attribuut', () => {
      seedRootTasks(taskStore, [
        flatTask({ id: '0', task: 'Inleiding' }),
        flatTask({ id: '1', task: 'Vragen' }),
      ])
      taskStore.currentRootTaskId[FormType.DPIA] = '0'
      taskStore.completedRootTaskIds[FormType.DPIA] = new Set(['1'])

      const wrapper = mountTracker({ props: { disabled: true, navigable: true } })
      for (const item of items(wrapper)) {
        expect(nodeKind(item)).toBe('open')
        expect(trackStatus(item)).toBe('future')
        expect(item.attributes('current')).toBeUndefined()
        expect(markerIcon(item)).toBeUndefined()
      }
    })

    it('geeft een voltooid gemarkeerde informational stap geen check (node open)', () => {
      seedRootTasks(taskStore, [
        flatTask({ id: '0', task: 'Inleiding' }),
        flatTask({ id: '1', task: 'Toelichting', type: ['informational'], is_official_id: false }),
      ])
      taskStore.currentRootTaskId[FormType.DPIA] = '0'
      taskStore.completedRootTaskIds[FormType.DPIA] = new Set(['1'])

      const wrapper = mountTracker({ props: { navigable: true } })
      expect(nodeKind(items(wrapper)[1])).toBe('open')
      expect(markerIcon(items(wrapper)[1])).toBeUndefined()
    })
  })

  describe('deels ingevuld (progress)', () => {
    it('toont een sectie met antwoorden (niet voltooid, niet huidig) als progress met kern in de marker', () => {
      seedRootTasks(taskStore, [
        flatTask({ id: '0', task: 'Inleiding' }),
        flatTask({ id: '1', task: 'Vragen' }),
        flatTask({ id: '2', task: 'Slot' }),
      ])
      taskStore.currentRootTaskId[FormType.DPIA] = '0'
      seedAnswers(taskStore, answerStore, { '2.1': 'iets ingevuld' })

      const wrapper = mountTracker({ props: { navigable: true } })
      const partial = items(wrapper)[2]

      expect(nodeKind(partial)).toBe('progress')
      expect(trackStatus(partial)).toBe('future')
      // The core replaces the number in the marker.
      expect(partial.find('nldd-timeline-track-cell .toc-progress-core').exists()).toBe(true)
      expect(markerText(partial)).toBeUndefined()
      expect(markerIcon(partial)).toBeUndefined()
      expect(partial.findAll('.sr-only').some(s => s.text() === ', deels ingevuld')).toBe(true)
    })

    it('laat done en current voorgaan op progress', () => {
      seedRootTasks(taskStore, [
        flatTask({ id: '0', task: 'Inleiding' }),
        flatTask({ id: '1', task: 'Vragen' }),
      ])
      taskStore.currentRootTaskId[FormType.DPIA] = '1'
      taskStore.completedRootTaskIds[FormType.DPIA] = new Set(['0'])
      // Both sections have answers, but 0 is completed (done) and 1 is current.
      seedAnswers(taskStore, answerStore, { '0.1': 'a', '1.1': 'b' })

      const wrapper = mountTracker({ props: { navigable: true } })
      expect(nodeKind(items(wrapper)[0])).toBe('done')
      expect(nodeKind(items(wrapper)[1])).toBe('current')
      expect(wrapper.findAll('.toc-progress-core')).toHaveLength(0)
    })

    it('onderdrukt progress wanneer disabled', () => {
      seedRootTasks(taskStore, [
        flatTask({ id: '0', task: 'Inleiding' }),
        flatTask({ id: '1', task: 'Vragen' }),
      ])
      seedAnswers(taskStore, answerStore, { '1.1': 'iets' })

      const wrapper = mountTracker({ props: { disabled: true, navigable: true } })
      expect(nodeKind(items(wrapper)[1])).toBe('open')
      expect(wrapper.findAll('.toc-progress-core')).toHaveLength(0)
    })

    it('telt lege waarden niet als ingevuld (lege string, lege array, null)', () => {
      seedRootTasks(taskStore, [
        flatTask({ id: '0', task: 'Inleiding' }),
        flatTask({ id: '1', task: 'A' }),
        flatTask({ id: '2', task: 'B' }),
        flatTask({ id: '3', task: 'C' }),
      ])
      taskStore.currentRootTaskId[FormType.DPIA] = '0'
      seedAnswers(taskStore, answerStore, { '1.1': '', '2.1': [], '3.1': null })

      const wrapper = mountTracker({ props: { navigable: true } })
      for (const i of [1, 2, 3]) expect(nodeKind(items(wrapper)[i])).toBe('open')
    })

    it('telt gevulde waarden wel (string, array, afbeelding-object)', () => {
      seedRootTasks(taskStore, [
        flatTask({ id: '0', task: 'Inleiding' }),
        flatTask({ id: '1', task: 'A' }),
        flatTask({ id: '2', task: 'B' }),
        flatTask({ id: '3', task: 'C' }),
      ])
      taskStore.currentRootTaskId[FormType.DPIA] = '0'
      seedAnswers(taskStore, answerStore, { '1.1': 'tekst', '2.1': ['een'], '3.1': { data: 'x' } })

      const wrapper = mountTracker({ props: { navigable: true } })
      for (const i of [1, 2, 3]) expect(nodeKind(items(wrapper)[i])).toBe('progress')
    })
  })

  describe('opmerking-indicator', () => {
    it('toont het opmerking-icoon + sr-only voor secties in commentedTaskIds', () => {
      seedRootTasks(taskStore, [
        flatTask({ id: '0', task: 'Inleiding' }),
        flatTask({ id: '1', task: 'Vragen' }),
      ])

      const wrapper = mountTracker({ props: { navigable: true, commentedTaskIds: ['1'] } })
      const withComment = items(wrapper)[1]
      const without = items(wrapper)[0]

      expect(withComment.find('.toc-comment').exists()).toBe(true)
      expect(withComment.findAll('.sr-only').some(s => s.text() === ', bevat opmerkingen')).toBe(true)
      expect(without.find('.toc-comment').exists()).toBe(false)
    })

    it('toont geen opmerking-icoon zonder commentedTaskIds (default lege lijst)', () => {
      seedRootTasks(taskStore, [flatTask({ id: '0', task: 'Inleiding' })])

      const wrapper = mountTracker({ props: { navigable: true } })
      expect(wrapper.findAll('.toc-comment')).toHaveLength(0)
    })
  })

  describe('navigeerbaarheid (button-attribuut)', () => {
    it('rendert list-items met button-attribuut wanneer navigable en niet disabled', () => {
      seedRootTasks(taskStore, [flatTask({ id: '0', task: 'Inleiding' })])

      const wrapper = mountTracker({ props: { navigable: true } })
      expect(items(wrapper)[0].attributes('button')).toBe('true')
    })

    it('rendert list-items zonder button-attribuut wanneer niet navigable', () => {
      seedRootTasks(taskStore, [flatTask({ id: '0', task: 'Inleiding' })])

      const wrapper = mountTracker({ props: { navigable: false } })
      expect(items(wrapper)[0].attributes('button')).toBeUndefined()
    })

    it('rendert list-items zonder button-attribuut wanneer disabled, ook al is navigable true', () => {
      seedRootTasks(taskStore, [flatTask({ id: '0', task: 'Inleiding' })])

      const wrapper = mountTracker({ props: { disabled: true, navigable: true } })
      expect(items(wrapper)[0].attributes('button')).toBeUndefined()
    })
  })

  describe('goToTask', () => {
    it('flusht openstaande opslag (wanneer flushSave bestaat) en navigeert bij klik', async () => {
      seedRootTasks(taskStore, [
        flatTask({ id: '0', task: 'Inleiding' }),
        flatTask({ id: '1', task: 'Vragen' }),
      ])
      const setRootTask = vi.spyOn(taskStore, 'setRootTask')
      const flushSave = vi.fn()

      const wrapper = mountTracker({ props: { navigable: true }, persistence: { flushSave } })
      await items(wrapper)[1].trigger('click')

      expect(flushSave).toHaveBeenCalledTimes(1)
      expect(setRootTask).toHaveBeenCalledWith('1')
    })

    it('navigeert zonder fout wanneer persistence geen flushSave heeft (&& rechterkant falsy)', async () => {
      seedRootTasks(taskStore, [flatTask({ id: '0', task: 'Inleiding' })])
      const setRootTask = vi.spyOn(taskStore, 'setRootTask')

      const wrapper = mountTracker({ props: { navigable: true }, persistence: {} })
      await items(wrapper)[0].trigger('click')

      expect(setRootTask).toHaveBeenCalledWith('0')
    })

    it('navigeert zonder fout wanneer persistence helemaal niet is geleverd (optional chaining falsy)', async () => {
      seedRootTasks(taskStore, [
        flatTask({ id: '0', task: 'Inleiding' }),
        flatTask({ id: '2', task: 'Slot', type: ['signing'] }),
      ])
      const setRootTask = vi.spyOn(taskStore, 'setRootTask')

      const wrapper = mountTracker({ props: { navigable: true }, persistence: null })
      const last = items(wrapper)[items(wrapper).length - 1]
      await last.trigger('click')

      expect(setRootTask).toHaveBeenCalledWith('2')
    })

    it('doet niets bij klik in disabled toestand (guard isNavigable)', async () => {
      seedRootTasks(taskStore, [flatTask({ id: '0', task: 'Inleiding' })])
      const setRootTask = vi.spyOn(taskStore, 'setRootTask')
      const flushSave = vi.fn()

      const wrapper = mountTracker({
        props: { disabled: true, navigable: true },
        persistence: { flushSave },
      })
      await items(wrapper)[0].trigger('click')

      expect(setRootTask).not.toHaveBeenCalled()
      expect(flushSave).not.toHaveBeenCalled()
    })

    it('doet niets bij klik op het "Proces voltooid"-placeholder (guard taskId null)', async () => {
      // Navigable form without a conclusion task -> the placeholder is present
      // while isNavigable is true, exercising the taskId === null guard.
      seedRootTasks(taskStore, [flatTask({ id: '0', task: 'Inleiding' })])
      const setRootTask = vi.spyOn(taskStore, 'setRootTask')
      const flushSave = vi.fn()

      const wrapper = mountTracker({ props: { navigable: true }, persistence: { flushSave } })
      const placeholder = items(wrapper)[items(wrapper).length - 1]
      await placeholder.trigger('click')

      expect(setRootTask).not.toHaveBeenCalled()
      expect(flushSave).not.toHaveBeenCalled()
    })
  })
})

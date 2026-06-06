import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePreScanReferences } from '../../src/composables/usePreScanReferences'
import { useAnswerStore } from '../../src/stores/answers'
import { useTaskStore } from '../../src/stores/tasks'
import { FormType } from '../../src/models/dpia'
import type { FlatTask, TaskInstance } from '../../src/stores/tasks'
import type { TaskReference } from '../../src/models/dpia'

// A non-repeatable task's instance id equals its task id, so the seeded instance id matches the task id.

function makePreScanTask(
  id: string,
  references?: TaskReference[],
  task = `Title for ${id}`,
): FlatTask {
  return {
    id,
    task,
    type: ['text'],
    parentId: null,
    childrenIds: [],
    ...(references ? { references: { DPIA: references } } : {}),
  }
}

function seed(opts: {
  tasks: FlatTask[]
  answers?: Record<string, ReturnType<typeof rawAnswer>['value']>
  withoutInstance?: string[]
  activeNamespace?: FormType
}) {
  const taskStore = useTaskStore()
  const answerStore = useAnswerStore()

  const flatTasks: Record<string, FlatTask> = {}
  const instances: Record<string, TaskInstance> = {}
  for (const t of opts.tasks) {
    flatTasks[t.id] = t
    if (!opts.withoutInstance?.includes(t.id)) {
      instances[t.id] = {
        id: t.id,
        taskId: t.id,
        groupId: `${t.id}_g`,
        parentInstanceId: null,
        childInstanceIds: [],
      }
    }
  }

  taskStore.flatTasks[FormType.PRE_SCAN] = flatTasks
  taskStore.taskInstances[FormType.PRE_SCAN] = instances

  if (opts.answers) {
    for (const [id, value] of Object.entries(opts.answers)) {
      answerStore.answers[FormType.PRE_SCAN][id] = {
        value,
        lastEditedAt: '2026-01-01T00:00:00Z',
      }
    }
  }

  taskStore.activeNamespace = opts.activeNamespace ?? FormType.DPIA
}

function rawAnswer(value: string) {
  return { value, lastEditedAt: '2026-01-01T00:00:00Z' }
}

describe('usePreScanReferences.getRootTaskId', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('returns the segment before the first dot', () => {
    const { getRootTaskId } = usePreScanReferences()
    expect(getRootTaskId('2.1.3')).toBe('2')
    expect(getRootTaskId('5')).toBe('5')
  })
})

describe('usePreScanReferences.findPreScanReferences', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('returns [] when dpiaTaskId is empty (guard branch)', () => {
    seed({ tasks: [] })
    const { findPreScanReferences } = usePreScanReferences()
    expect(findPreScanReferences('')).toEqual([])
  })

  it('skips tasks without references and without a DPIA list (continue branch, both sub-conditions)', () => {
    seed({
      tasks: [
        makePreScanTask('a'),
        { ...makePreScanTask('b'), references: {} },
      ],
      answers: { a: 'va', b: 'vb' },
    })
    const { findPreScanReferences } = usePreScanReferences()
    expect(findPreScanReferences('2.1.3')).toEqual([])
  })

  it('matches all types when referenceTypes is omitted (typesToMatch empty branch)', () => {
    seed({
      tasks: [
        makePreScanTask('p1', [{ id: '2.1.3', type: 'pre-fill' }]),
      ],
      answers: { p1: 'value-1' },
    })
    const { findPreScanReferences } = usePreScanReferences()
    const result = findPreScanReferences('2.1.3')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      taskId: 'p1',
      taskTitle: 'Title for p1',
      answer: 'value-1',
      referenceType: 'pre-fill',
      dpiaTaskId: '2.1.3',
    })
  })

  it('accepts a single string referenceType (Array.isArray false branch)', () => {
    seed({
      tasks: [
        makePreScanTask('p1', [
          { id: '2.1.3', type: 'pre-fill' },
          { id: '2.1.3', type: 'pre-view' },
        ]),
      ],
      answers: { p1: 'value-1' },
    })
    const { findPreScanReferences } = usePreScanReferences()
    const result = findPreScanReferences('2.1.3', 'pre-fill')
    expect(result).toHaveLength(1)
    expect(result[0].referenceType).toBe('pre-fill')
  })

  it('accepts an array of referenceTypes (Array.isArray true branch)', () => {
    seed({
      tasks: [
        makePreScanTask('p1', [
          { id: '2.1.3', type: 'pre-fill' },
          { id: '2.1.3', type: 'pre-view' },
          { id: '2.1.3', type: 'one-to-one' },
        ]),
      ],
      answers: { p1: 'value-1' },
    })
    const { findPreScanReferences } = usePreScanReferences()
    const result = findPreScanReferences('2.1.3', ['pre-fill', 'pre-view'])
    expect(result.map((r) => r.referenceType).sort()).toEqual(['pre-fill', 'pre-view'])
  })

  it('matches by section when matchBySection is true (ternary true branch)', () => {
    seed({
      tasks: [
        makePreScanTask('p1', [{ id: '2.4.9', type: 'many-to-many' }]),
        makePreScanTask('p2', [{ id: '3.1', type: 'many-to-many' }]),
      ],
      answers: { p1: 'value-1', p2: 'value-2' },
    })
    const { findPreScanReferences } = usePreScanReferences()
    const result = findPreScanReferences('2.1.3', undefined, true)
    expect(result).toHaveLength(1)
    expect(result[0].taskId).toBe('p1')
    expect(result[0].dpiaTaskId).toBe('2.4.9')
  })

  it('matches by exact id when matchBySection is false (ternary false branch)', () => {
    seed({
      tasks: [
        makePreScanTask('p1', [
          { id: '2.1.3', type: 'pre-fill' },
          { id: '2.1.4', type: 'pre-fill' },
        ]),
      ],
      answers: { p1: 'value-1' },
    })
    const { findPreScanReferences } = usePreScanReferences()
    const result = findPreScanReferences('2.1.3')
    expect(result).toHaveLength(1)
    expect(result[0].dpiaTaskId).toBe('2.1.3')
  })

  it('does not push results when there is no instance (preScanInstanceIds empty branch)', () => {
    seed({
      tasks: [makePreScanTask('p1', [{ id: '2.1.3', type: 'pre-fill' }])],
      answers: { p1: 'value-1' },
      withoutInstance: ['p1'],
    })
    const { findPreScanReferences } = usePreScanReferences()
    expect(findPreScanReferences('2.1.3')).toEqual([])
  })

  it('does not push results when the answer is null/undefined (answer guard branch)', () => {
    seed({
      tasks: [makePreScanTask('p1', [{ id: '2.1.3', type: 'pre-fill' }])],
    })
    const { findPreScanReferences } = usePreScanReferences()
    expect(findPreScanReferences('2.1.3')).toEqual([])
  })

  it('does not push results when there are no matching references (matchingReferences empty branch)', () => {
    seed({
      tasks: [makePreScanTask('p1', [{ id: '9.9.9', type: 'pre-fill' }])],
      answers: { p1: 'value-1' },
    })
    const { findPreScanReferences } = usePreScanReferences()
    expect(findPreScanReferences('2.1.3')).toEqual([])
  })

  it('strips definitions from the task title via getPlainTextWithoutDefinitions', () => {
    const html =
      'Naam <span class="aiv-definition">verwerking<span class="aiv-definition-text">uitleg</span></span>'
    seed({
      tasks: [makePreScanTask('p1', [{ id: '2.1.3', type: 'pre-fill' }], html)],
      answers: { p1: 'value-1' },
    })
    const { findPreScanReferences } = usePreScanReferences()
    const result = findPreScanReferences('2.1.3')
    expect(result[0].taskTitle).toBe('Naam verwerking')
  })
})

describe('usePreScanReferences.getPreviewDataForSection', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('returns pre-view and many-to-many references in the same section', () => {
    seed({
      tasks: [
        makePreScanTask('p1', [{ id: '2.4.1', type: 'pre-view' }]),
        makePreScanTask('p2', [{ id: '2.9.9', type: 'many-to-many' }]),
        makePreScanTask('p3', [{ id: '2.0.0', type: 'pre-fill' }]),
        makePreScanTask('p4', [{ id: '7.1.1', type: 'pre-view' }]),
      ],
      answers: { p1: 'v1', p2: 'v2', p3: 'v3', p4: 'v4' },
    })
    const { getPreviewDataForSection } = usePreScanReferences()
    const result = getPreviewDataForSection('2.1.3')
    expect(result.map((r) => r.taskId).sort()).toEqual(['p1', 'p2'])
  })
})

describe('usePreScanReferences.getPreScanValueForTask', () => {
  beforeEach(() => setActivePinia(createPinia()))

  const dpiaTask: FlatTask = {
    id: '2.1.3',
    task: 'DPIA field',
    type: ['text'],
    parentId: null,
    childrenIds: [],
  }

  it('returns null when the active namespace is not DPIA (gate branch)', () => {
    seed({
      tasks: [makePreScanTask('p1', [{ id: '2.1.3', type: 'pre-fill' }])],
      answers: { p1: 'value-1' },
      activeNamespace: FormType.PRE_SCAN,
    })
    const { getPreScanValueForTask } = usePreScanReferences()
    expect(getPreScanValueForTask(dpiaTask)).toBeNull()
  })

  it('returns the processed answer for a pre-fill reference (string value, default ternary branch)', () => {
    seed({
      tasks: [makePreScanTask('p1', [{ id: '2.1.3', type: 'pre-fill' }])],
      answers: { p1: 'a plain string' },
    })
    const { getPreScanValueForTask } = usePreScanReferences()
    expect(getPreScanValueForTask(dpiaTask)).toBe('a plain string')
  })

  it("converts the string 'true' to boolean true (first ternary branch)", () => {
    seed({
      tasks: [makePreScanTask('p1', [{ id: '2.1.3', type: 'one-to-one' }])],
      answers: { p1: 'true' },
    })
    const { getPreScanValueForTask } = usePreScanReferences()
    expect(getPreScanValueForTask(dpiaTask)).toBe(true)
  })

  it("converts the string 'false' to boolean false (second ternary branch)", () => {
    seed({
      tasks: [makePreScanTask('p1', [{ id: '2.1.3', type: 'one-to-many' }])],
      answers: { p1: 'false' },
    })
    const { getPreScanValueForTask } = usePreScanReferences()
    expect(getPreScanValueForTask(dpiaTask)).toBe(false)
  })

  it('skips pre-view references and continues to the next (continue branch)', () => {
    seed({
      tasks: [
        makePreScanTask('p1', [{ id: '2.1.3', type: 'pre-view' }]),
        makePreScanTask('p2', [{ id: '2.1.3', type: 'pre-fill' }]),
      ],
      answers: { p1: 'ignored', p2: 'returned-value' },
    })
    const { getPreScanValueForTask } = usePreScanReferences()
    expect(getPreScanValueForTask(dpiaTask)).toBe('returned-value')
  })

  it('returns null when only a many-to-many reference matches (no return-type branch, falls through)', () => {
    seed({
      tasks: [makePreScanTask('p1', [{ id: '2.1.3', type: 'many-to-many' }])],
      answers: { p1: 'value-1' },
    })
    const { getPreScanValueForTask } = usePreScanReferences()
    expect(getPreScanValueForTask(dpiaTask)).toBeNull()
  })

  it('returns null when no references exist for the task (empty loop, final return)', () => {
    seed({ tasks: [], activeNamespace: FormType.DPIA })
    const { getPreScanValueForTask } = usePreScanReferences()
    expect(getPreScanValueForTask(dpiaTask)).toBeNull()
  })
})

describe('usePreScanReferences.hasPreScanReference', () => {
  beforeEach(() => setActivePinia(createPinia()))

  const dpiaTask: FlatTask = {
    id: '2.1.3',
    task: 'DPIA field',
    type: ['text'],
    parentId: null,
    childrenIds: [],
  }

  it('returns true when a matching reference of the given type exists (length > 0 true branch)', () => {
    seed({
      tasks: [makePreScanTask('p1', [{ id: '2.1.3', type: 'pre-fill' }])],
      answers: { p1: 'value-1' },
    })
    const { hasPreScanReference } = usePreScanReferences()
    expect(hasPreScanReference.value(dpiaTask, 'pre-fill')).toBe(true)
  })

  it('returns false when no matching reference of the given type exists (length > 0 false branch)', () => {
    seed({
      tasks: [makePreScanTask('p1', [{ id: '2.1.3', type: 'pre-fill' }])],
      answers: { p1: 'value-1' },
    })
    const { hasPreScanReference } = usePreScanReferences()
    expect(hasPreScanReference.value(dpiaTask, 'pre-view')).toBe(false)
  })
})

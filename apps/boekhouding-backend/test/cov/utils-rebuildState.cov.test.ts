import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { rebuildState } from '../../src/utils/rebuildState.js'
import { db } from '../../src/db/connection.js'
import {
  assessmentEdits,
  assessmentInstances,
  assessmentVersions,
} from '../../src/db/schema.js'
import { truncateAll } from '../helpers/testDb.js'
import { createUser, createProject, createAssessment, type SeededUser } from '../helpers/fixtures.js'

let user: SeededUser
let projectId: string

beforeAll(async () => {})

afterAll(async () => {})

beforeEach(async () => {
  await truncateAll(process.env.DATABASE_SERVER_FULL!)
  user = await createUser()
  const project = await createProject(user.id)
  projectId = project.id
})

async function addVersion(instanceId: string, version: number): Promise<string> {
  const [row] = await db
    .insert(assessmentVersions)
    .values({ assessmentInstanceId: instanceId, version, createdBy: user.id })
    .returning()
  return row.id
}

// editedAt is explicit so replay order is deterministic (ordered by version then editedAt).
async function addEdit(
  versionId: string,
  fieldId: string,
  editType: string,
  newValue: unknown,
  editedAt: Date,
): Promise<void> {
  await db.insert(assessmentEdits).values({
    assessmentVersionId: versionId,
    fieldId,
    editType,
    newValue: newValue as never,
    editedBy: user.id,
    editedAt,
  })
}

async function rebuildFromEdits(
  edits: Array<{ fieldId: string; editType: string; newValue: unknown }>,
  options: { cachedState?: unknown; upToVersion?: number } = {},
): Promise<any> {
  const instance = await createAssessment(projectId, user.id, {
    cachedState: options.cachedState,
  })
  const versionId = await addVersion(instance.id, 1)
  let t = 0
  for (const e of edits) {
    await addEdit(versionId, e.fieldId, e.editType, e.newValue, new Date(2024, 0, 1, 0, 0, t++))
  }
  return rebuildState(instance.id, options.upToVersion ?? 1)
}

describe('rebuildState — fallback when no edits exist', () => {
  it('returns the instance cachedState when present (?? left branch)', async () => {
    const cached = { answers: { '1.1': { value: 'legacy' } } }
    const instance = await createAssessment(projectId, user.id, { cachedState: cached })
    const result = await rebuildState(instance.id, 1)
    expect(result).toEqual(cached)
  })

  it('returns {} when the instance cachedState is null (?? right branch)', async () => {
    const instance = await createAssessment(projectId, user.id, { cachedState: null })
    const result = await rebuildState(instance.id, 1)
    expect(result).toEqual({})
  })

  it('returns {} when the instance does not exist (optional chaining undefined)', async () => {
    const result = await rebuildState('00000000-0000-0000-0000-000000000000', 1)
    expect(result).toEqual({})
  })

  it('ignores edits from versions above upToVersion (lte filter)', async () => {
    const instance = await createAssessment(projectId, user.id, { cachedState: { fromCache: true } })
    const v2 = await addVersion(instance.id, 2)
    await addEdit(v2, '1.1', 'answer_change', { value: 'v2only' }, new Date(2024, 0, 1))
    const result = await rebuildState(instance.id, 1)
    expect(result).toEqual({ fromCache: true })
  })
})

describe('rebuildState — initial_state normalization', () => {
  it('clones a flat initial_state as-is', async () => {
    const initial = {
      metadata: { createdAt: '2024-01-01', completedTasks: ['0'] },
      answers: { '1.1': { value: 'x' } },
    }
    const result = await rebuildFromEdits([
      { fieldId: '__initial__', editType: 'initial_state', newValue: initial },
    ])
    expect(result.answers['1.1']).toEqual({ value: 'x' })
    expect(result.metadata.completedTasks).toEqual(['0'])
  })

  it('falls back to {} when initial_state newValue is null (?? branch)', async () => {
    const result = await rebuildFromEdits([
      { fieldId: '__initial__', editType: 'initial_state', newValue: null },
      { fieldId: '1.1', editType: 'answer_change', newValue: { value: 'after-null' } },
    ])
    expect(result.answers['1.1']).toEqual({ value: 'after-null' })
  })

  it('unwraps the dpia namespace from answers (dpia truthy branch)', async () => {
    const initial = {
      metadata: { activeNamespace: 'dpia', createdAt: '2024-01-01' },
      answers: { dpia: { '2.1': { value: 'inside-dpia' } } },
      taskState: { dpia: { completedRootTaskIds: ['1'] } },
    }
    const result = await rebuildFromEdits([
      { fieldId: '__initial__', editType: 'initial_state', newValue: initial },
    ])
    expect(result.answers['2.1']).toEqual({ value: 'inside-dpia' })
    expect(result.answers.dpia).toBeUndefined()
    expect(result.metadata.completedTasks).toEqual(['1'])
    expect(result.taskState).toBeUndefined()
    expect(result.metadata.activeNamespace).toBeUndefined()
  })

  it('unwraps the prescan namespace when only prescan is present (dpia falsy -> prescan branch)', async () => {
    const initial = {
      metadata: { createdAt: '2024-01-01' },
      answers: { prescan: { '3.1': { value: 'inside-prescan' } } },
    }
    const result = await rebuildFromEdits([
      { fieldId: '__initial__', editType: 'initial_state', newValue: initial },
    ])
    expect(result.answers['3.1']).toEqual({ value: 'inside-prescan' })
    expect(result.answers.prescan).toBeUndefined()
  })

  it('handles taskState present but empty (tsNs falsy branch) and deletes it', async () => {
    const initial = {
      answers: {},
      taskState: {},
    }
    const result = await rebuildFromEdits([
      { fieldId: '__initial__', editType: 'initial_state', newValue: initial },
    ])
    expect(result.taskState).toBeUndefined()
    expect(result.metadata).toBeUndefined()
  })

  it('defaults completedTasks to [] when the namespace has no completedRootTaskIds (|| [] branch)', async () => {
    const initial = {
      taskState: { dpia: { currentRootTaskId: '1' } },
    }
    const result = await rebuildFromEdits([
      { fieldId: '__initial__', editType: 'initial_state', newValue: initial },
    ])
    expect(result.metadata.completedTasks).toEqual([])
    expect(result.taskState).toBeUndefined()
  })

  it('creates metadata when taskState namespace exists but metadata is absent (metadata || {} branch)', async () => {
    const initial = {
      taskState: { prescan: { completedRootTaskIds: ['2'] } },
    }
    const result = await rebuildFromEdits([
      { fieldId: '__initial__', editType: 'initial_state', newValue: initial },
    ])
    expect(result.metadata.completedTasks).toEqual(['2'])
  })

  it('leaves state with no answers/taskState/metadata untouched (all guards false)', async () => {
    const initial = { something: 'else' }
    const result = await rebuildFromEdits([
      { fieldId: '__initial__', editType: 'initial_state', newValue: initial },
    ])
    expect(result).toEqual({ something: 'else' })
  })
})

describe('rebuildState — answer_change', () => {
  it('creates answers object then sets a plain key (newValue non-null)', async () => {
    const result = await rebuildFromEdits([
      { fieldId: '1.1', editType: 'answer_change', newValue: { value: 'hello' } },
    ])
    expect(result.answers['1.1']).toEqual({ value: 'hello' })
  })

  it('deletes a plain key when newValue is null', async () => {
    const result = await rebuildFromEdits([
      { fieldId: '1.1', editType: 'answer_change', newValue: { value: 'hello' } },
      { fieldId: '1.1', editType: 'answer_change', newValue: null },
    ])
    expect(result.answers['1.1']).toBeUndefined()
  })

  it('reuses an existing answers object on a second answer_change (!state.answers false branch)', async () => {
    const result = await rebuildFromEdits([
      { fieldId: '1.1', editType: 'answer_change', newValue: { value: 'a' } },
      { fieldId: '1.2', editType: 'answer_change', newValue: { value: 'b' } },
    ])
    expect(result.answers['1.1']).toEqual({ value: 'a' })
    expect(result.answers['1.2']).toEqual({ value: 'b' })
  })

  it('sets a grouped child into an existing array element found by _index', async () => {
    const initial = { answers: { '2.1': [{ _index: 0, '2.1.1': { value: 'old' } }] } }
    const result = await rebuildFromEdits([
      { fieldId: '__initial__', editType: 'initial_state', newValue: initial },
      { fieldId: '2.1.2[0]', editType: 'answer_change', newValue: { value: 'child' } },
    ])
    const el = result.answers['2.1'].find((e: any) => e._index === 0)
    expect(el['2.1.2']).toEqual({ value: 'child' })
    expect(el['2.1.1']).toEqual({ value: 'old' })
  })

  it('creates a new array element when _index is not yet present (push + sort)', async () => {
    const initial = { answers: { '2.1': [{ _index: 2 }] } }
    const result = await rebuildFromEdits([
      { fieldId: '__initial__', editType: 'initial_state', newValue: initial },
      { fieldId: '2.1.1[0]', editType: 'answer_change', newValue: { value: 'first' } },
    ])
    const arr = result.answers['2.1']
    expect(arr[0]._index).toBe(0)
    expect(arr[0]['2.1.1']).toEqual({ value: 'first' })
    expect(arr[1]._index).toBe(2)
  })

  it('deletes a grouped child field when newValue is null', async () => {
    const initial = { answers: { '2.1': [{ _index: 0, '2.1.1': { value: 'keep' } }] } }
    const result = await rebuildFromEdits([
      { fieldId: '__initial__', editType: 'initial_state', newValue: initial },
      { fieldId: '2.1.1[0]', editType: 'answer_change', newValue: null },
    ])
    const el = result.answers['2.1'].find((e: any) => e._index === 0)
    expect(el['2.1.1']).toBeUndefined()
  })

  it('treats a grouped key as a plain key when no grouped parent array exists (findGroupedParent null)', async () => {
    const result = await rebuildFromEdits([
      { fieldId: '2.1.1[0]', editType: 'answer_change', newValue: { value: 'plain-indexed' } },
    ])
    expect(result.answers['2.1.1[0]']).toEqual({ value: 'plain-indexed' })
  })

  it('treats a grouped key as plain when the matched parent is not an array (Array.isArray false)', async () => {
    const initial = { answers: { '2.1': { notAnArray: true } } }
    const result = await rebuildFromEdits([
      { fieldId: '__initial__', editType: 'initial_state', newValue: initial },
      { fieldId: '2.1.1[0]', editType: 'answer_change', newValue: { value: 'fallthrough' } },
    ])
    expect(result.answers['2.1.1[0]']).toEqual({ value: 'fallthrough' })
    expect(result.answers['2.1']).toEqual({ notAnArray: true })
  })
})

describe('rebuildState — section_complete', () => {
  it('marks a task complete using the completed. prefix (startsWith true)', async () => {
    const result = await rebuildFromEdits([
      { fieldId: 'completed.1', editType: 'section_complete', newValue: true },
    ])
    expect(result.metadata.completedTasks).toContain('1')
  })

  it('marks a task complete using a plain key (startsWith false)', async () => {
    const result = await rebuildFromEdits([
      { fieldId: '5', editType: 'section_complete', newValue: true },
    ])
    expect(result.metadata.completedTasks).toContain('5')
  })

  it('does not duplicate an already-completed task (includes true branch)', async () => {
    const result = await rebuildFromEdits([
      { fieldId: 'completed.1', editType: 'section_complete', newValue: true },
      { fieldId: 'completed.1', editType: 'section_complete', newValue: true },
    ])
    expect(result.metadata.completedTasks.filter((t: string) => t === '1')).toHaveLength(1)
  })

  it('removes a completed task when newValue is not true and it was present (idx !== -1)', async () => {
    const result = await rebuildFromEdits([
      { fieldId: 'completed.1', editType: 'section_complete', newValue: true },
      { fieldId: 'completed.1', editType: 'section_complete', newValue: false },
    ])
    expect(result.metadata.completedTasks).not.toContain('1')
  })

  it('is a no-op when removing a task that is not present (idx === -1)', async () => {
    const result = await rebuildFromEdits([
      { fieldId: 'completed.9', editType: 'section_complete', newValue: false },
    ])
    expect(result.metadata.completedTasks).toEqual([])
  })

  it('reuses existing metadata.completedTasks on a second toggle (both guards false)', async () => {
    const initial = { metadata: { completedTasks: ['1'] } }
    const result = await rebuildFromEdits([
      { fieldId: '__initial__', editType: 'initial_state', newValue: initial },
      { fieldId: 'completed.2', editType: 'section_complete', newValue: true },
    ])
    expect(result.metadata.completedTasks).toEqual(['1', '2'])
  })
})

describe('rebuildState — instance_added', () => {
  it('creates the parent array and adds the element with bundled object values', async () => {
    const result = await rebuildFromEdits([
      { fieldId: '2.1[0]', editType: 'instance_added', newValue: { '2.1.1': { value: 'bundled' } } },
    ])
    const arr = result.answers['2.1']
    expect(arr).toHaveLength(1)
    expect(arr[0]._index).toBe(0)
    expect(arr[0]['2.1.1']).toEqual({ value: 'bundled' })
  })

  it('adds an element with no bundled values when newValue is null (object guard false)', async () => {
    const result = await rebuildFromEdits([
      { fieldId: '2.1[0]', editType: 'instance_added', newValue: null },
    ])
    const arr = result.answers['2.1']
    expect(arr).toEqual([{ _index: 0 }])
  })

  it('appends to an existing array and sorts by _index (push + sort, array already present)', async () => {
    const result = await rebuildFromEdits([
      { fieldId: '2.1[2]', editType: 'instance_added', newValue: null },
      { fieldId: '2.1[0]', editType: 'instance_added', newValue: null },
    ])
    const arr = result.answers['2.1']
    expect(arr.map((e: any) => e._index)).toEqual([0, 2])
  })

  it('does not re-add an element whose _index already exists (find truthy branch)', async () => {
    const result = await rebuildFromEdits([
      { fieldId: '2.1[0]', editType: 'instance_added', newValue: { '2.1.1': { value: 'first' } } },
      { fieldId: '2.1[0]', editType: 'instance_added', newValue: { '2.1.1': { value: 'second' } } },
    ])
    const arr = result.answers['2.1']
    expect(arr).toHaveLength(1)
    expect(arr[0]['2.1.1']).toEqual({ value: 'first' })
  })

  it('is a no-op when the field id has no [index] suffix (addMatch null)', async () => {
    const result = await rebuildFromEdits([
      { fieldId: '2.1', editType: 'instance_added', newValue: null },
    ])
    expect(result.answers['2.1']).toBeUndefined()
  })

  it('reuses an existing answers object created by a prior edit (!state.answers false)', async () => {
    const result = await rebuildFromEdits([
      { fieldId: '1.1', editType: 'answer_change', newValue: { value: 'x' } },
      { fieldId: '2.1[0]', editType: 'instance_added', newValue: null },
    ])
    expect(result.answers['1.1']).toEqual({ value: 'x' })
    expect(result.answers['2.1']).toEqual([{ _index: 0 }])
  })
})

describe('rebuildState — instance_removed', () => {
  it('removes a single element and deletes the empty parent array (length === 0 branch)', async () => {
    const initial = { answers: { '2.1': [{ _index: 0, '2.1.1': { value: 'gone' } }] } }
    const result = await rebuildFromEdits([
      { fieldId: '__initial__', editType: 'initial_state', newValue: initial },
      { fieldId: '2.1[0]', editType: 'instance_removed', newValue: null },
    ])
    expect(result.answers['2.1']).toBeUndefined()
  })

  it('removes one element but keeps the array when others remain (length !== 0 branch)', async () => {
    const initial = { answers: { '2.1': [{ _index: 0 }, { _index: 1 }] } }
    const result = await rebuildFromEdits([
      { fieldId: '__initial__', editType: 'initial_state', newValue: initial },
      { fieldId: '2.1[0]', editType: 'instance_removed', newValue: null },
    ])
    expect(result.answers['2.1']).toEqual([{ _index: 1 }])
  })

  it('breaks early when there are no answers at all (!state.answers true)', async () => {
    const result = await rebuildFromEdits([
      { fieldId: '2.1[0]', editType: 'instance_removed', newValue: null },
    ])
    expect(result.answers).toBeUndefined()
  })

  it('is a no-op when the field id has no [index] suffix (removeMatch null)', async () => {
    const initial = { answers: { '2.1': [{ _index: 0 }] } }
    const result = await rebuildFromEdits([
      { fieldId: '__initial__', editType: 'initial_state', newValue: initial },
      { fieldId: '2.1', editType: 'instance_removed', newValue: null },
    ])
    expect(result.answers['2.1']).toEqual([{ _index: 0 }])
  })

  it('is a no-op when the parent key is not an array (Array.isArray false)', async () => {
    const initial = { answers: { '2.1': { notAnArray: true } } }
    const result = await rebuildFromEdits([
      { fieldId: '__initial__', editType: 'initial_state', newValue: initial },
      { fieldId: '2.1[0]', editType: 'instance_removed', newValue: null },
    ])
    expect(result.answers['2.1']).toEqual({ notAnArray: true })
  })
})

describe('rebuildState — legacy and unknown edit types', () => {
  it('ignores task_instance_add and task_instance_remove (legacy break cases)', async () => {
    const result = await rebuildFromEdits([
      { fieldId: '1.1', editType: 'answer_change', newValue: { value: 'kept' } },
      { fieldId: '2.1.3[1]', editType: 'task_instance_add', newValue: { value: 'E-mailadres' } },
      { fieldId: '2.1.3[1]', editType: 'task_instance_remove', newValue: null },
    ])
    expect(result.answers['1.1']).toEqual({ value: 'kept' })
    expect(result.answers['2.1.3[1]']).toBeUndefined()
  })
})

describe('rebuildState — parseFieldKey', () => {
  it('parses a URN field id without an index', async () => {
    const result = await rebuildFromEdits([
      { fieldId: 'urn:nl:dpia:3.0?=task_id=2.1.3', editType: 'answer_change', newValue: { value: 'urn' } },
    ])
    expect(result.answers['2.1.3']).toEqual({ value: 'urn' })
  })

  it('parses a URN field id with a task_index into a grouped key', async () => {
    const initial = { answers: { '2.1': [{ _index: 0 }] } }
    const result = await rebuildFromEdits([
      { fieldId: '__initial__', editType: 'initial_state', newValue: initial },
      {
        fieldId: 'urn:nl:dpia:3.0?=task_id=2.1.1&task_index=0',
        editType: 'answer_change',
        newValue: { value: 'urn-indexed' },
      },
    ])
    const el = result.answers['2.1'].find((e: any) => e._index === 0)
    expect(el['2.1.1']).toEqual({ value: 'urn-indexed' })
  })

  it('returns null and skips the edit for a malformed URN (if (!key) continue)', async () => {
    const result = await rebuildFromEdits([
      { fieldId: '1.1', editType: 'answer_change', newValue: { value: 'before' } },
      { fieldId: 'urn:not-a-valid-urn', editType: 'answer_change', newValue: { value: 'ignored' } },
    ])
    expect(result.answers['1.1']).toEqual({ value: 'before' })
    expect(Object.keys(result.answers)).toEqual(['1.1'])
  })

  it('strips the dpia. legacy prefix from a dot-format field id', async () => {
    const result = await rebuildFromEdits([
      { fieldId: 'dpia.2.1.3', editType: 'answer_change', newValue: { value: 'dpia-dot' } },
    ])
    expect(result.answers['2.1.3']).toEqual({ value: 'dpia-dot' })
  })

  it('strips the prescan. legacy prefix from a dot-format field id', async () => {
    const result = await rebuildFromEdits([
      { fieldId: 'prescan.3.1', editType: 'answer_change', newValue: { value: 'prescan-dot' } },
    ])
    expect(result.answers['3.1']).toEqual({ value: 'prescan-dot' })
  })

  it('keeps a plain key unchanged (no urn / dpia / prescan prefix)', async () => {
    const result = await rebuildFromEdits([
      { fieldId: '4.2', editType: 'answer_change', newValue: { value: 'plain' } },
    ])
    expect(result.answers['4.2']).toEqual({ value: 'plain' })
  })
})

describe('rebuildState — findGroupedParent', () => {
  it('returns null for a single-segment child id (loop never runs)', async () => {
    const result = await rebuildFromEdits([
      { fieldId: '9[0]', editType: 'answer_change', newValue: { value: 'single-seg' } },
    ])
    expect(result.answers['9[0]']).toEqual({ value: 'single-seg' })
  })

  it('finds a grandparent array when the immediate parent is not an array (loop iterates down)', async () => {
    const initial = { answers: { '2.1': [{ _index: 0 }] } }
    const result = await rebuildFromEdits([
      { fieldId: '__initial__', editType: 'initial_state', newValue: initial },
      { fieldId: '2.1.4.5[0]', editType: 'answer_change', newValue: { value: 'deep' } },
    ])
    const el = result.answers['2.1'].find((e: any) => e._index === 0)
    expect(el['2.1.4.5']).toEqual({ value: 'deep' })
  })
})

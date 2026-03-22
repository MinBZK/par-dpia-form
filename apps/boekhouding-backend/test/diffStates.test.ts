import { describe, it, expect } from 'vitest'
import { diffStates, parseInstanceId, buildFieldUrn } from '../src/utils/diffStates.js'

const USER = '00000000-0000-0000-0000-000000000002'
const URN = 'urn:nl:dpia:3.0'

// Helpers for realistic test answers
const answer = (value: string) => ({ value, lastEditedAt: '2026-01-01T00:00:00Z' })

function state(overrides: { urn?: string; completedTasks?: string[]; answers?: Record<string, unknown> }) {
  return {
    metadata: {
      createdAt: '2026-01-01T00:00:00Z',
      urn: overrides.urn ?? URN,
      ...(overrides.completedTasks && { completedTasks: overrides.completedTasks }),
    },
    answers: overrides.answers ?? {},
  }
}

describe('parseInstanceId', () => {
  it('parses a plain task id', () => {
    expect(parseInstanceId('2.1.3')).toEqual({ taskId: '2.1.3' })
  })

  it('parses a task id with index', () => {
    expect(parseInstanceId('2.1.3[0]')).toEqual({ taskId: '2.1.3', index: 0 })
  })

  it('parses a task id with higher index', () => {
    expect(parseInstanceId('2.1.3[12]')).toEqual({ taskId: '2.1.3', index: 12 })
  })
})

describe('buildFieldUrn', () => {
  it('builds URN without index', () => {
    expect(buildFieldUrn(URN, '0.1')).toBe('urn:nl:dpia:3.0?=task_id=0.1')
  })

  it('builds URN with index', () => {
    expect(buildFieldUrn(URN, '2.1.1[0]')).toBe('urn:nl:dpia:3.0?=task_id=2.1.1&task_index=0')
  })
})

describe('diffStates', () => {
  it('returns empty array for identical states', () => {
    const s = state({ answers: { '0.1': answer('Inleiding') } })
    expect(diffStates(s, s, USER)).toEqual([])
  })

  it('detects answer changes', () => {
    const old = state({ answers: { '0.1': answer('Oud') } })
    const cur = state({ answers: { '0.1': answer('Nieuw') } })
    const edits = diffStates(old, cur, USER)
    expect(edits).toHaveLength(1)
    expect(edits[0]).toMatchObject({
      editType: 'answer_change',
      fieldId: `${URN}?=task_id=0.1`,
      oldValue: answer('Oud'),
      newValue: answer('Nieuw'),
    })
  })

  it('detects new answers', () => {
    const old = state({ answers: {} })
    const cur = state({ answers: { '1.1': answer('Voorstel') } })
    const edits = diffStates(old, cur, USER)
    expect(edits).toHaveLength(1)
    expect(edits[0]).toMatchObject({ editType: 'answer_change', oldValue: null, newValue: answer('Voorstel') })
  })

  it('detects removed answers', () => {
    const old = state({ answers: { '1.1': answer('Voorstel') } })
    const cur = state({ answers: {} })
    const edits = diffStates(old, cur, USER)
    expect(edits).toHaveLength(1)
    expect(edits[0]).toMatchObject({ editType: 'answer_change', oldValue: answer('Voorstel'), newValue: null })
  })

  it('detects section complete via metadata.completedTasks', () => {
    const old = state({ answers: {} })
    const cur = state({ completedTasks: ['1'], answers: {} })
    const edits = diffStates(old, cur, USER)
    expect(edits).toHaveLength(1)
    expect(edits[0]).toMatchObject({
      editType: 'section_complete',
      fieldId: `${URN}?=task_id=completed.1`,
      oldValue: false,
      newValue: true,
    })
  })

  it('detects section uncomplete', () => {
    const old = state({ completedTasks: ['1'], answers: {} })
    const cur = state({ answers: {} })
    const edits = diffStates(old, cur, USER)
    expect(edits).toHaveLength(1)
    expect(edits[0]).toMatchObject({ editType: 'section_complete', oldValue: true, newValue: false })
  })

  it('handles empty old state gracefully', () => {
    const cur = state({ answers: { '0.1': answer('Inleiding') } })
    const edits = diffStates({}, cur, USER)
    expect(edits).toHaveLength(1)
    expect(edits[0].editType).toBe('answer_change')
  })

  it('detects ImageValue answer change', () => {
    const imgOld = { value: { data: 'data:image/png;base64,abc', title: 'Diagram' }, lastEditedAt: '2026-01-01T00:00:00Z' }
    const imgNew = { value: { data: 'data:image/png;base64,xyz', title: 'Updated diagram' }, lastEditedAt: '2026-01-02T00:00:00Z' }
    const old = state({ answers: { '0.1': imgOld } })
    const cur = state({ answers: { '0.1': imgNew } })
    const edits = diffStates(old, cur, USER)
    expect(edits).toHaveLength(1)
    expect(edits[0]).toMatchObject({
      editType: 'answer_change',
      fieldId: `${URN}?=task_id=0.1`,
      oldValue: imgOld,
      newValue: imgNew,
    })
  })

  it('detects change from string to ImageValue (legacy migration)', () => {
    const old = state({ answers: { '0.1': answer('https://example.com/old.png') } })
    const imgNew = { value: { data: 'data:image/png;base64,abc', title: 'Diagram' }, lastEditedAt: '2026-01-02T00:00:00Z' }
    const cur = state({ answers: { '0.1': imgNew } })
    const edits = diffStates(old, cur, USER)
    expect(edits).toHaveLength(1)
    expect(edits[0]).toMatchObject({
      editType: 'answer_change',
      fieldId: `${URN}?=task_id=0.1`,
      oldValue: answer('https://example.com/old.png'),
      newValue: imgNew,
    })
  })

  describe('grouped arrays', () => {
    const grouped = (elements: Array<{ _index: number; [k: string]: unknown }>) => elements

    it('diffs grouped arrays by matching _index', () => {
      const old = state({
        answers: {
          '2.1': grouped([
            { _index: 0, '2.1.1': answer('E-mailadres'), '2.1.2': answer('Medewerkers') },
            { _index: 1, '2.1.1': answer('Telefoon'), '2.1.2': answer('Klanten') },
          ]),
        },
      })
      const cur = state({
        answers: {
          '2.1': grouped([
            { _index: 0, '2.1.1': answer('E-mailadres'), '2.1.2': answer('Medewerkers') },
            { _index: 1, '2.1.1': answer('Mobiel'), '2.1.2': answer('Klanten') },
          ]),
        },
      })
      const edits = diffStates(old, cur, USER)
      expect(edits).toHaveLength(1)
      expect(edits[0]).toMatchObject({
        editType: 'answer_change',
        fieldId: `${URN}?=task_id=2.1.1&task_index=1`,
        oldValue: answer('Telefoon'),
        newValue: answer('Mobiel'),
      })
    })

    it('detects new grouped element (added instance) with bundled values', () => {
      const old = state({
        answers: { '2.1': grouped([{ _index: 0, '2.1.1': answer('E-mailadres') }]) },
      })
      const cur = state({
        answers: {
          '2.1': grouped([
            { _index: 0, '2.1.1': answer('E-mailadres') },
            { _index: 1, '2.1.1': answer('Telefoon') },
          ]),
        },
      })
      const edits = diffStates(old, cur, USER)
      expect(edits).toHaveLength(1)
      expect(edits[0]).toMatchObject({
        fieldId: `${URN}?=task_id=2.1&task_index=1`,
        editType: 'instance_added',
        oldValue: null,
        newValue: { '2.1.1': answer('Telefoon') },
      })
    })

    it('detects removed grouped element (deleted instance) with bundled values', () => {
      const old = state({
        answers: {
          '2.1': grouped([
            { _index: 0, '2.1.1': answer('E-mailadres') },
            { _index: 1, '2.1.1': answer('Telefoon') },
          ]),
        },
      })
      const cur = state({
        answers: { '2.1': grouped([{ _index: 0, '2.1.1': answer('E-mailadres') }]) },
      })
      const edits = diffStates(old, cur, USER)
      expect(edits).toHaveLength(1)
      expect(edits[0]).toMatchObject({
        fieldId: `${URN}?=task_id=2.1&task_index=1`,
        editType: 'instance_removed',
        oldValue: { '2.1.1': answer('Telefoon') },
        newValue: null,
      })
    })

    it('handles transition from empty to grouped array (default index skipped)', () => {
      const old = state({ answers: {} })
      const cur = state({
        answers: { '2.1': grouped([{ _index: 0, '2.1.1': answer('E-mailadres') }]) },
      })
      const edits = diffStates(old, cur, USER)
      // Default index 0 is skipped — no edits
      expect(edits).toHaveLength(0)
    })

    it('detects added empty instance (no child fields)', () => {
      const old = state({
        answers: { '19.1': grouped([{ _index: 0 }]) },
      })
      const cur = state({
        answers: { '19.1': grouped([{ _index: 0 }, { _index: 1 }]) },
      })
      const edits = diffStates(old, cur, USER)
      expect(edits).toHaveLength(1)
      expect(edits[0]).toMatchObject({
        fieldId: `${URN}?=task_id=19.1&task_index=1`,
        editType: 'instance_added',
      })
    })

    it('detects removed empty instance (no child fields)', () => {
      const old = state({
        answers: { '19.1': grouped([{ _index: 0 }, { _index: 1 }]) },
      })
      const cur = state({
        answers: { '19.1': grouped([{ _index: 0 }]) },
      })
      const edits = diffStates(old, cur, USER)
      expect(edits).toHaveLength(1)
      expect(edits[0]).toMatchObject({
        fieldId: `${URN}?=task_id=19.1&task_index=1`,
        editType: 'instance_removed',
      })
    })

    it('detects empty instance added alongside filled instance', () => {
      const old = state({
        answers: { '2.1': grouped([{ _index: 0, '2.1.1': answer('Email') }]) },
      })
      const cur = state({
        answers: {
          '2.1': grouped([
            { _index: 0, '2.1.1': answer('Email') },
            { _index: 1 },
          ]),
        },
      })
      const edits = diffStates(old, cur, USER)
      expect(edits).toHaveLength(1)
      expect(edits[0]).toMatchObject({
        editType: 'instance_added',
        fieldId: `${URN}?=task_id=2.1&task_index=1`,
      })
    })

    it('skips default index 0 when parent key is newly saved', () => {
      const old = state({ answers: {} })
      const cur = state({
        answers: { '19.1': grouped([{ _index: 0 }, { _index: 1 }, { _index: 2 }]) },
      })
      const edits = diffStates(old, cur, USER)
      // Only indices 1 and 2 are user-added; index 0 is the implicit default
      expect(edits).toHaveLength(2)
      expect(edits.map(e => e.fieldId).sort()).toEqual([
        `${URN}?=task_id=19.1&task_index=1`,
        `${URN}?=task_id=19.1&task_index=2`,
      ])
    })

    it('reports index 0 removal when parent key already existed', () => {
      const old = state({
        answers: { '19.1': grouped([{ _index: 0 }, { _index: 1 }]) },
      })
      const cur = state({
        answers: { '19.1': grouped([{ _index: 1 }]) },
      })
      const edits = diffStates(old, cur, USER)
      expect(edits).toHaveLength(1)
      expect(edits[0]).toMatchObject({
        editType: 'instance_removed',
        fieldId: `${URN}?=task_id=19.1&task_index=0`,
      })
    })
  })
})

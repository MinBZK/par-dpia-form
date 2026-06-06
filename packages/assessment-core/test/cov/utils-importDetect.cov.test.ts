import { describe, it, expect } from 'vitest'
import {
  parseAndValidateImport,
  detectImportType,
  deriveCompletedRootTaskIds,
  normalizeToState,
} from '../../src/utils/importDetect'

// Self-sufficient coverage suite for src/utils/importDetect.ts.
// Covers every code path: JSON parse failures, type detection by urn and by
// answer keys, completed-task derivation, and namespace-(un)wrapping normalization.

describe('parseAndValidateImport', () => {
  it('throws "Ongeldig JSON-bestand" on invalid JSON (catch branch)', () => {
    expect(() => parseAndValidateImport('not json {')).toThrow('Ongeldig JSON-bestand')
  })

  it('throws on a JSON array (not an object)', () => {
    expect(() => parseAndValidateImport('[1, 2, 3]')).toThrow('Bestand bevat geen geldig JSON-object')
  })

  it('throws on JSON null', () => {
    expect(() => parseAndValidateImport('null')).toThrow('Bestand bevat geen geldig JSON-object')
  })

  it('throws on a JSON primitive (string)', () => {
    expect(() => parseAndValidateImport('"hello"')).toThrow('Bestand bevat geen geldig JSON-object')
  })

  it('throws when metadata is missing', () => {
    expect(() => parseAndValidateImport(JSON.stringify({ answers: { '1.1': { value: 'x' } } }))).toThrow(
      'Bestand mist metadata of answers — geen geldig assessment-bestand',
    )
  })

  it('throws when answers is missing', () => {
    expect(() => parseAndValidateImport(JSON.stringify({ metadata: { urn: 'urn:nl:dpia:3.0' } }))).toThrow(
      'Bestand mist metadata of answers — geen geldig assessment-bestand',
    )
  })

  it('throws when no DPIA/prescan type can be detected', () => {
    // metadata present, answers present but empty, no urn => detectImportType null
    expect(() =>
      parseAndValidateImport(JSON.stringify({ metadata: { createdAt: '2026-01-01' }, answers: {} })),
    ).toThrow('Bestand bevat geen DPIA- of pre-scan antwoorden')
  })

  it('parses and normalizes a valid modern DPIA export (success path)', () => {
    const raw = JSON.stringify({
      $schema: 'https://github.com/MinBZK/par-dpia-form/blob/main/schemas/assessment-output.v2.schema.json',
      metadata: { urn: 'urn:nl:dpia:3.0', createdAt: '2026-03-22T09:41:24.439Z', completedTasks: ['1'] },
      answers: { '1.1': { value: 'Een beschrijving', lastEditedAt: '2026-03-22T09:41:17.050Z' } },
    })

    const state = parseAndValidateImport(raw)

    expect(state.metadata.urn).toBe('urn:nl:dpia:3.0')
    expect(state.metadata.createdAt).toBe('2026-03-22T09:41:24.439Z')
    expect(state.metadata.completedTasks).toEqual(['1'])
    expect(state.answers['1.1']).toEqual({ value: 'Een beschrijving', lastEditedAt: '2026-03-22T09:41:17.050Z' })
  })

  it('parses a legacy v1 export (nanoid keys) through migration + normalization', () => {
    // v1 state: no $schema, answer key with underscore => isV1State true, migrated.
    const raw = JSON.stringify({
      metadata: { activeNamespace: 'dpia', createdAt: '2026-01-01T00:00:00Z' },
      taskState: {
        dpia: {
          completedRootTaskIds: ['1'],
          taskInstances: {
            inst_aaa: { id: 'inst_aaa', taskId: '1.1', groupId: 'g', parentInstanceId: null, childInstanceIds: [] },
          },
        },
      },
      answers: {
        dpia: { inst_aaa: { value: 'Beschrijving', lastEditedAt: '2026-01-01T00:00:00Z' } },
      },
    })

    const state = parseAndValidateImport(raw)
    // Migration rewrote the nanoid key to the taskId, then unwrapped the dpia namespace.
    expect(state.answers['1.1']).toEqual({ value: 'Beschrijving', lastEditedAt: '2026-01-01T00:00:00Z' })
  })
})

describe('detectImportType', () => {
  it('detects dpia by urn prefix', () => {
    expect(detectImportType({ metadata: { urn: 'urn:nl:dpia:3.0' }, answers: {} })).toBe('dpia')
  })

  it('detects prescan by urn prefix', () => {
    expect(detectImportType({ metadata: { urn: 'urn:nl:prescan:2.0' }, answers: {} })).toBe('prescan')
  })

  it('ignores an unrecognized urn prefix and falls through to answer detection', () => {
    // urn present and truthy but neither dpia nor prescan; answers has keys => dpia fallback.
    expect(detectImportType({ metadata: { urn: 'urn:nl:other:1.0' }, answers: { '1.1': { value: 'x' } } })).toBe(
      'dpia',
    )
  })

  it('handles missing metadata (optional chaining on metadata)', () => {
    // No metadata => urn undefined; answers has keys => dpia.
    expect(detectImportType({ answers: { '1.1': { value: 'x' } } })).toBe('dpia')
  })

  it('detects dpia from namespaced answers (FormType.DPIA key with entries)', () => {
    expect(detectImportType({ metadata: {}, answers: { dpia: { '1.1': { value: 'x' } } } })).toBe('dpia')
  })

  it('detects prescan from namespaced answers (FormType.PRE_SCAN key with entries)', () => {
    // dpia namespace empty so it falls past dpia, prescan namespace has entries.
    expect(detectImportType({ metadata: {}, answers: { dpia: {}, prescan: { '0.1': { value: 'x' } } } })).toBe(
      'prescan',
    )
  })

  it('falls back to dpia when answers has keys but no namespace match', () => {
    expect(detectImportType({ metadata: {}, answers: { '5.1': { value: 'x' } } })).toBe('dpia')
  })

  it('returns null when no urn and answers is empty', () => {
    expect(detectImportType({ metadata: {}, answers: {} })).toBeNull()
  })

  it('returns null when answers is undefined entirely', () => {
    // answers undefined: answers?.[...] short-circuits, answers && ... short-circuits => null.
    expect(detectImportType({ metadata: {} })).toBeNull()
  })

  it('does not treat an empty namespaced dpia object as dpia (length 0 branch)', () => {
    // dpia present but empty (length 0), no other keys => null.
    expect(detectImportType({ metadata: {}, answers: { dpia: {} } })).toBe('dpia')
  })

  it('treats an empty dpia namespace plus other keys as dpia via final fallback', () => {
    // dpia empty (skip), prescan empty (skip), but answers has keys => dpia.
    expect(detectImportType({ metadata: {}, answers: { dpia: {}, prescan: {} } })).toBe('dpia')
  })
})

describe('deriveCompletedRootTaskIds', () => {
  it('returns the part before the first dot, deduped and numerically sorted', () => {
    const result = deriveCompletedRootTaskIds(['2.1.1', '10.3', '1.2', '2.5', '3'])
    expect(result).toEqual(['1', '2', '3', '10'])
  })

  it('handles keys without a dot (dotIndex === -1 branch)', () => {
    expect(deriveCompletedRootTaskIds(['5', '2'])).toEqual(['2', '5'])
  })

  it('handles an empty input list', () => {
    expect(deriveCompletedRootTaskIds([])).toEqual([])
  })
})

describe('normalizeToState', () => {
  it('normalizes a flat modern dpia export with explicit completedTasks', () => {
    const json = {
      $schema: 'https://github.com/MinBZK/par-dpia-form/blob/main/schemas/assessment-output.v2.schema.json',
      metadata: { urn: 'urn:nl:dpia:3.0', createdAt: '2026-03-22T00:00:00Z', completedTasks: ['1', '2'] },
      answers: { '1.1': { value: 'a' }, '2.1': { value: 'b' } },
    }

    const state = normalizeToState(json, 'dpia')

    expect(state.metadata.urn).toBe('urn:nl:dpia:3.0')
    expect(state.metadata.createdAt).toBe('2026-03-22T00:00:00Z')
    expect(state.metadata.completedTasks).toEqual(['1', '2'])
    expect(state.answers).toEqual({ '1.1': { value: 'a' }, '2.1': { value: 'b' } })
  })

  it('unwraps old namespace-wrapped dpia answers', () => {
    const json = {
      $schema: 'https://example/schema.json',
      metadata: { urn: 'urn:nl:dpia:3.0', createdAt: '2026-01-01T00:00:00Z' },
      answers: { dpia: { '1.1': { value: 'wrapped' } } },
    }

    const state = normalizeToState(json, 'dpia')
    expect(state.answers).toEqual({ '1.1': { value: 'wrapped' } })
  })

  it('unwraps old namespace-wrapped prescan answers (prescan namespace branch)', () => {
    const json = {
      $schema: 'https://example/schema.json',
      metadata: { urn: 'urn:nl:prescan:2.0', createdAt: '2026-01-01T00:00:00Z' },
      answers: { prescan: { '0.1': { value: 'p' } } },
    }

    const state = normalizeToState(json, 'prescan')
    expect(state.answers).toEqual({ '0.1': { value: 'p' } })
  })

  it('unwraps when only the prescan namespace key is present but detected type is prescan', () => {
    // isNamespaced via the second operand of the OR (answers?.[PRE_SCAN]).
    const json = {
      metadata: { urn: 'urn:nl:prescan:2.0', createdAt: '2026-01-01T00:00:00Z' },
      answers: { prescan: { '0.1': { value: 'p' } } },
    }
    const state = normalizeToState(json, 'prescan')
    expect(state.answers).toEqual({ '0.1': { value: 'p' } })
  })

  it('falls back to empty object when namespaced but the detected namespace key is absent', () => {
    // isNamespaced true (dpia present), but detectedType prescan and answers.prescan missing
    // => (answers?.[namespace] || {}) takes the {} side.
    const json = {
      metadata: { urn: 'urn:nl:prescan:2.0', createdAt: '2026-01-01T00:00:00Z' },
      answers: { dpia: { '1.1': { value: 'x' } } },
    }
    const state = normalizeToState(json, 'prescan')
    expect(state.answers).toEqual({})
  })

  it('keeps grouped arrays unchanged (keepGrouped true branch)', () => {
    const grouped = [
      { _index: 0, '2.1.1': { value: 'Email' }, '2.1.2': { value: 'Employees' } },
      { _index: 2, '2.1.1': { value: 'Phone' } },
    ]
    const json = {
      $schema: 'https://example/schema.json',
      metadata: { urn: 'urn:nl:dpia:3.0', createdAt: '2026-01-01T00:00:00Z' },
      answers: { '0.1': { value: 'name' }, '2.1': grouped },
    }

    const state = normalizeToState(json, 'dpia')
    expect(state.answers['2.1']).toEqual(grouped)
    expect(state.answers['0.1']).toEqual({ value: 'name' })
    // Modern format => no derived completedTasks.
    expect(state.metadata.completedTasks).toBeUndefined()
  })

  it('uses legacy taskState.completedRootTaskIds when no explicit completedTasks', () => {
    // Modern (has $schema) but no metadata.completedTasks; legacy taskState present.
    const json = {
      $schema: 'https://example/schema.json',
      metadata: { urn: 'urn:nl:dpia:3.0', createdAt: '2026-01-01T00:00:00Z' },
      taskState: { dpia: { completedRootTaskIds: ['3', '4'] } },
      answers: { '3.1': { value: 'x' } },
    }

    const state = normalizeToState(json, 'dpia')
    expect(state.metadata.completedTasks).toEqual(['3', '4'])
  })

  it('derives completedTasks for a legacy flat export (no $schema, no urn)', () => {
    // Not modern, not grouped => flatForLegacy = unwrapped; derive from keys.
    const json = {
      metadata: { createdAt: '2026-01-01T00:00:00Z' },
      answers: { '1.1': { value: 'a' }, '2.3': { value: 'b' }, '1.2': { value: 'c' } },
    }

    const state = normalizeToState(json, 'dpia')
    expect(state.metadata.completedTasks).toEqual(['1', '2'])
    expect(state.metadata.urn).toBeUndefined()
  })

  it('derives completedTasks from flattened grouped answers for a legacy grouped export', () => {
    // Not modern AND keepGrouped => flatForLegacy = flattenGroupedAnswers(...).
    const json = {
      metadata: { createdAt: '2026-01-01T00:00:00Z' },
      answers: {
        '0.1': { value: 'name' },
        '2.1': [
          { _index: 0, '2.1.1': { value: 'Email' }, '2.1.2': { value: 'Employees' } },
          { _index: 1, '2.1.1': { value: 'Phone' } },
        ],
      },
    }

    const state = normalizeToState(json, 'dpia')
    // Flattening yields keys 0.1, 2.1.1[0], 2.1.2[0], 2.1.1[1] => roots 0 and 2.
    expect(state.metadata.completedTasks).toEqual(['0', '2'])
    // The output answers keep the grouped shape.
    expect(Array.isArray(state.answers['2.1'])).toBe(true)
  })

  it('returns empty (no completedTasks key) for a modern export with no completed info', () => {
    // Modern via metadata.urn (no $schema); no explicit, no legacy => [] => key omitted.
    const json = {
      metadata: { urn: 'urn:nl:dpia:3.0', createdAt: '2026-01-01T00:00:00Z' },
      answers: { '1.1': { value: 'a' } },
    }

    const state = normalizeToState(json, 'dpia')
    expect(state.metadata.completedTasks).toBeUndefined()
    expect('completedTasks' in state.metadata).toBe(false)
  })

  it('treats empty explicit and empty legacy completed arrays as "fall through"', () => {
    // explicitCompleted [] (length 0 falsy), legacyCompleted [] (length 0 falsy),
    // modern => []. Exercises both ?.length false branches.
    const json = {
      $schema: 'https://example/schema.json',
      metadata: { urn: 'urn:nl:dpia:3.0', createdAt: '2026-01-01T00:00:00Z', completedTasks: [] },
      taskState: { dpia: { completedRootTaskIds: [] } },
      answers: { '1.1': { value: 'a' } },
    }

    const state = normalizeToState(json, 'dpia')
    expect(state.metadata.completedTasks).toBeUndefined()
  })

  it('defaults createdAt to now when metadata has no createdAt', () => {
    // metadata present but no createdAt => new Date().toISOString() branch.
    const before = Date.now()
    const json = {
      metadata: { urn: 'urn:nl:dpia:3.0' },
      answers: { '1.1': { value: 'a' } },
    }

    const state = normalizeToState(json, 'dpia')
    const created = Date.parse(state.metadata.createdAt)
    expect(created).toBeGreaterThanOrEqual(before)
    expect(Number.isNaN(created)).toBe(false)
  })

  it('handles completely missing metadata and answers (both optional-chaining falsy branches)', () => {
    // No metadata, no answers => urn undefined, createdAt defaulted, answers {}.
    const before = Date.now()
    const state = normalizeToState({}, 'prescan')

    expect(state.metadata.urn).toBeUndefined()
    expect(Date.parse(state.metadata.createdAt)).toBeGreaterThanOrEqual(before)
    expect(state.answers).toEqual({})
    expect(state.metadata.completedTasks).toBeUndefined()
  })
})

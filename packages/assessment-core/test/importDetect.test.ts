import { describe, it, expect } from 'vitest'
import { detectImportType, normalizeToState, deriveCompletedRootTaskIds, parseAndValidateImport } from '../src/utils/importDetect'
import { OUTPUT_SCHEMA_URL, type AssessmentState } from '../src/models/assessmentState'

describe('detectImportType', () => {
  describe('URN-based detection (AssessmentOutput format)', () => {
    it('detects DPIA from urn:nl:dpia URN', () => {
      const json = {
        metadata: { urn: 'urn:nl:dpia:3.0' },
        answers: { '1.1': { value: 'yes' } },
      }
      expect(detectImportType(json)).toBe('dpia')
    })

    it('detects pre-scan from urn:nl:prescan URN', () => {
      const json = {
        metadata: { urn: 'urn:nl:prescan:3.0' },
        answers: { '1.1': { value: 'yes' } },
      }
      expect(detectImportType(json)).toBe('prescan')
    })

    it('URN takes priority over namespaced answer keys', () => {
      const json = {
        metadata: { urn: 'urn:nl:prescan:3.0' },
        answers: { dpia: { '1.1': { value: 'yes' } } },
      }
      expect(detectImportType(json)).toBe('prescan')
    })
  })

  describe('answer key-based detection (fallback)', () => {
    it('detects DPIA from namespaced dpia answers', () => {
      const json = {
        metadata: { createdAt: '2024-01-01' },
        answers: { dpia: { '1.1': { value: 'yes' } } },
      }
      expect(detectImportType(json)).toBe('dpia')
    })

    it('detects pre-scan from namespaced prescan answers', () => {
      const json = {
        metadata: { createdAt: '2024-01-01' },
        answers: { prescan: { '1.1': { value: 'yes' } } },
      }
      expect(detectImportType(json)).toBe('prescan')
    })

    it('prefers DPIA when both namespaces have answers', () => {
      const json = {
        metadata: { createdAt: '2024-01-01' },
        answers: {
          dpia: { '1.1': { value: 'yes' } },
          prescan: { '1.1': { value: 'no' } },
        },
      }
      expect(detectImportType(json)).toBe('dpia')
    })

    it('skips empty namespaced answers', () => {
      const json = {
        metadata: { createdAt: '2024-01-01' },
        answers: { dpia: {}, prescan: { '1.1': { value: 'yes' } } },
      }
      expect(detectImportType(json)).toBe('prescan')
    })
  })

  describe('flat answers without URN (last resort)', () => {
    it('assumes DPIA for flat answers without URN or namespace', () => {
      const json = {
        metadata: { createdAt: '2024-01-01' },
        answers: { '1.1': { value: 'yes' }, '2.3': { value: 'no' } },
      }
      expect(detectImportType(json)).toBe('dpia')
    })
  })

  describe('unrecognizable files', () => {
    it('returns null for empty answers', () => {
      const json = {
        metadata: { createdAt: '2024-01-01' },
        answers: {},
      }
      expect(detectImportType(json)).toBeNull()
    })

    it('returns null when answers is missing', () => {
      const json = { metadata: { createdAt: '2024-01-01' } }
      expect(detectImportType(json)).toBeNull()
    })

    it('returns null for completely empty object', () => {
      expect(detectImportType({})).toBeNull()
    })

    it('ignores unknown URN prefixes', () => {
      const json = {
        metadata: { urn: 'urn:nl:other:1.0' },
        answers: {},
      }
      expect(detectImportType(json)).toBeNull()
    })
  })

  describe('invalid file contents (non-assessment JSON)', () => {
    it('returns null for arbitrary JSON object', () => {
      expect(detectImportType({ foo: 'bar', baz: 123 })).toBeNull()
    })

    it('returns null for JSON array', () => {
      expect(detectImportType([] as unknown as Record<string, unknown>)).toBeNull()
    })

    it('returns null for JSON with metadata but no answers key', () => {
      expect(detectImportType({ metadata: { createdAt: '2024-01-01' } })).toBeNull()
    })

    it('returns null for package.json-like structure', () => {
      expect(detectImportType({
        name: '@overheid-assessment/core',
        version: '0.0.1',
        dependencies: {},
      })).toBeNull()
    })

    it('handles metadata without urn gracefully', () => {
      expect(detectImportType({
        metadata: { title: 'Some document' },
        answers: { '1.1': { value: 'yes' } },
      })).toBe('dpia') // flat answers fallback
    })

    it('handles null metadata gracefully', () => {
      expect(detectImportType({ metadata: null, answers: {} } as unknown as Record<string, unknown>)).toBeNull()
    })
  })
})

describe('normalizeToState', () => {
  describe('old namespace-wrapped format (backward compat)', () => {
    it('unwraps namespaced dpia answers to flat format', () => {
      const json = {
        metadata: { createdAt: '2024-01-01' },
        answers: { dpia: { '1.1': { value: 'yes', lastEditedAt: '2024-01-01' } } },
      }
      const result = normalizeToState(json, 'dpia')
      expect(result.answers['1.1']).toEqual({ value: 'yes', lastEditedAt: '2024-01-01' })
    })

    it('preserves grouped arrays within namespaced state', () => {
      const json = {
        metadata: { createdAt: '2024-01-01' },
        answers: {
          dpia: {
            '0.1': { value: 'text', lastEditedAt: '2024-01-01' },
            '2.1': [
              { _index: 0, '2.1.1': { value: 'Email', lastEditedAt: '2024-01-01' } },
              { _index: 1, '2.1.1': { value: 'Phone', lastEditedAt: '2024-01-01' } },
            ],
          },
        },
      }
      const result = normalizeToState(json, 'dpia')
      expect(result.answers['0.1']).toEqual({ value: 'text', lastEditedAt: '2024-01-01' })
      expect(result.answers['2.1']).toEqual([
        { _index: 0, '2.1.1': { value: 'Email', lastEditedAt: '2024-01-01' } },
        { _index: 1, '2.1.1': { value: 'Phone', lastEditedAt: '2024-01-01' } },
      ])
      expect(result.answers['2.1.1[0]']).toBeUndefined()
    })
  })

  describe('flat answers (AssessmentOutput format)', () => {
    it('keeps flat answers as-is', () => {
      const json = {
        metadata: { urn: 'urn:nl:dpia:3.0' },
        answers: { '1.1': { value: 'yes' }, '2.3': { value: 'no' } },
      }
      const result = normalizeToState(json, 'dpia')
      expect(result.answers).toEqual({
        '1.1': { value: 'yes' }, '2.3': { value: 'no' },
      })
    })

    it('keeps flat prescan answers as-is', () => {
      const json = {
        metadata: { urn: 'urn:nl:prescan:3.0' },
        answers: { '1.1': { value: 'yes' } },
      }
      const result = normalizeToState(json, 'prescan')
      expect(result.answers).toEqual({
        '1.1': { value: 'yes' },
      })
    })

    it('does not derive completedTasks for modern format with URN', () => {
      const json = {
        metadata: { urn: 'urn:nl:prescan:3.0' },
        answers: {
          '0.1': { value: 'yes' },
          '1.1.1': { value: 'true' },
          '3.1': { value: [] },
        },
      }
      const result = normalizeToState(json, 'prescan')
      expect(result.metadata.completedTasks).toBeUndefined()
    })

    it('does not derive completedTasks for DPIA with URN and no completedTasks', () => {
      const json = {
        metadata: { urn: 'urn:nl:dpia:3.0' },
        answers: { '1.1': { value: 'yes' } },
      }
      const result = normalizeToState(json, 'dpia')
      expect(result.metadata.completedTasks).toBeUndefined()
    })

    it('preserves explicit completedTasks from modern format', () => {
      const json = {
        metadata: { urn: 'urn:nl:prescan:3.0', completedTasks: ['0', '1'] },
        answers: { '0.1': { value: 'yes' }, '1.1.1': { value: 'true' } },
      }
      const result = normalizeToState(json, 'prescan')
      expect(result.metadata.completedTasks).toEqual(['0', '1'])
    })
  })

  describe('grouped answers (new export format)', () => {
    it('preserves grouped arrays from AssessmentOutput format', () => {
      const json = {
        metadata: { urn: 'urn:nl:dpia:3.0' },
        answers: {
          '0.1': { value: 'text', lastEditedAt: '2024-01-01' },
          '2.1': [
            { _index: 0, '2.1.1': { value: 'Email', lastEditedAt: '2024-01-01' } },
            { _index: 2, '2.1.1': { value: 'Phone', lastEditedAt: '2024-01-01' } },
          ],
        },
      }
      const result = normalizeToState(json, 'dpia')
      expect(result.answers['0.1']).toEqual({ value: 'text', lastEditedAt: '2024-01-01' })
      expect(result.answers['2.1']).toEqual([
        { _index: 0, '2.1.1': { value: 'Email', lastEditedAt: '2024-01-01' } },
        { _index: 2, '2.1.1': { value: 'Phone', lastEditedAt: '2024-01-01' } },
      ])
      expect(result.answers['2.1.1[0]']).toBeUndefined()
    })
  })
})

describe('round-trip: AssessmentOutput → detect → normalize', () => {
  const buildOutput = (urn: string, answers: Record<string, unknown>): AssessmentState => ({
    $schema: OUTPUT_SCHEMA_URL,
    metadata: { urn, createdAt: '2026-03-19T22:05:10.062Z' },
    answers: answers as AssessmentState['answers'],
  })

  it('prescan export round-trips with answers preserved, no false completedTasks', () => {
    const exported = buildOutput('urn:nl:prescan:2.0', {
      '0.1': { value: 'true', timestamp: '2026-03-19T22:02:49.853Z' },
      '0.2': { value: 'beschrijving', timestamp: '2026-02-10T21:59:09.431Z' },
      '1.1.1': { value: 'true', timestamp: '2026-02-10T22:01:42.541Z' },
    })

    const type = detectImportType(exported)
    expect(type).toBe('prescan')

    const state = normalizeToState(exported, type!)
    expect(Object.keys(state.answers)).toHaveLength(3)
    expect(state.answers['0.1']).toEqual({ value: 'true', timestamp: '2026-03-19T22:02:49.853Z' })
    // Modern format without explicit completedTasks → nothing completed
    expect(state.metadata.completedTasks).toBeUndefined()
  })

  it('prescan export with explicit completedTasks preserves them', () => {
    const exported = buildOutput('urn:nl:prescan:2.0', {
      '0.1': { value: 'true', timestamp: '2026-03-19T22:02:49.853Z' },
    })
    exported.metadata = { ...exported.metadata, completedTasks: ['0', '1', '3'] }

    const state = normalizeToState(exported, 'prescan')
    expect(state.metadata.completedTasks).toEqual(['0', '1', '3'])
  })

  it('modern export without completedTasks does not derive them', () => {
    const exported = buildOutput('urn:nl:prescan:2.0', {
      '0.1': { value: 'true', timestamp: '2026-03-19T22:02:49.853Z' },
      '3.1': { value: [], timestamp: '2026-02-10T22:04:42.338Z' },
    })

    const state = normalizeToState(exported, 'prescan')
    expect(state.metadata.completedTasks).toBeUndefined()
  })

  it('v1 state is migrated to v2 keys via parseAndValidateImport', () => {
    const v1State = JSON.stringify({
      metadata: { savedAt: '2026-03-19T22:02:57.609Z', activeNamespace: 'prescan' },
      taskState: {
        prescan: {
          currentRootTaskId: '0',
          taskInstances: {
            '0_abc': { id: '0_abc', taskId: '0', parentInstanceId: null, childInstanceIds: ['0.1_xyz'], groupId: 'g1' },
            '0.1_xyz': { id: '0.1_xyz', taskId: '0.1', parentInstanceId: '0_abc', childInstanceIds: [], groupId: 'g1' },
          },
          completedRootTaskIds: ['0', '1', '2'],
        },
      },
      answers: {
        prescan: { '0.1_xyz': { value: 'true', timestamp: '2026-03-19T22:02:49.853Z' } },
      },
    })

    const result = parseAndValidateImport(v1State)

    expect(result.answers['0.1']).toBeDefined()
    expect(result.answers['0.1']).toHaveProperty('value', 'true')
    expect(result.metadata.completedTasks).toEqual(['0', '1', '2'])
  })
})

describe('deriveCompletedRootTaskIds', () => {
  it('extracts unique root task IDs from answer keys', () => {
    expect(deriveCompletedRootTaskIds(['0.1', '0.2', '1.1.1', '1.2.1', '3.1']))
      .toEqual(['0', '1', '3'])
  })

  it('handles single-level keys', () => {
    expect(deriveCompletedRootTaskIds(['8'])).toEqual(['8'])
  })

  it('returns sorted numeric order', () => {
    expect(deriveCompletedRootTaskIds(['5.1.1', '1.1', '0.1', '3.1']))
      .toEqual(['0', '1', '3', '5'])
  })

  it('returns empty array for no answers', () => {
    expect(deriveCompletedRootTaskIds([])).toEqual([])
  })
})

describe('parseAndValidateImport', () => {
  describe('valid input', () => {
    it('parses valid AssessmentOutput JSON', () => {
      const input = JSON.stringify({
        $schema: OUTPUT_SCHEMA_URL,
        metadata: { urn: 'urn:nl:prescan:2.0', createdAt: '2026-01-01', completedTasks: ['0'] },
        answers: { '0.1': { value: 'true', timestamp: '2026-01-01' } },
      })
      const result = parseAndValidateImport(input)
      expect(result.answers['0.1']).toBeDefined()
      expect(result.metadata.completedTasks).toEqual(['0'])
    })

    it('parses grouped AssessmentOutput JSON', () => {
      const input = JSON.stringify({
        $schema: OUTPUT_SCHEMA_URL,
        metadata: { urn: 'urn:nl:dpia:3.0', createdAt: '2026-01-01' },
        answers: {
          '0.1': { value: 'text', lastEditedAt: '2026-01-01' },
          '2.1': [
            { _index: 0, '2.1.1': { value: 'Email', lastEditedAt: '2026-01-01' } },
          ],
        },
      })
      const result = parseAndValidateImport(input)
      expect(result.answers['0.1']).toBeDefined()
      expect(result.answers['2.1']).toEqual([
        { _index: 0, '2.1.1': { value: 'Email', lastEditedAt: '2026-01-01' } },
      ])
    })
  })

  describe('invalid input', () => {
    it('rejects plain text', () => {
      expect(() => parseAndValidateImport('dit is geen json')).toThrow('Ongeldig JSON-bestand')
    })

    it('rejects JSON array', () => {
      expect(() => parseAndValidateImport('[1, 2, 3]')).toThrow('geen geldig JSON-object')
    })

    it('rejects object without metadata/answers', () => {
      expect(() => parseAndValidateImport('{"foo": "bar"}')).toThrow('mist metadata of answers')
    })

    it('rejects assessment with empty answers and unknown URN', () => {
      const input = JSON.stringify({
        metadata: { urn: 'urn:nl:other:1.0' },
        answers: {},
      })
      expect(() => parseAndValidateImport(input)).toThrow('geen DPIA- of pre-scan antwoorden')
    })
  })
})

describe('import regression: completedTasks should not be fabricated', () => {
  it('DPIA export without completedTasks does not mark sections as completed', () => {
    // Reproduced user bug: importing a DPIA with 1 answer caused section 1 to be "voltooid"
    const input = JSON.stringify({
      $schema: OUTPUT_SCHEMA_URL,
      metadata: { urn: 'urn:nl:dpia:3.0', createdAt: '2026-03-22T09:41:24.439Z' },
      answers: { '1.1': { value: 'Een beschrijving', lastEditedAt: '2026-03-22T09:41:17.050Z' } },
    })
    const result = parseAndValidateImport(input)
    expect(result.answers['1.1']).toBeDefined()
    expect(result.metadata.completedTasks).toBeUndefined()
  })

  it('DPIA export with explicit completedTasks preserves them', () => {
    const input = JSON.stringify({
      $schema: OUTPUT_SCHEMA_URL,
      metadata: { urn: 'urn:nl:dpia:3.0', createdAt: '2026-01-01', completedTasks: ['0', '1'] },
      answers: {
        '0.1': { value: 'Inleiding', lastEditedAt: '2026-01-01' },
        '1.1': { value: 'Voorstel', lastEditedAt: '2026-01-01' },
      },
    })
    const result = parseAndValidateImport(input)
    expect(result.metadata.completedTasks).toEqual(['0', '1'])
  })

  it('prescan export without completedTasks does not derive them', () => {
    const input = JSON.stringify({
      $schema: OUTPUT_SCHEMA_URL,
      metadata: { urn: 'urn:nl:prescan:2.0', createdAt: '2026-01-01' },
      answers: {
        '0.1': { value: 'true', timestamp: '2026-01-01' },
        '1.1.1': { value: 'true', timestamp: '2026-01-01' },
        '3.1': { value: [], timestamp: '2026-01-01' },
      },
    })
    const result = parseAndValidateImport(input)
    expect(result.answers['0.1']).toBeDefined()
    expect(result.answers['1.1.1']).toBeDefined()
    expect(result.metadata.completedTasks).toBeUndefined()
  })

  it('prescan export with explicit completedTasks preserves them', () => {
    const input = JSON.stringify({
      $schema: OUTPUT_SCHEMA_URL,
      metadata: { urn: 'urn:nl:prescan:2.0', createdAt: '2026-01-01', completedTasks: ['0', '1', '2', '3', '4', '5', '6', '7'] },
      answers: { '0.1': { value: 'true', timestamp: '2026-01-01' } },
    })
    const result = parseAndValidateImport(input)
    expect(result.metadata.completedTasks).toEqual(['0', '1', '2', '3', '4', '5', '6', '7'])
  })

  it('v1 legacy export (no schema, no urn) still derives completedTasks', () => {
    // Old standalone exports have no $schema or urn — we need backward compat
    const input = JSON.stringify({
      metadata: { savedAt: '2026-01-01', activeNamespace: 'prescan' },
      taskState: {
        prescan: {
          currentRootTaskId: '0',
          taskInstances: {
            '0_abc': { id: '0_abc', taskId: '0', parentInstanceId: null, childInstanceIds: ['0.1_xyz'], groupId: 'g1' },
            '0.1_xyz': { id: '0.1_xyz', taskId: '0.1', parentInstanceId: '0_abc', childInstanceIds: [], groupId: 'g1' },
          },
          completedRootTaskIds: ['0'],
        },
      },
      answers: {
        prescan: { '0.1_xyz': { value: 'true', timestamp: '2026-01-01' } },
      },
    })
    const result = parseAndValidateImport(input)
    expect(result.answers['0.1']).toBeDefined()
    // Uses legacy completedRootTaskIds from taskState
    expect(result.metadata.completedTasks).toEqual(['0'])
  })

  it('old format without schema/urn but with flat answers derives completedTasks', () => {
    // Edge case: old export with namespace-wrapped answers but no schema/urn
    const input = JSON.stringify({
      metadata: { createdAt: '2024-01-01' },
      answers: { dpia: { '1.1': { value: 'yes' } } },
    })
    const result = parseAndValidateImport(input)
    expect(result.answers['1.1']).toBeDefined()
    // No schema, no urn → derives completedTasks as fallback
    expect(result.metadata.completedTasks).toEqual(['1'])
  })
})

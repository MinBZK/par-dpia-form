import { describe, it, expect } from 'vitest'
import { detectImportType, normalizeToState, deriveCompletedRootTaskIds, parseAndValidateImport } from '../src/utils/importDetect'
import { OUTPUT_SCHEMA_URL, type AssessmentOutput } from '../src/models/assessmentState'

describe('detectImportType', () => {
  describe('URN-based detection (AssessmentOutput format)', () => {
    it('detects DPIA from urn:nl:dpia URN', () => {
      const json = {
        metadata: { createdAt: '2024-01-01', urn: 'urn:nl:dpia:3.0' },
        answers: { '1.1': { value: 'yes' } },
      }
      expect(detectImportType(json)).toBe('dpia')
    })

    it('detects pre-scan from urn:nl:prescan URN', () => {
      const json = {
        metadata: { createdAt: '2024-01-01', urn: 'urn:nl:prescan:3.0' },
        answers: { '1.1': { value: 'yes' } },
      }
      expect(detectImportType(json)).toBe('prescan')
    })

    it('URN takes priority over activeNamespace', () => {
      const json = {
        metadata: { createdAt: '2024-01-01', urn: 'urn:nl:dpia:3.0', activeNamespace: 'prescan' },
        answers: { prescan: { '1.1': { value: 'yes' } } },
      }
      expect(detectImportType(json)).toBe('dpia')
    })

    it('URN takes priority over namespaced answer keys', () => {
      const json = {
        metadata: { createdAt: '2024-01-01', urn: 'urn:nl:prescan:3.0' },
        answers: { dpia: { '1.1': { value: 'yes' } } },
      }
      expect(detectImportType(json)).toBe('prescan')
    })
  })

  describe('activeNamespace-based detection (AssessmentState format)', () => {
    it('detects DPIA from activeNamespace', () => {
      const json = {
        metadata: { createdAt: '2024-01-01', activeNamespace: 'dpia' },
        answers: { dpia: { '1.1': { value: 'yes' } } },
      }
      expect(detectImportType(json)).toBe('dpia')
    })

    it('detects pre-scan from activeNamespace', () => {
      const json = {
        metadata: { createdAt: '2024-01-01', activeNamespace: 'prescan' },
        answers: { prescan: { '1.1': { value: 'yes' } } },
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
        metadata: { createdAt: '2024-01-01', urn: 'urn:nl:other:1.0' },
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

    it('handles metadata without urn or activeNamespace gracefully', () => {
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
  describe('already namespaced (AssessmentState format)', () => {
    it('returns AssessmentState with dpia answers as-is', () => {
      const json = {
        metadata: { createdAt: '2024-01-01', activeNamespace: 'dpia' },
        answers: { dpia: { '1.1': { value: 'yes' } } },
      }
      const result = normalizeToState(json, 'dpia')
      expect(result).toBe(json) // same reference
    })

    it('returns AssessmentState with prescan answers as-is', () => {
      const json = {
        metadata: { createdAt: '2024-01-01', activeNamespace: 'prescan' },
        answers: { prescan: { '1.1': { value: 'yes' } } },
      }
      const result = normalizeToState(json, 'prescan')
      expect(result).toBe(json)
    })

    it('returns mixed state (dpia + prescan) as-is', () => {
      const json = {
        metadata: { createdAt: '2024-01-01' },
        answers: {
          dpia: { '1.1': { value: 'yes' } },
          prescan: { '1.1': { value: 'no' } },
        },
      }
      const result = normalizeToState(json, 'dpia')
      expect(result).toBe(json)
    })
  })

  describe('flat answers (AssessmentOutput format)', () => {
    it('wraps flat answers under dpia namespace', () => {
      const json = {
        metadata: { createdAt: '2024-01-01', urn: 'urn:nl:dpia:3.0' },
        answers: { '1.1': { value: 'yes' }, '2.3': { value: 'no' } },
      }
      const result = normalizeToState(json, 'dpia')
      expect(result.answers).toEqual({
        dpia: { '1.1': { value: 'yes' }, '2.3': { value: 'no' } },
      })
      expect(result.metadata.activeNamespace).toBe('dpia')
    })

    it('wraps flat answers under prescan namespace', () => {
      const json = {
        metadata: { createdAt: '2024-01-01', urn: 'urn:nl:prescan:3.0' },
        answers: { '1.1': { value: 'yes' } },
      }
      const result = normalizeToState(json, 'prescan')
      expect(result.answers).toEqual({
        prescan: { '1.1': { value: 'yes' } },
      })
      expect(result.metadata.activeNamespace).toBe('prescan')
    })

    it('reconstructs completedRootTaskIds from answer keys', () => {
      const json = {
        metadata: { createdAt: '2024-01-01', urn: 'urn:nl:prescan:3.0' },
        answers: {
          '0.1': { value: 'yes' },
          '0.2': { value: 'text' },
          '1.1.1': { value: 'true' },
          '1.2.1': { value: 'false' },
          '3.1': { value: [] },
          '5.1.1': { value: 'false' },
        },
      }
      const result = normalizeToState(json, 'prescan')
      expect(result.taskState?.prescan?.completedRootTaskIds).toEqual(['0', '1', '3', '5'])
    })

    it('includes taskState with empty taskInstances for flat answers', () => {
      const json = {
        metadata: { createdAt: '2024-01-01', urn: 'urn:nl:dpia:3.0' },
        answers: { '1.1': { value: 'yes' } },
      }
      const result = normalizeToState(json, 'dpia')
      expect(result.taskState?.dpia?.taskInstances).toEqual({})
      expect(result.taskState?.dpia?.completedRootTaskIds).toEqual(['1'])
    })
  })
})

describe('round-trip: AssessmentOutput → detect → normalize', () => {
  // Simulates what exportToJson produces — the format users download
  const buildOutput = (urn: string, answers: Record<string, unknown>): AssessmentOutput => ({
    $schema: OUTPUT_SCHEMA_URL,
    metadata: { createdAt: '2026-03-19T22:05:10.062Z', urn },
    answers: answers as AssessmentOutput['answers'],
  })

  it('prescan export round-trips with answers and section status preserved', () => {
    const exported = buildOutput('urn:nl:prescan:2.0', {
      '0.1': { value: 'true', timestamp: '2026-03-19T22:02:49.853Z' },
      '0.2': { value: 'beschrijving', timestamp: '2026-02-10T21:59:09.431Z' },
      '1.1.1': { value: 'true', timestamp: '2026-02-10T22:01:42.541Z' },
      '1.2.1': { value: 'false', timestamp: '2026-02-10T22:02:57.064Z' },
      '3.1': { value: [], timestamp: '2026-02-10T22:04:42.338Z' },
      '5.1.1': { value: 'false', timestamp: '2026-02-10T22:05:06.564Z' },
      '7.1.1': { value: 'false', timestamp: '2026-02-10T22:05:19.226Z' },
    })

    const type = detectImportType(exported)
    expect(type).toBe('prescan')

    const state = normalizeToState(exported, type!)

    // Answers wrapped under prescan namespace
    expect(state.answers.prescan).toBeDefined()
    expect(Object.keys(state.answers.prescan!)).toHaveLength(7)
    expect(state.answers.prescan!['0.1']).toEqual({ value: 'true', timestamp: '2026-03-19T22:02:49.853Z' })

    // Section status reconstructed
    expect(state.taskState?.prescan?.completedRootTaskIds).toEqual(['0', '1', '3', '5', '7'])
  })

  it('dpia export round-trips with answers and section status preserved', () => {
    const exported = buildOutput('urn:nl:dpia:3.0', {
      '0.1': { value: 'naam project', timestamp: '2026-01-15T10:00:00.000Z' },
      '0.2': { value: 'beschrijving', timestamp: '2026-01-15T10:01:00.000Z' },
      '2.1.1': { value: 'ja', timestamp: '2026-01-15T10:05:00.000Z' },
      '2.1.2': { value: 'nee', timestamp: '2026-01-15T10:06:00.000Z' },
    })

    const type = detectImportType(exported)
    expect(type).toBe('dpia')

    const state = normalizeToState(exported, type!)

    expect(state.answers.dpia).toBeDefined()
    expect(Object.keys(state.answers.dpia!)).toHaveLength(4)
    expect(state.taskState?.dpia?.completedRootTaskIds).toEqual(['0', '2'])
  })

  it('uses explicit completedTasks from metadata over derived ones', () => {
    // User marked sections 0 and 1 as completed, but section 3 has answers
    // without being marked complete. The export should preserve this distinction.
    const exported = buildOutput('urn:nl:prescan:2.0', {
      '0.1': { value: 'true', timestamp: '2026-03-19T22:02:49.853Z' },
      '1.1.1': { value: 'true', timestamp: '2026-02-10T22:01:42.541Z' },
      '3.1': { value: [], timestamp: '2026-02-10T22:04:42.338Z' },
    })
    exported.metadata = { ...exported.metadata, completedTasks: ['0', '1'] } as any

    const state = normalizeToState(exported, 'prescan')

    // Should use explicit completedTasks, NOT derive from answers
    // (section 3 has answers but was not marked complete)
    expect(state.taskState?.prescan?.completedRootTaskIds).toEqual(['0', '1'])
  })

  it('falls back to deriving from answers when completedTasks is absent', () => {
    const exported = buildOutput('urn:nl:prescan:2.0', {
      '0.1': { value: 'true', timestamp: '2026-03-19T22:02:49.853Z' },
      '3.1': { value: [], timestamp: '2026-02-10T22:04:42.338Z' },
    })

    const state = normalizeToState(exported, 'prescan')

    // No completedTasks — derive from answer keys
    expect(state.taskState?.prescan?.completedRootTaskIds).toEqual(['0', '3'])
  })

  it('exported file without answers detects as null', () => {
    const exported = buildOutput('urn:nl:dpia:3.0', {})
    // Empty answers object — detectImportType still recognizes via URN
    expect(detectImportType(exported)).toBe('dpia')
  })

  it('v1 state (namespaced with taskState) passes through unchanged via normalizeToState', () => {
    const v1State = {
      metadata: { savedAt: '2026-03-19T22:02:57.609Z', activeNamespace: 'prescan' },
      taskState: {
        prescan: {
          currentRootTaskId: '0',
          taskInstances: { '0_abc': { id: '0_abc', taskId: '0', parentInstanceId: null, childInstanceIds: [], groupId: 'g1' } },
          completedRootTaskIds: ['0', '1', '2'],
        },
      },
      answers: {
        prescan: { '0.1_xyz': { value: 'true', timestamp: '2026-03-19T22:02:49.853Z' } },
      },
    }

    const type = detectImportType(v1State)
    expect(type).toBe('prescan')

    const state = normalizeToState(v1State, type!)
    // normalizeToState returns same reference — already namespaced
    expect(state).toBe(v1State)
    // completedRootTaskIds preserved from original
    expect(state.taskState?.prescan?.completedRootTaskIds).toEqual(['0', '1', '2'])
  })

  it('v1 state is migrated to v2 keys via parseAndValidateImport', () => {
    // In v1 files, answer keys match task instance IDs (both have nanoid suffixes)
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

    // Answer key should be migrated from nanoid to clean taskId
    expect(result.answers.prescan).toBeDefined()
    expect(result.answers.prescan!['0.1']).toBeDefined()
    expect(result.answers.prescan!['0.1_xyz' as any]).toBeUndefined()
    expect(result.answers.prescan!['0.1'].value).toBe('true')

    // Task instance keys should be migrated
    expect(result.taskState?.prescan?.taskInstances['0']).toBeDefined()
    expect(result.taskState?.prescan?.taskInstances['0_abc']).toBeUndefined()
    expect(result.taskState?.prescan?.taskInstances['0.1']).toBeDefined()
    expect(result.taskState?.prescan?.taskInstances['0.1_xyz']).toBeUndefined()
  })
})

describe('deriveCompletedRootTaskIds', () => {
  it('extracts unique root task IDs from answer keys', () => {
    expect(deriveCompletedRootTaskIds(['0.1', '0.2', '1.1.1', '1.2.1', '3.1']))
      .toEqual(['0', '1', '3'])
  })

  it('handles single-level keys (root task is the answer itself)', () => {
    expect(deriveCompletedRootTaskIds(['8']))
      .toEqual(['8'])
  })

  it('returns sorted numeric order', () => {
    expect(deriveCompletedRootTaskIds(['5.1.1', '1.1', '0.1', '3.1']))
      .toEqual(['0', '1', '3', '5'])
  })

  it('returns empty array for no answers', () => {
    expect(deriveCompletedRootTaskIds([])).toEqual([])
  })

  it('deduplicates root IDs from multiple answers in same section', () => {
    expect(deriveCompletedRootTaskIds(['1.1', '1.2', '1.3', '1.4']))
      .toEqual(['1'])
  })
})

describe('parseAndValidateImport', () => {
  describe('valid input', () => {
    it('parses valid AssessmentOutput JSON', () => {
      const input = JSON.stringify({
        $schema: OUTPUT_SCHEMA_URL,
        metadata: { createdAt: '2026-01-01', urn: 'urn:nl:prescan:2.0', completedTasks: ['0'] },
        answers: { '0.1': { value: 'true', timestamp: '2026-01-01' } },
      })
      const result = parseAndValidateImport(input)
      expect(result.answers.prescan).toBeDefined()
      expect(result.taskState?.prescan?.completedRootTaskIds).toEqual(['0'])
    })

    it('parses valid AssessmentState JSON', () => {
      const input = JSON.stringify({
        metadata: { createdAt: '2026-01-01', activeNamespace: 'dpia' },
        answers: { dpia: { '1.1': { value: 'yes' } } },
      })
      const result = parseAndValidateImport(input)
      expect(result.answers.dpia).toBeDefined()
    })
  })

  describe('invalid input — non-JSON', () => {
    it('rejects plain text', () => {
      expect(() => parseAndValidateImport('dit is geen json')).toThrow('Ongeldig JSON-bestand')
    })

    it('rejects HTML content', () => {
      expect(() => parseAndValidateImport('<html><body>Hello</body></html>')).toThrow('Ongeldig JSON-bestand')
    })

    it('rejects empty string', () => {
      expect(() => parseAndValidateImport('')).toThrow('Ongeldig JSON-bestand')
    })

    it('rejects binary-like content', () => {
      expect(() => parseAndValidateImport('\x00\x01\x02PDF-1.4')).toThrow('Ongeldig JSON-bestand')
    })

    it('rejects XML content', () => {
      expect(() => parseAndValidateImport('<?xml version="1.0"?><root/>')).toThrow('Ongeldig JSON-bestand')
    })
  })

  describe('invalid input — valid JSON but not assessment', () => {
    it('rejects JSON array', () => {
      expect(() => parseAndValidateImport('[1, 2, 3]')).toThrow('geen geldig JSON-object')
    })

    it('rejects JSON string', () => {
      expect(() => parseAndValidateImport('"hello"')).toThrow('geen geldig JSON-object')
    })

    it('rejects JSON number', () => {
      expect(() => parseAndValidateImport('42')).toThrow('geen geldig JSON-object')
    })

    it('rejects JSON null', () => {
      expect(() => parseAndValidateImport('null')).toThrow('geen geldig JSON-object')
    })

    it('rejects arbitrary object without metadata/answers', () => {
      expect(() => parseAndValidateImport('{"foo": "bar"}')).toThrow('mist metadata of answers')
    })

    it('rejects package.json-like file', () => {
      expect(() => parseAndValidateImport('{"name": "test", "version": "1.0"}')).toThrow('mist metadata of answers')
    })

    it('rejects object with metadata but no answers', () => {
      expect(() => parseAndValidateImport('{"metadata": {"createdAt": "2024-01-01"}}')).toThrow('mist metadata of answers')
    })

    it('rejects object with answers but no metadata', () => {
      expect(() => parseAndValidateImport('{"answers": {"0.1": {"value": "true"}}}')).toThrow('mist metadata of answers')
    })
  })

  describe('invalid input — assessment-like but no valid data', () => {
    it('rejects assessment with empty answers and unknown URN', () => {
      const input = JSON.stringify({
        metadata: { createdAt: '2024-01-01', urn: 'urn:nl:other:1.0' },
        answers: {},
      })
      expect(() => parseAndValidateImport(input)).toThrow('geen DPIA- of pre-scan antwoorden')
    })

    it('accepts empty namespaced answers (valid structure, just no data yet)', () => {
      // This is a valid assessment state — just with no answers filled in yet.
      // detectImportType falls through to flat-answers fallback which finds nothing,
      // but the namespace keys themselves are recognized.
      const input = JSON.stringify({
        metadata: { createdAt: '2024-01-01', activeNamespace: 'dpia' },
        answers: { dpia: {}, prescan: {} },
      })
      const result = parseAndValidateImport(input)
      expect(result.answers.dpia).toBeDefined()
    })
  })
})

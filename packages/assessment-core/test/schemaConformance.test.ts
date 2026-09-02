import { describe, it, expect } from 'vitest'

import { ANSWER_KEY, isValidAnswerKey } from '../src/utils/sanitizeState'
import { OUTPUT_SCHEMA_URL } from '../src/models/assessmentState'
import outputSchema from '../../../schemas/assessment-output.v2.schema.json' with { type: 'json' }
import prescan from '../../../sources/generated/PreScanDPIA.json' with { type: 'json' }
import dpia from '../../../sources/generated/DPIA.json' with { type: 'json' }
import iama from '../../../sources/generated/IAMA.json' with { type: 'json' }

// The backend reads the schema at startup, the client cannot. These two hold
// what the client hardcodes against the schema, so the copies cannot drift.
const schema = outputSchema as any
const answerKeyPattern = new RegExp(schema.$defs.answerKey.pattern)
const groupedChildPattern = new RegExp(schema.$defs.indexedGroupElement.propertyNames.pattern)
const completedTaskPattern = new RegExp(schema.properties.metadata.properties.completedTasks.items.pattern)

describe('client constants match the output schema', () => {
  it('uses the schema answer-key pattern verbatim', () => {
    expect(ANSWER_KEY.source).toBe(schema.$defs.answerKey.pattern)
  })

  it('uses the schema $schema URL verbatim', () => {
    expect(OUTPUT_SCHEMA_URL).toBe(schema.properties.$schema.const)
  })

  // The client validates child keys inside a repeatable group with the same
  // isValidAnswerKey, plus '_index'. The schema spells that out separately.
  it('accepts inside a repeatable group exactly what it accepts outside it', () => {
    expect(groupedChildPattern.test('_index')).toBe(true)
    for (const key of ['0.1', '2.1.3[0]', '2.2A.1', '5.A.grp-gediend']) {
      expect(groupedChildPattern.test(key)).toBe(isValidAnswerKey(key))
    }
  })

  it('keeps prototype-bearing keys out at every level', () => {
    for (const key of ['__proto__', 'constructor', 'prototype']) {
      expect(answerKeyPattern.test(key)).toBe(false)
      expect(groupedChildPattern.test(key)).toBe(false)
      expect(isValidAnswerKey(key)).toBe(false)
    }
  })
})

// A pattern narrower than the ids the sources actually use costs the user
// every answer from the first such field on.
interface SourceTask {
  id: string
  tasks?: SourceTask[]
}

function collectIds(tasks: SourceTask[], out: string[] = []): string[] {
  for (const task of tasks) {
    out.push(task.id)
    if (task.tasks) collectIds(task.tasks, out)
  }
  return out
}

const sources: Array<[string, { tasks: SourceTask[] }]> = [
  ['pre-scan', prescan as unknown as { tasks: SourceTask[] }],
  ['DPIA', dpia as unknown as { tasks: SourceTask[] }],
  ['IAMA', iama as unknown as { tasks: SourceTask[] }],
]

describe.each(sources)('%s task ids', (_name, source) => {
  it('are all valid answer keys, in the schema and in the client sanitizer', () => {
    const invalid = collectIds(source.tasks).filter(
      (id) => !answerKeyPattern.test(id) || !isValidAnswerKey(id),
    )
    expect(invalid).toEqual([])
  })

  it('have root ids that are valid completedTasks entries', () => {
    const invalid = source.tasks.map((task) => task.id).filter((id) => !completedTaskPattern.test(id))
    expect(invalid).toEqual([])
  })
})

import { describe, it, expect } from 'vitest'

import { isValidAnswerKey, sanitizeAnswers } from '../../src/utils/sanitizeState'

describe('isValidAnswerKey', () => {
  it('accepts task ids and their indexed variants', () => {
    for (const key of ['0', '0.1', '2.1.3', '2.1.3[0]', '10.11[12]']) {
      expect(isValidAnswerKey(key)).toBe(true)
    }
  })

  it('rejects prototype-bearing and non-task keys', () => {
    for (const key of ['__proto__', 'constructor', 'prototype', 'dpia', '2.1.3[a]', '', '2.']) {
      expect(isValidAnswerKey(key)).toBe(false)
    }
  })
})

describe('sanitizeAnswers', () => {
  it('keeps valid answers untouched', () => {
    const { answers, dropped } = sanitizeAnswers({
      '0.1': { value: 'Inleiding' },
      '2.1.3': { value: 'E-mailadres' },
    })

    expect(answers).toEqual({ '0.1': { value: 'Inleiding' }, '2.1.3': { value: 'E-mailadres' } })
    expect(dropped).toEqual([])
  })

  // The payload that makes this guard necessary: JSON.parse creates __proto__ as
  // an own key, and copying it onto another object reaches the prototype.
  it('drops a __proto__ key from parsed JSON', () => {
    const parsed = JSON.parse('{"__proto__":{"3.2":{"value":"injected"}},"0.1":{"value":"ok"}}')
    const { answers, dropped } = sanitizeAnswers(parsed)

    expect(dropped).toEqual(['__proto__'])
    expect(Object.keys(answers)).toEqual(['0.1'])
    expect((answers as Record<string, unknown>)['3.2']).toBeUndefined()
  })

  it('leaves the global prototype clean after sanitizing', () => {
    sanitizeAnswers(JSON.parse('{"__proto__":{"polluted":"yes"}}'))
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('keeps _index and child answers inside a repeatable group', () => {
    const { answers, dropped } = sanitizeAnswers({
      '2.1': [{ _index: 0, '2.1.1': { value: 'E-mail' } }],
    })

    expect(answers).toEqual({ '2.1': [{ _index: 0, '2.1.1': { value: 'E-mail' } }] })
    expect(dropped).toEqual([])
  })

  it('drops an invalid child key inside a repeatable group', () => {
    const { answers, dropped } = sanitizeAnswers({
      '2.1': [JSON.parse('{"_index":0,"__proto__":{"2.1.1":{"value":"injected"}}}')],
    })

    expect(dropped).toEqual(['2.1.__proto__'])
    expect(answers).toEqual({ '2.1': [{ _index: 0 }] })
  })

  it('drops a group element that is not an object', () => {
    const { answers, dropped } = sanitizeAnswers({ '2.1': ['nope', null, ['nested']] })

    expect(dropped).toEqual(['2.1', '2.1', '2.1'])
    expect(answers).toEqual({ '2.1': [] })
  })
})

import { describe, it, expect } from 'vitest'

import { isValidAnswerKey, sanitizeAnswers } from '../../src/utils/sanitizeState'

describe('isValidAnswerKey', () => {
  it('accepts task ids and their indexed variants', () => {
    for (const key of ['0', '0.1', '2.1.3', '2.1.3[0]', '10.11[12]']) {
      expect(isValidAnswerKey(key)).toBe(true)
    }
  })

  // IAMA numbers its questions the way the official model does, so a task id is
  // not all digits. Rejecting these lost every answer from the second step on.
  it('accepts IAMA task ids with letters and hyphens', () => {
    for (const key of ['2.2A', '2.2A.1', '5.A.grp-gediend', '1.actiepunten.tekst', '5.A.1[2]']) {
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

  it('reports an image in a format the app cannot store', () => {
    const { answers, invalidImages } = sanitizeAnswers({
      '3.1': { data: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' },
    })

    expect(invalidImages).toEqual(['3.1'])
    expect(answers).toEqual({})
  })

  it('reports an invalid image inside a repeatable group', () => {
    const { answers, invalidImages } = sanitizeAnswers({
      '2.1': [{ _index: 0, '2.1.1': { data: 'data:text/html;base64,PGI+' } }],
    })

    expect(invalidImages).toEqual(['2.1.2.1.1'])
    expect(answers).toEqual({ '2.1': [{ _index: 0 }] })
  })

  it('keeps a supported image untouched', () => {
    const image = { data: 'data:image/webp;base64,UklGRg==', title: 'Schema' }
    const { answers, invalidImages } = sanitizeAnswers({ '3.1': image })

    expect(invalidImages).toEqual([])
    expect(answers).toEqual({ '3.1': image })
  })

  it('leaves a plain answer object without a data URI alone', () => {
    const { answers, invalidImages } = sanitizeAnswers({ '3.1': { value: 'tekst' } })

    expect(invalidImages).toEqual([])
    expect(answers).toEqual({ '3.1': { value: 'tekst' } })
  })
})

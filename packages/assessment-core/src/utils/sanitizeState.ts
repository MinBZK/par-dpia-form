// Answer keys are task ids: '0.1', '2.1.3', or an indexed variant '2.1.3[0]'.
// Mirrors $defs/answerKey in schemas/assessment-output.v2.schema.json, which the
// backend enforces on save. Applying the same rule on the client keeps the
// standalone form (which has no backend to fall back on) equally strict.
const ANSWER_KEY = /^[0-9]+(\.[0-9]+)*(\[[0-9]+\])?$/

export function isValidAnswerKey(key: string): boolean {
  return ANSWER_KEY.test(key)
}

export interface SanitizedAnswers {
  answers: Record<string, unknown>
  dropped: string[]
}

/**
 * Copy answers into a fresh object, keeping only keys that are valid task ids.
 *
 * This is the guard against a crafted import: `JSON.parse` turns `"__proto__"`
 * into an own enumerable property, and copying that onto another object with
 * `Object.assign` (which assigns rather than defines) triggers the prototype
 * setter on the target. Every unanswered field would then resolve through the
 * prototype chain, so the form silently shows and saves attacker text while
 * `Object.keys` stays empty. A key that must match the task-id pattern can
 * never be `__proto__`, `constructor` or `prototype`, so the pattern check is
 * what makes the plain assignment below safe.
 */
export function sanitizeAnswers(answers: Record<string, unknown>): SanitizedAnswers {
  const out: Record<string, unknown> = {}
  const dropped: string[] = []

  for (const key of Object.keys(answers)) {
    if (!isValidAnswerKey(key)) {
      dropped.push(key)
      continue
    }

    const value = answers[key]
    if (!Array.isArray(value)) {
      out[key] = value
      continue
    }

    // Repeatable group: keep `_index` plus child answers, drop anything else.
    const elements: Record<string, unknown>[] = []
    for (const element of value as unknown[]) {
      if (element === null || typeof element !== 'object' || Array.isArray(element)) {
        dropped.push(key)
        continue
      }
      const clean: Record<string, unknown> = {}
      for (const childKey of Object.keys(element)) {
        if (childKey === '_index' || isValidAnswerKey(childKey)) {
          clean[childKey] = (element as Record<string, unknown>)[childKey]
        } else {
          dropped.push(`${key}.${childKey}`)
        }
      }
      elements.push(clean)
    }
    out[key] = elements
  }

  return { answers: out, dropped }
}

import { describe, it, expect } from 'vitest'
import { isRight } from 'fp-ts/lib/Either'
import { DPIA } from '../src/models/dpia'
import iama from '../../../sources/generated/IAMA.json' with { type: 'json' }

describe('IAMA schema', () => {
  it('valideert tegen de DPIA io-ts codec', () => {
    const result = DPIA.decode(iama)
    // On a Left, surface the failing paths so a schema/codec mismatch is debuggable.
    const errorPaths = isRight(result)
      ? []
      : result.left.map((err) =>
          err.context
            .map((entry) => entry.key)
            .filter((key) => key.length > 0)
            .join('.'),
        )
    expect(errorPaths, `decode-fouten op paden:\n${errorPaths.join('\n')}`).toEqual([])
  })
})

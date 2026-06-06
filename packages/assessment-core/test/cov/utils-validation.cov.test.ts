import { describe, it, expect, vi, afterEach } from 'vitest'
import * as t from 'io-ts'
import { validateData } from '../../src/utils/validation'

describe('validateData', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls onSuccess with the decoded data when validation succeeds', () => {
    const codec = t.type({ name: t.string, age: t.number })
    const validation = codec.decode({ name: 'Sam', age: 42 })
    const onSuccess = vi.fn()

    validateData(validation, onSuccess)

    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(onSuccess).toHaveBeenCalledWith({ name: 'Sam', age: 42 })
  })

  it('throws and logs each error location when validation fails', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    // Two invalid fields produce two distinct error locations.
    const codec = t.type({ name: t.string, age: t.number })
    const validation = codec.decode({ name: 123, age: 'not-a-number' })
    const onSuccess = vi.fn()

    expect(() => validateData(validation, onSuccess)).toThrow(
      /JSON decoder could not validate data, problem\(s\) found at/,
    )

    // onSuccess must not run on the failure path.
    expect(onSuccess).not.toHaveBeenCalled()

    // forEach logs one console.error per error location.
    expect(consoleErrorSpy).toHaveBeenCalledTimes(2)
    expect(consoleErrorSpy.mock.calls.every(([msg]) => /^Error at: /.test(msg as string))).toBe(
      true,
    )
  })

  it('builds the error message from the joined context keys', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const codec = t.type({ name: t.string })
    const validation = codec.decode({ name: 999 })
    const onSuccess = vi.fn()

    let captured: unknown
    try {
      validateData(validation, onSuccess)
    } catch (err) {
      captured = err
    }

    expect(captured).toBeInstanceOf(Error)
    // The context key path ends in the failing field name.
    expect((captured as Error).message).toContain('name')
    expect(onSuccess).not.toHaveBeenCalled()
  })
})

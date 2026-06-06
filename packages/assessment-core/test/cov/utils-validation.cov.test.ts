import { describe, it, expect, vi, afterEach } from 'vitest'
import * as t from 'io-ts'
import { validateData } from '../../src/utils/validation'

describe('validateData', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls onSuccess with the decoded data when validation succeeds', () => {
    const codec = t.type({ taskId: t.string, score: t.number })
    const validation = codec.decode({ taskId: '2.1', score: 3 })
    const onSuccess = vi.fn()

    validateData(validation, onSuccess)

    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(onSuccess).toHaveBeenCalledWith({ taskId: '2.1', score: 3 })
  })

  it('throws and logs each error location when validation fails', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const codec = t.type({ taskId: t.string, score: t.number })
    const validation = codec.decode({ taskId: 123, score: 'not-a-number' })
    const onSuccess = vi.fn()

    expect(() => validateData(validation, onSuccess)).toThrow(
      /JSON decoder could not validate data, problem\(s\) found at/,
    )

    expect(onSuccess).not.toHaveBeenCalled()

    expect(consoleErrorSpy).toHaveBeenCalledTimes(2)
    expect(consoleErrorSpy.mock.calls.every(([msg]) => /^Error at: /.test(msg as string))).toBe(
      true,
    )
  })

  it('builds the error message from the joined context keys', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const codec = t.type({ taskId: t.string })
    const validation = codec.decode({ taskId: 999 })
    const onSuccess = vi.fn()

    let captured: unknown
    try {
      validateData(validation, onSuccess)
    } catch (err) {
      captured = err
    }

    expect(captured).toBeInstanceOf(Error)
    expect((captured as Error).message).toContain('taskId')
    expect(onSuccess).not.toHaveBeenCalled()
  })
})

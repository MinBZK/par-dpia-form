/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const mockCreate = vi.fn()

vi.mock('../../src/api', () => {
  class ApiError extends Error {
    constructor(message: string, public status: number) {
      super(message)
    }
  }
  return { ApiError, chatKeys: { create: (...args: unknown[]) => mockCreate(...args) } }
})

import ChatKey from '../../src/views/ChatKey.vue'
import { ApiError } from '../../src/api'

const KEY = { key: 'aaa.bbb.ccc', expiresAt: '2026-10-26T20:30:00.000Z' }
const writeText = vi.fn()

function mountPage() {
  // The stub renders the header slot, so the page title is part of the test.
  const AppHeader = { props: ['backRoute', 'backLabel'], template: '<header :data-back="backRoute"><slot name="left" /></header>' }
  return mount(ChatKey, { global: { stubs: { AppHeader } } })
}

const button = (wrapper: ReturnType<typeof mountPage>, label: string) =>
  wrapper.findAll('button').find((b) => b.text() === label)!

beforeEach(() => {
  mockCreate.mockReset()
  writeText.mockReset()
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
})

describe('ChatKey', () => {
  it('shows no key until one is made', () => {
    const wrapper = mountPage()
    expect(wrapper.find('h1').text()).toBe('Chat-sleutel')
    expect(wrapper.find('header').attributes('data-back')).toBe('/projecten')
    expect(wrapper.find('textarea').exists()).toBe(false)
    expect(button(wrapper, 'Maak chat-sleutel').exists()).toBe(true)
  })

  it('makes a key and shows it with its expiry', async () => {
    mockCreate.mockResolvedValue(KEY)
    const wrapper = mountPage()
    await button(wrapper, 'Maak chat-sleutel').trigger('click')
    await flushPromises()
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe(KEY.key)
    expect(wrapper.find('label').text()).toContain('geldig tot')
    expect(wrapper.find('label').text()).toContain('2026')
    expect(button(wrapper, 'Maak een nieuwe chat-sleutel').exists()).toBe(true)
  })

  it('selects the key on focus', async () => {
    mockCreate.mockResolvedValue(KEY)
    const wrapper = mountPage()
    await button(wrapper, 'Maak chat-sleutel').trigger('click')
    await flushPromises()
    const textarea = wrapper.find('textarea').element as HTMLTextAreaElement
    const select = vi.spyOn(textarea, 'select')
    await wrapper.find('textarea').trigger('focus')
    expect(select).toHaveBeenCalled()
  })

  it('copies the key, and says so when copying fails', async () => {
    mockCreate.mockResolvedValue(KEY)
    const wrapper = mountPage()
    await button(wrapper, 'Maak chat-sleutel').trigger('click')
    await flushPromises()

    writeText.mockResolvedValue(undefined)
    await button(wrapper, 'Kopieer sleutel').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith(KEY.key)
    expect(wrapper.find('[role="status"]').text()).toBe('Gekopieerd.')

    writeText.mockRejectedValue(new Error('geen toegang'))
    await button(wrapper, 'Kopieer sleutel').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="status"]').text()).toContain('Kopiëren lukte niet')
  })

  it('shows the server message when keys are off, and a retry hint otherwise', async () => {
    const wrapper = mountPage()
    mockCreate.mockRejectedValue(new ApiError('Deze omgeving heeft geen CHAT_KEY_SECRET.', 503))
    await button(wrapper, 'Maak chat-sleutel').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toBe('Deze omgeving heeft geen CHAT_KEY_SECRET.')

    mockCreate.mockRejectedValue(new ApiError('Serverfout', 500))
    await button(wrapper, 'Maak chat-sleutel').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toContain('Probeer het opnieuw')

    mockCreate.mockRejectedValue(new Error('netwerk'))
    await button(wrapper, 'Maak chat-sleutel').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toContain('Probeer het opnieuw')
  })
})

/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const { loadSourceManifest } = vi.hoisted(() => ({ loadSourceManifest: vi.fn() }))
vi.mock('../../src/sourceManifest', () => ({ loadSourceManifest: () => loadSourceManifest() }))

import ModellenPage from '../../src/views/ModellenPage.vue'

const AppHeaderStub = {
  name: 'AppHeader',
  props: ['backLabel', 'backRoute', 'showBack'],
  template: '<header class="app-header-stub" :data-show-back="String(showBack)"></header>',
}

// A manifest exercising every branch: official + concept, latest-official marker,
// releasedAt/changelog present and absent, and an unknown type (label fallback).
const MANIFEST = {
  schemaVersion: 1,
  types: {
    dpia: {
      latestOfficial: '3.0',
      begrippenkader: 'begrippenkader_dpia.yaml',
      versions: [
        {
          version: '3.0',
          channel: 'official',
          file: 'dpia/3.0.yaml',
          releasedAt: '2026-01-01',
          changelog: ['Eerste vastgestelde versie'],
        },
        { version: '3.1.0-concept.1', channel: 'concept', file: 'dpia/3.1-concept.yaml' },
      ],
    },
    onbekend: {
      latestOfficial: '1.0',
      begrippenkader: 'x.yaml',
      versions: [{ version: '1.0', channel: 'official', file: 'x/1.0.yaml', releasedAt: 'geen-datum' }],
    },
  },
}

function mountPage() {
  return mount(ModellenPage, { global: { stubs: { AppHeader: AppHeaderStub } } })
}

beforeEach(() => {
  loadSourceManifest.mockReset()
  Object.defineProperty(window.history, 'state', { value: null, configurable: true })
})

afterEach(() => {
  Object.defineProperty(window.history, 'state', { value: null, configurable: true })
})

describe('ModellenPage', () => {
  it('shows the loading state before the manifest resolves', () => {
    loadSourceManifest.mockReturnValue(new Promise(() => {}))
    const wrapper = mountPage()
    expect(wrapper.find('[data-test="loading"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="type-dpia"]').exists()).toBe(false)
  })

  it('renders each type with versions, channel tags, latest marker, releasedAt and changelog', async () => {
    loadSourceManifest.mockResolvedValue(MANIFEST)
    const wrapper = mountPage()
    await flushPromises()

    // Known + unknown type labels.
    expect(wrapper.find('[data-test="type-dpia"]').text()).toContain('DPIA')
    expect(wrapper.find('[data-test="type-onbekend"]').text()).toContain('onbekend')

    // Official vs concept channel tags.
    expect(wrapper.find('[data-test="channel-dpia-3.0"]').text()).toContain('Officieel')
    expect(wrapper.find('[data-test="channel-dpia-3.1.0-concept.1"]').text()).toContain('Concept')

    // Latest-official marker present (only on 3.0).
    expect(wrapper.find('[data-test="latest-dpia"]').exists()).toBe(true)

    // releasedAt + changelog present on 3.0, absent on the concept.
    // Valid ISO -> Dutch long date; unparseable value falls back to the raw string.
    expect(wrapper.find('[data-test="released-dpia-3.0"]').text()).toContain('januari')
    expect(wrapper.find('[data-test="released-onbekend-1.0"]').text()).toContain('geen-datum')
    expect(wrapper.find('[data-test="changelog-dpia-3.0"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="released-dpia-3.1.0-concept.1"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="changelog-dpia-3.1.0-concept.1"]').exists()).toBe(false)

    expect(wrapper.find('[data-test="loading"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="error"]').exists()).toBe(false)
  })

  it('shows the error state when the manifest fails to load', async () => {
    loadSourceManifest.mockRejectedValue(new Error('nope'))
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.find('[data-test="error"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="type-dpia"]').exists()).toBe(false)
  })

  it('offers a "Terug" header action when there is back history', async () => {
    Object.defineProperty(window.history, 'state', { value: { back: '/projecten' }, configurable: true })
    loadSourceManifest.mockResolvedValue(MANIFEST)
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.find('.app-header-stub').attributes('data-show-back')).toBe('true')
  })
})

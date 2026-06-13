import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MarkdownToolbar from '../../src/components/task/MarkdownToolbar.vue'

function tabindexes(wrapper: ReturnType<typeof mount>): string[] {
  return wrapper.findAll('button').map((b) => b.attributes('tabindex') ?? '')
}

describe('MarkdownToolbar.vue', () => {
  it('renders a labelled toolbar with one tab stop (roving tabindex)', () => {
    const wrapper = mount(MarkdownToolbar)
    const toolbar = wrapper.find('[role="toolbar"]')
    expect(toolbar.exists()).toBe(true)
    expect(toolbar.attributes('aria-label')).toBe('Tekstopmaak')
    expect(wrapper.findAll('button')).toHaveLength(6)
    expect(tabindexes(wrapper)).toEqual(['0', '-1', '-1', '-1', '-1', '-1'])
    expect(wrapper.find('button').attributes('aria-label')).toBe('Vet')
  })

  it('emits the matching command when a button is clicked', async () => {
    const wrapper = mount(MarkdownToolbar)
    await wrapper.findAll('button')[2].trigger('click') // heading
    expect(wrapper.emitted('command')?.[0]).toEqual(['heading'])
  })

  it('moves the tab stop with ArrowRight/ArrowLeft including wraparound', async () => {
    const wrapper = mount(MarkdownToolbar)
    const toolbar = wrapper.find('[role="toolbar"]')

    await toolbar.trigger('keydown', { key: 'ArrowRight' }) // 0 -> 1
    expect(tabindexes(wrapper)[1]).toBe('0')

    await toolbar.trigger('keydown', { key: 'ArrowLeft' }) // 1 -> 0
    expect(tabindexes(wrapper)[0]).toBe('0')

    await toolbar.trigger('keydown', { key: 'ArrowLeft' }) // 0 -> last (wrap)
    expect(tabindexes(wrapper)[5]).toBe('0')

    await toolbar.trigger('keydown', { key: 'ArrowRight' }) // last -> 0 (wrap)
    expect(tabindexes(wrapper)[0]).toBe('0')
  })

  it('jumps to the ends with Home and End', async () => {
    const wrapper = mount(MarkdownToolbar)
    const toolbar = wrapper.find('[role="toolbar"]')

    await toolbar.trigger('keydown', { key: 'End' })
    expect(tabindexes(wrapper)[5]).toBe('0')

    await toolbar.trigger('keydown', { key: 'Home' })
    expect(tabindexes(wrapper)[0]).toBe('0')
  })

  it('ignores keys that are not toolbar navigation', async () => {
    const wrapper = mount(MarkdownToolbar)
    const toolbar = wrapper.find('[role="toolbar"]')
    await toolbar.trigger('keydown', { key: 'a' })
    expect(tabindexes(wrapper)).toEqual(['0', '-1', '-1', '-1', '-1', '-1'])
  })

  it('updates the active control when a button receives focus', async () => {
    const wrapper = mount(MarkdownToolbar)
    await wrapper.findAll('button')[3].trigger('focus')
    expect(tabindexes(wrapper)[3]).toBe('0')
  })
})

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MarkdownToolbar from '../../src/components/task/MarkdownToolbar.vue'

const DEFAULT_PROPS = { headingLevels: [2, 3, 4, 5, 6], activeHeadingLevel: null as number | null }

function mountToolbar(props: Partial<typeof DEFAULT_PROPS> = {}) {
  return mount(MarkdownToolbar, { props: { ...DEFAULT_PROPS, ...props } })
}

// All roving controls in DOM order: the heading dropdown (index 0) then the buttons.
function controlTabindexes(wrapper: ReturnType<typeof mount>): string[] {
  return wrapper
    .findAll('select.markdown-toolbar__heading, button.markdown-toolbar__button')
    .map((c) => c.attributes('tabindex') ?? '')
}

// select + 9 buttons; only one is the tab stop at a time.
const ALL_BUT_FIRST = ['-1', '-1', '-1', '-1', '-1', '-1', '-1', '-1', '-1']

describe('MarkdownToolbar.vue', () => {
  it('renders a labelled toolbar that is a single tab stop starting on the dropdown', () => {
    const wrapper = mountToolbar()
    const toolbar = wrapper.find('[role="toolbar"]')
    expect(toolbar.exists()).toBe(true)
    expect(toolbar.attributes('aria-label')).toBe('Tekstopmaak')
    expect(wrapper.findAll('button')).toHaveLength(9)
    // The dropdown holds the tab stop; every button starts at -1.
    expect(controlTabindexes(wrapper)).toEqual(['0', ...ALL_BUT_FIRST])
    expect(wrapper.find('button').attributes('aria-label')).toBe('Vet')
  })

  it('renders a heading-level dropdown with "Gewone tekst" plus one "Kop N" per level', () => {
    const wrapper = mountToolbar()
    const select = wrapper.find('select.markdown-toolbar__heading')
    expect(select.attributes('aria-label')).toBe('Kopniveau')
    const options = select.findAll('option')
    expect(options.map((o) => o.text())).toEqual(['Gewone tekst', 'Kop 1', 'Kop 2', 'Kop 3', 'Kop 4', 'Kop 5'])
    expect(options.map((o) => (o.element as HTMLOptionElement).value)).toEqual(['', '2', '3', '4', '5', '6'])
  })

  it('reflects the active block in the dropdown value (level, or empty for a paragraph)', () => {
    expect((mountToolbar({ activeHeadingLevel: 3 }).find('select').element as HTMLSelectElement).value).toBe('3')
    expect((mountToolbar({ activeHeadingLevel: null }).find('select').element as HTMLSelectElement).value).toBe('')
  })

  it('emits the chosen heading level, and null when "Gewone tekst" is picked', async () => {
    const wrapper = mountToolbar()
    const select = wrapper.find('select')
    await select.setValue('4')
    expect(wrapper.emitted('heading')?.at(-1)).toEqual([4])
    await select.setValue('')
    expect(wrapper.emitted('heading')?.at(-1)).toEqual([null])
  })

  it('shows the keyboard shortcut in the tooltip, or just the label when there is none', () => {
    const wrapper = mountToolbar()
    // Vet has a shortcut (Mod+B); Doorhalen adds Shift; Link has none.
    expect(wrapper.find('button[aria-label="Vet"]').attributes('title')).toMatch(/^Vet \((⌘|Ctrl\+)B\)$/)
    expect(wrapper.find('button[aria-label="Doorhalen"]').attributes('title')).toMatch(/(⇧|Shift\+)S/)
    expect(wrapper.find('button[aria-label="Link"]').attributes('title')).toBe('Link')
  })

  it('emits the matching command when a button is clicked', async () => {
    const wrapper = mountToolbar()
    await wrapper.find('button[aria-label="Citaat"]').trigger('click')
    expect(wrapper.emitted('command')?.at(-1)).toEqual(['blockquote'])
  })

  it('prevents the default mousedown so the editor keeps focus and selection', () => {
    const wrapper = mountToolbar()
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    wrapper.find('button').element.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })

  it('rotates the tab stop across the dropdown and buttons with ArrowRight/ArrowLeft (wraparound)', async () => {
    const wrapper = mountToolbar()
    const toolbar = wrapper.find('[role="toolbar"]')

    await toolbar.trigger('keydown', { key: 'ArrowRight' }) // select(0) -> Vet(1)
    expect(controlTabindexes(wrapper)[1]).toBe('0')

    await toolbar.trigger('keydown', { key: 'ArrowLeft' }) // Vet(1) -> select(0)
    expect(controlTabindexes(wrapper)[0]).toBe('0')

    await toolbar.trigger('keydown', { key: 'ArrowLeft' }) // select(0) -> last button (wrap)
    expect(controlTabindexes(wrapper)[9]).toBe('0')

    await toolbar.trigger('keydown', { key: 'ArrowRight' }) // last -> select(0) (wrap)
    expect(controlTabindexes(wrapper)[0]).toBe('0')
  })

  it('jumps to the ends with Home and End', async () => {
    const wrapper = mountToolbar()
    const toolbar = wrapper.find('[role="toolbar"]')

    await toolbar.trigger('keydown', { key: 'End' })
    expect(controlTabindexes(wrapper)[9]).toBe('0')

    await toolbar.trigger('keydown', { key: 'Home' })
    expect(controlTabindexes(wrapper)[0]).toBe('0')
  })

  it('leaves Up/Down to the dropdown (only Left/Right/Home/End rove)', async () => {
    const wrapper = mountToolbar()
    const toolbar = wrapper.find('[role="toolbar"]')
    await toolbar.trigger('keydown', { key: 'ArrowDown' }) // native option-cycling, not roving
    expect(controlTabindexes(wrapper)).toEqual(['0', ...ALL_BUT_FIRST])
    await toolbar.trigger('keydown', { key: 'a' }) // unrelated key
    expect(controlTabindexes(wrapper)).toEqual(['0', ...ALL_BUT_FIRST])
  })

  it('updates the active control when the dropdown or a button receives focus', async () => {
    const wrapper = mountToolbar()
    await wrapper.findAll('button')[3].trigger('focus') // 4th button -> control index 4
    expect(controlTabindexes(wrapper)[4]).toBe('0')
    await wrapper.find('select').trigger('focus') // back to the dropdown
    expect(controlTabindexes(wrapper)[0]).toBe('0')
  })
})

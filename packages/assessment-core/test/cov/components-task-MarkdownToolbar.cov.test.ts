import { describe, it, expect } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import MarkdownToolbar from '../../src/components/task/MarkdownToolbar.vue'

type Props = { headingLevels: number[]; activeBlock: number | null; activeMarks: Record<string, boolean> }
const DEFAULTS: Props = { headingLevels: [1, 2, 3, 4, 5, 6], activeBlock: null, activeMarks: {} }

function mountToolbar(props: Partial<Props> = {}) {
  return mount(MarkdownToolbar, { props: { ...DEFAULTS, ...props }, attachTo: document.body })
}

function controlTabindexes(wrapper: ReturnType<typeof mount>): string[] {
  return wrapper.findAll('.markdown-toolbar__control').map((c) => c.attributes('tabindex') ?? '')
}

function blockButton(wrapper: ReturnType<typeof mount>) {
  return wrapper.find('.markdown-toolbar__block-button')
}

// block dropdown (index 0) + 11 buttons.
const BUTTONS_MINUS = Array(11).fill('-1')

describe('MarkdownToolbar.vue', () => {
  it('renders a labelled toolbar: block dropdown (tab stop) + grouped buttons with separators', () => {
    const wrapper = mountToolbar()
    const toolbar = wrapper.find('[role="toolbar"]')
    expect(toolbar.attributes('aria-label')).toBe('Tekstopmaak')
    expect(wrapper.findAll('.markdown-toolbar__button')).toHaveLength(11)
    expect(wrapper.findAll('.markdown-toolbar__sep')).toHaveLength(3)
    expect(controlTabindexes(wrapper)).toEqual(['0', ...BUTTONS_MINUS]) // dropdown holds the tab stop
    expect(wrapper.findAll('.markdown-toolbar__button').map((b) => b.attributes('aria-label'))).toEqual([
      'Vet', 'Cursief', 'Onderstrepen', 'Doorhalen', 'Opsommingslijst', 'Genummerde lijst', 'Citaat', 'Link', 'Scheidingslijn', 'Code', 'Codeblok',
    ])
  })

  it('shows the current block on the dropdown button (paragraph, heading, or out-of-range fallback)', () => {
    expect(blockButton(mountToolbar({ activeBlock: null })).text()).toContain('Paragraaf')
    expect(blockButton(mountToolbar({ activeBlock: 2 })).text()).toContain('Kop 2')
    expect(blockButton(mountToolbar({ activeBlock: 2 })).text()).toContain('H2')
    // An out-of-range level falls back to the first option (Paragraaf).
    expect(blockButton(mountToolbar({ activeBlock: 99 })).text()).toContain('Paragraaf')
  })

  it('opens the block menu with Paragraaf + Kop 1..6 and a check on the active option', async () => {
    const wrapper = mountToolbar({ activeBlock: 2 })
    expect(wrapper.find('.markdown-toolbar__menu').exists()).toBe(false)
    await blockButton(wrapper).trigger('click')
    await flushPromises()
    const items = wrapper.findAll('.markdown-toolbar__menuitem')
    expect(items.map((i) => i.find('.markdown-toolbar__menuitem-label').text())).toEqual([
      'Paragraaf', 'Kop 1', 'Kop 2', 'Kop 3', 'Kop 4', 'Kop 5', 'Kop 6',
    ])
    expect(items.map((i) => i.find('.markdown-toolbar__block-marker').text())).toEqual(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'])
    // The active option (Kop 2) is marked and carries the check icon.
    const active = items.filter((i) => i.classes().includes('is-active'))
    expect(active).toHaveLength(1)
    expect(active[0].text()).toContain('Kop 2')
    expect(active[0].find('.markdown-toolbar__check').exists()).toBe(true)
  })

  it('emits the chosen level (null for Paragraaf) and closes the menu when an option is picked', async () => {
    const wrapper = mountToolbar({ activeBlock: 2 })
    await blockButton(wrapper).trigger('click')
    await flushPromises()
    // A menu item keeps the editor selection by preventing its mousedown.
    const md = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    wrapper.find('.markdown-toolbar__menuitem').element.dispatchEvent(md)
    expect(md.defaultPrevented).toBe(true)
    await wrapper.findAll('.markdown-toolbar__menuitem').find((i) => i.text().includes('Kop 4'))!.trigger('click')
    expect(wrapper.emitted('heading')?.at(-1)).toEqual([4])
    expect(wrapper.find('.markdown-toolbar__menu').exists()).toBe(false)

    await blockButton(wrapper).trigger('click')
    await flushPromises()
    await wrapper.findAll('.markdown-toolbar__menuitem').find((i) => i.text().includes('Paragraaf'))!.trigger('click')
    expect(wrapper.emitted('heading')?.at(-1)).toEqual([null])
  })

  it('toggles the menu shut on a second click and closes it when focus leaves the dropdown', async () => {
    const wrapper = mountToolbar()
    await blockButton(wrapper).trigger('click') // open (no active option -> focuses first)
    await flushPromises()
    await blockButton(wrapper).trigger('click') // toggle shut
    expect(wrapper.find('.markdown-toolbar__menu').exists()).toBe(false)

    await blockButton(wrapper).trigger('click')
    await flushPromises()
    // focus moves inside the dropdown -> stays open
    await wrapper.find('.markdown-toolbar__block').trigger('focusout', { relatedTarget: wrapper.find('.markdown-toolbar__menuitem').element })
    expect(wrapper.find('.markdown-toolbar__menu').exists()).toBe(true)
    // focus leaves the dropdown (null relatedTarget) -> closes
    await wrapper.find('.markdown-toolbar__block').trigger('focusout', { relatedTarget: null })
    expect(wrapper.find('.markdown-toolbar__menu').exists()).toBe(false)

    await blockButton(wrapper).trigger('click')
    await flushPromises()
    // focus leaves to an element outside the dropdown -> closes
    await wrapper.find('.markdown-toolbar__block').trigger('focusout', { relatedTarget: document.body })
    expect(wrapper.find('.markdown-toolbar__menu').exists()).toBe(false)
  })

  it('navigates the menu with Up/Down and closes on Escape', async () => {
    const wrapper = mountToolbar()
    await blockButton(wrapper).trigger('click')
    await flushPromises()
    const items = wrapper.findAll('.markdown-toolbar__menuitem')
    items[0].element.focus()
    const menu = wrapper.find('.markdown-toolbar__menu')
    await menu.trigger('keydown', { key: 'ArrowDown' }) // 0 -> 1
    expect(document.activeElement).toBe(items[1].element)
    await menu.trigger('keydown', { key: 'ArrowUp' }) // 1 -> 0
    expect(document.activeElement).toBe(items[0].element)
    await menu.trigger('keydown', { key: 'ArrowUp' }) // 0 -> last (wrap)
    expect(document.activeElement).toBe(items[items.length - 1].element)
    await menu.trigger('keydown', { key: 'ArrowDown' }) // last -> 0 (wrap)
    expect(document.activeElement).toBe(items[0].element)
    await menu.trigger('keydown', { key: 'x' }) // ignored
    expect(wrapper.find('.markdown-toolbar__menu').exists()).toBe(true)
    await menu.trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('.markdown-toolbar__menu').exists()).toBe(false)
  })

  it('focuses the active option when opening, or the first option when none is active', async () => {
    const withActive = mountToolbar({ activeBlock: 3 })
    await blockButton(withActive).trigger('click')
    await flushPromises()
    expect((document.activeElement as HTMLElement).textContent).toContain('Kop 3')

    const noActive = mountToolbar({ activeBlock: 99 }) // out of range -> no active option
    await blockButton(noActive).trigger('click')
    await flushPromises()
    expect((document.activeElement as HTMLElement).textContent).toContain('Paragraaf')
  })

  it('lights up active toggle buttons (is-active + aria-pressed) and the link button when on a link', () => {
    const wrapper = mountToolbar({ activeMarks: { bold: true, blockquote: false, link: true } })
    const bold = wrapper.find('button[aria-label="Vet"]')
    expect(bold.classes()).toContain('is-active')
    expect(bold.attributes('aria-pressed')).toBe('true')
    const quote = wrapper.find('button[aria-label="Citaat"]')
    expect(quote.classes()).not.toContain('is-active')
    expect(quote.attributes('aria-pressed')).toBe('false')
    // Link highlights when the cursor is on a link, but it is not a toggle (no aria-pressed).
    const link = wrapper.find('button[aria-label="Link"]')
    expect(link.classes()).toContain('is-active')
    expect(link.attributes('aria-pressed')).toBeUndefined()
    // Divider is neither active nor pressed.
    expect(wrapper.find('button[aria-label="Scheidingslijn"]').classes()).not.toContain('is-active')
    expect(wrapper.find('button[aria-label="Scheidingslijn"]').attributes('aria-pressed')).toBeUndefined()
  })

  it('shows the keyboard shortcut in the tooltip, or just the label when there is none', () => {
    const wrapper = mountToolbar()
    expect(wrapper.find('button[aria-label="Vet"]').attributes('title')).toMatch(/^Vet \((⌘|Ctrl\+)B\)$/)
    expect(wrapper.find('button[aria-label="Doorhalen"]').attributes('title')).toMatch(/(⇧|Shift\+)S/)
    expect(wrapper.find('button[aria-label="Codeblok"]').attributes('title')).toBe('Codeblok')
    expect(wrapper.find('button[aria-label="Link"]').attributes('title')).toBe('Link')
  })

  it('emits the matching command and prevents the default mousedown so the editor keeps its selection', async () => {
    const wrapper = mountToolbar()
    await wrapper.find('button[aria-label="Codeblok"]').trigger('click')
    expect(wrapper.emitted('command')?.at(-1)).toEqual(['codeBlock'])
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    wrapper.find('button[aria-label="Vet"]').element.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })

  it('rotates the single tab stop across the dropdown and buttons (Arrow/Home/End, wraparound)', async () => {
    const wrapper = mountToolbar()
    const toolbar = wrapper.find('[role="toolbar"]')

    await toolbar.trigger('keydown', { key: 'ArrowRight' }) // dropdown(0) -> Vet(1)
    expect(controlTabindexes(wrapper)[1]).toBe('0')
    await toolbar.trigger('keydown', { key: 'ArrowLeft' }) // Vet(1) -> dropdown(0)
    expect(controlTabindexes(wrapper)[0]).toBe('0')
    await toolbar.trigger('keydown', { key: 'ArrowLeft' }) // dropdown(0) -> last (wrap)
    expect(controlTabindexes(wrapper)[11]).toBe('0')
    await toolbar.trigger('keydown', { key: 'ArrowRight' }) // last -> dropdown(0) (wrap)
    expect(controlTabindexes(wrapper)[0]).toBe('0')
    await toolbar.trigger('keydown', { key: 'End' })
    expect(controlTabindexes(wrapper)[11]).toBe('0')
    await toolbar.trigger('keydown', { key: 'Home' })
    expect(controlTabindexes(wrapper)[0]).toBe('0')
  })

  it('ignores non-navigation keys and keys originating from the open menu', async () => {
    const wrapper = mountToolbar()
    const toolbar = wrapper.find('[role="toolbar"]')
    await toolbar.trigger('keydown', { key: 'ArrowDown' }) // not a roving key
    expect(controlTabindexes(wrapper)).toEqual(['0', ...BUTTONS_MINUS])
    // A key bubbling from the menu must not move the toolbar tab stop.
    await blockButton(wrapper).trigger('click')
    await flushPromises()
    await wrapper.find('.markdown-toolbar__menuitem').trigger('keydown', { key: 'ArrowRight' })
    expect(controlTabindexes(wrapper)[0]).toBe('0')
  })

  it('updates the active control when the dropdown or a button receives focus', async () => {
    const wrapper = mountToolbar()
    await wrapper.findAll('.markdown-toolbar__button')[2].trigger('focus') // 3rd button -> control index 3
    expect(controlTabindexes(wrapper)[3]).toBe('0')
    await blockButton(wrapper).trigger('focus')
    expect(controlTabindexes(wrapper)[0]).toBe('0')
  })
})

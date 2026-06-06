import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import SaveForm from '../../src/components/SaveForm.vue'
import { useTaskStore } from '../../src/stores/tasks'
import { FormType } from '../../src/models/dpia'

const UiButtonStub = {
  name: 'UiButton',
  props: ['variant', 'label'],
  emits: ['click'],
  template:
    '<button :data-variant="variant" :data-label="label" @click="$emit(\'click\', $event)">{{ label }}</button>',
}

function mountSaveForm(isOpen: boolean) {
  return mount(SaveForm, {
    props: { isOpen },
    global: {
      stubs: { UiButton: UiButtonStub },
    },
  })
}

describe('SaveForm.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('rendering (v-if isOpen)', () => {
    it('renders the modal when isOpen is true', () => {
      const wrapper = mountSaveForm(true)
      expect(wrapper.find('.modal-overlay').exists()).toBe(true)
      expect(wrapper.find('.save-modal').exists()).toBe(true)
      expect(wrapper.find('#save-form-title').exists()).toBe(true)
    })

    it('renders nothing when isOpen is false', () => {
      const wrapper = mountSaveForm(false)
      expect(wrapper.find('.modal-overlay').exists()).toBe(false)
      expect(wrapper.find('.save-modal').exists()).toBe(false)
    })
  })

  describe('formName computed', () => {
    it('shows "DPIA" when active namespace is DPIA', () => {
      const taskStore = useTaskStore()
      taskStore.setActiveNamespace(FormType.DPIA)

      const wrapper = mountSaveForm(true)
      const title = wrapper.find('#save-form-title')
      expect(title.text()).toContain('Sla je DPIA op als bestand')
    })

    it('shows "Pre-scan DPIA" when active namespace is not DPIA', () => {
      const taskStore = useTaskStore()
      taskStore.setActiveNamespace(FormType.PRE_SCAN)

      const wrapper = mountSaveForm(true)
      const title = wrapper.find('#save-form-title')
      expect(title.text()).toContain('Sla je Pre-scan DPIA op als bestand')
    })
  })

  describe('filename computed', () => {
    it('renders a generated filename based on the active namespace', () => {
      const taskStore = useTaskStore()
      taskStore.setActiveNamespace(FormType.DPIA)

      const wrapper = mountSaveForm(true)
      expect(wrapper.text()).toMatch(/Bestandsnaam: dpia_.+\.json/)
    })

    it('reflects the prescan namespace in the filename', () => {
      const taskStore = useTaskStore()
      taskStore.setActiveNamespace(FormType.PRE_SCAN)

      const wrapper = mountSaveForm(true)
      expect(wrapper.text()).toMatch(/Bestandsnaam: prescan_.+\.json/)
    })
  })

  describe('closeModal via Annuleren button', () => {
    it('emits "close" when the cancel button is clicked', async () => {
      const wrapper = mountSaveForm(true)
      const cancelButton = wrapper
        .findAll('button')
        .find((b) => b.attributes('data-label') === 'Annuleren')!
      await cancelButton.trigger('click')

      expect(wrapper.emitted('close')).toHaveLength(1)
      expect(wrapper.emitted('save')).toBeUndefined()
    })
  })

  describe('handleSave via Bestand maken button', () => {
    it('emits "save" with the filename and then "close"', async () => {
      const taskStore = useTaskStore()
      taskStore.setActiveNamespace(FormType.DPIA)

      const wrapper = mountSaveForm(true)
      const saveButton = wrapper
        .findAll('button')
        .find((b) => b.attributes('data-label') === 'Bestand maken')!
      await saveButton.trigger('click')

      const saveEvents = wrapper.emitted('save')
      expect(saveEvents).toHaveLength(1)
      expect(saveEvents![0][0]).toMatch(/^dpia_.+\.json$/)

      expect(wrapper.emitted('close')).toHaveLength(1)
    })
  })

  describe('handleClickOutside', () => {
    it('closes when clicking the overlay (outside the modal content)', async () => {
      const wrapper = mountSaveForm(true)
      await wrapper.find('.modal-overlay').trigger('click')

      expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it('does NOT close when clicking inside the modal content', async () => {
      const wrapper = mountSaveForm(true)
      // target must be inside .save-modal so saveFormRef.contains(target) is true -> no close
      const overlay = wrapper.find('.modal-overlay').element as HTMLElement
      const inner = wrapper.find('.save-modal').element as HTMLElement
      const event = new MouseEvent('click', { bubbles: true })
      Object.defineProperty(event, 'target', { value: inner })
      overlay.dispatchEvent(event)
      await wrapper.vm.$nextTick()

      expect(wrapper.emitted('close')).toBeUndefined()
    })
  })

  describe('handleKeyDown (document ESC listener)', () => {
    it('closes the modal on Escape when isOpen is true', async () => {
      const wrapper = mountSaveForm(true)

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      await wrapper.vm.$nextTick()

      expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it('does nothing on Escape when isOpen is false', async () => {
      const wrapper = mountSaveForm(false)

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      await wrapper.vm.$nextTick()

      expect(wrapper.emitted('close')).toBeUndefined()
    })

    it('does nothing for non-Escape keys', async () => {
      const wrapper = mountSaveForm(true)

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
      await wrapper.vm.$nextTick()

      expect(wrapper.emitted('close')).toBeUndefined()
    })
  })

  describe('lifecycle (onMounted/onUnmounted listener registration)', () => {
    it('removes the keydown listener on unmount so it no longer reacts', async () => {
      const removeSpy = vi.spyOn(document, 'removeEventListener')
      const wrapper = mountSaveForm(true)

      wrapper.unmount()
      expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function))

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      expect(wrapper.emitted('close')).toBeUndefined()

      removeSpy.mockRestore()
    })
  })
})

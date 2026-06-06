import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import FileUploadPage from '../../src/components/FileUploadPage.vue'
import { useTaskStore } from '../../src/stores/tasks'
import { FormType } from '../../src/models/dpia'
import type { AssessmentState } from '../../src/models/assessmentState'

const importFromJson = vi.fn()
vi.mock('../../src/utils/jsonExport', () => ({
  importFromJson: (...args: unknown[]) => importFromJson(...args),
}))

const UiButtonStub = {
  name: 'UiButton',
  props: ['variant', 'label', 'icon', 'disabled'],
  emits: ['click'],
  template:
    '<button :data-label="label" :data-icon="icon" :disabled="disabled" @click="$emit(\'click\', $event)">{{ label }}</button>',
}

function mountPage(onStart?: (fileData?: AssessmentState) => void) {
  return mount(FileUploadPage, {
    global: { stubs: { UiButton: UiButtonStub } },
    attrs: onStart ? { onStart } : {},
  })
}

function fileChangeEvent(files: File[] | null): Event {
  return { target: { files } } as unknown as Event
}

const sampleState: AssessmentState = {
  metadata: { createdAt: '2026-01-01T00:00:00Z' },
  answers: {},
}

describe('FileUploadPage.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    importFromJson.mockReset()
  })

  describe('namespace-driven computed text (dpia branch)', () => {
    it('renders DPIA label, intro and upload text when activeNamespace is dpia', () => {
      const taskStore = useTaskStore()
      taskStore.activeNamespace = FormType.DPIA

      const wrapper = mountPage()

      expect(wrapper.find('h1').text()).toBe('Start de DPIA')
      expect(wrapper.find('#file-upload-helper').html()).toContain(
        'Deze tool begeleidt je stap voor stap bij het uitvoeren van een DPIA.',
      )
      expect(wrapper.find('label#file-upload-label').text()).toContain(
        'Heb je al eerder een pre-scan of DPIA ingevuld voor deze gegevensverwerking? Upload het PDF- of JSON-bestand hier om verder te werken.',
      )
      expect(wrapper.find('button').attributes('data-label')).toBe('Beginnen met de DPIA')
    })
  })

  describe('namespace-driven computed text (pre-scan branch)', () => {
    it('renders pre-scan label, intro and upload text when activeNamespace is prescan', () => {
      const taskStore = useTaskStore()
      taskStore.activeNamespace = FormType.PRE_SCAN

      const wrapper = mountPage()

      expect(wrapper.find('h1').text()).toBe('Start de pre-scan')
      expect(wrapper.find('#file-upload-helper').html()).toContain(
        'Met de pre-scan toets je of een DPIA, DTIA, IAMA of KIA nodig is.',
      )
      expect(wrapper.find('label#file-upload-label').text()).toContain(
        'Heb je al eerder een pre-scan ingevuld voor deze gegevensverwerking?',
      )
      expect(wrapper.find('button').attributes('data-label')).toBe('Beginnen met de pre-scan')
    })
  })

  describe('handleFileSelect', () => {
    it('stores the selected file and clears any prior error', async () => {
      const wrapper = mountPage()
      const vm = wrapper.vm as unknown as {
        uploadedFile: File | null
        fileUploadError: string | null
        handleFileSelect: (e: Event) => void
      }
      vm.fileUploadError = 'oude fout'

      const file = new File(['{}'], 'state.json', { type: 'application/json' })
      vm.handleFileSelect(fileChangeEvent([file]))

      expect(vm.uploadedFile).toBe(file)
      expect(vm.fileUploadError).toBeNull()
    })

    it('ignores the event when there are no files (empty list)', () => {
      const wrapper = mountPage()
      const vm = wrapper.vm as unknown as {
        uploadedFile: File | null
        handleFileSelect: (e: Event) => void
      }

      vm.handleFileSelect(fileChangeEvent([]))
      expect(vm.uploadedFile).toBeNull()
    })

    it('ignores the event when files is null', () => {
      const wrapper = mountPage()
      const vm = wrapper.vm as unknown as {
        uploadedFile: File | null
        handleFileSelect: (e: Event) => void
      }

      vm.handleFileSelect(fileChangeEvent(null))
      expect(vm.uploadedFile).toBeNull()
    })

    it('reacts to a real change event on the file input', async () => {
      const wrapper = mountPage()
      const input = wrapper.find('input#file-upload-field')
      // jsdom file inputs report an empty FileList, so a real change event hits the no-files branch.
      await input.trigger('change')
      const vm = wrapper.vm as unknown as { uploadedFile: File | null }
      expect(vm.uploadedFile).toBeNull()
    })
  })

  describe('startDpia without an uploaded file', () => {
    it('emits start with no argument and resets isProcessing', async () => {
      const onStart = vi.fn()
      const wrapper = mountPage(onStart)

      await wrapper.find('button').trigger('click')
      await flushPromises()

      expect(onStart).toHaveBeenCalledTimes(1)
      expect(onStart.mock.calls[0]).toEqual([])
      expect(importFromJson).not.toHaveBeenCalled()
      expect((wrapper.vm as unknown as { isProcessing: boolean }).isProcessing).toBe(false)
      expect(wrapper.find('.rvo-alert--warning').exists()).toBe(false)
    })
  })

  describe('startDpia with an uploaded file (success)', () => {
    it('imports the file and emits start with the parsed state', async () => {
      importFromJson.mockResolvedValue(sampleState)
      const onStart = vi.fn()
      const wrapper = mountPage(onStart)

      const file = new File(['{}'], 'state.json', { type: 'application/json' })
      ;(wrapper.vm as unknown as { uploadedFile: File | null }).uploadedFile = file

      await wrapper.find('button').trigger('click')
      await flushPromises()

      expect(importFromJson).toHaveBeenCalledWith(file)
      expect(onStart).toHaveBeenCalledTimes(1)
      expect(onStart.mock.calls[0][0]).toBe(sampleState)
      expect((wrapper.vm as unknown as { isProcessing: boolean }).isProcessing).toBe(false)
    })
  })

  describe('startDpia inner catch (import failure)', () => {
    it('shows the Error message when importFromJson rejects with an Error', async () => {
      importFromJson.mockRejectedValue(new Error('Ongeldig JSON-bestand'))
      const onStart = vi.fn()
      const wrapper = mountPage(onStart)

      const file = new File(['nope'], 'bad.json', { type: 'application/json' })
      ;(wrapper.vm as unknown as { uploadedFile: File | null }).uploadedFile = file

      await wrapper.find('button').trigger('click')
      await flushPromises()

      expect(onStart).not.toHaveBeenCalled()
      const alert = wrapper.find('.rvo-alert--warning')
      expect(alert.exists()).toBe(true)
      expect(alert.text()).toContain('Ongeldig JSON-bestand')
      expect((wrapper.vm as unknown as { isProcessing: boolean }).isProcessing).toBe(false)
    })

    it('shows a generic message when importFromJson rejects with a non-Error', async () => {
      importFromJson.mockRejectedValue('kapot')
      const onStart = vi.fn()
      const wrapper = mountPage(onStart)

      const file = new File(['nope'], 'bad.json', { type: 'application/json' })
      ;(wrapper.vm as unknown as { uploadedFile: File | null }).uploadedFile = file

      await wrapper.find('button').trigger('click')
      await flushPromises()

      expect(onStart).not.toHaveBeenCalled()
      const alert = wrapper.find('.rvo-alert--warning')
      expect(alert.exists()).toBe(true)
      expect(alert.text()).toContain('Fout bij het uploaden van het bestand')
    })
  })

  describe('startDpia outer catch (emit throws)', () => {
    it('shows the Error message when the start handler throws an Error', async () => {
      const onStart = vi.fn(() => {
        throw new Error('handler stuk')
      })
      const wrapper = mountPage(onStart)

      await wrapper.find('button').trigger('click')
      await flushPromises()

      const alert = wrapper.find('.rvo-alert--warning')
      expect(alert.exists()).toBe(true)
      expect(alert.text()).toContain('handler stuk')
      expect((wrapper.vm as unknown as { isProcessing: boolean }).isProcessing).toBe(false)
    })

    it('shows a generic message when the start handler throws a non-Error (no file)', async () => {
      const onStart = vi.fn(() => {
        throw 'oeps'
      })
      const wrapper = mountPage(onStart)

      await wrapper.find('button').trigger('click')
      await flushPromises()

      const alert = wrapper.find('.rvo-alert--warning')
      expect(alert.exists()).toBe(true)
      expect(alert.text()).toContain('Er is een onbekende fout opgetreden')
      expect((wrapper.vm as unknown as { isProcessing: boolean }).isProcessing).toBe(false)
    })
  })

  describe('isProcessing rendering', () => {
    it('switches the button label and icon while processing', async () => {
      const wrapper = mountPage()
      ;(wrapper.vm as unknown as { isProcessing: boolean }).isProcessing = true
      await wrapper.vm.$nextTick()

      const button = wrapper.find('button')
      expect(button.attributes('data-label')).toBe('Bezig met laden...')
      expect(button.attributes('data-icon')).toBe('refresh')
      expect(button.attributes('disabled')).toBeDefined()
    })
  })
})

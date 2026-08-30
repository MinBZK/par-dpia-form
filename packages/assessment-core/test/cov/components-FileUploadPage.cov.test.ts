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

const importFromPdf = vi.fn()
vi.mock('../../src/utils/pdfImport', () => ({
  importFromPdf: (...args: unknown[]) => importFromPdf(...args),
}))

function mountPage(onStart?: (fileData?: AssessmentState) => void) {
  return mount(FileUploadPage, {
    attrs: onStart ? { onStart } : {},
  })
}

function fileChangeEvent(files?: File[]): Event {
  return { detail: files ? { files } : undefined } as unknown as Event
}

const sampleState: AssessmentState = {
  metadata: { createdAt: '2026-01-01T00:00:00Z' },
  answers: {},
}

describe('FileUploadPage.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    importFromJson.mockReset()
    importFromPdf.mockReset()
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
      expect(wrapper.find('nldd-title h2').text()).toBe('Verdergaan met een eerder bestand')
      expect(wrapper.find('[slot="subtitle"]').text()).toContain(
        'Heb je al eerder een pre-scan of DPIA ingevuld voor deze gegevensverwerking?',
      )
      expect(wrapper.find('nldd-button').attributes('text')).toBe('Beginnen met de DPIA')
    })
  })

  describe('namespace-driven computed text (iama branch)', () => {
    it('renders IAMA label, intro and upload text when activeNamespace is iama', () => {
      const taskStore = useTaskStore()
      taskStore.activeNamespace = FormType.IAMA

      const wrapper = mountPage()

      expect(wrapper.find('h1').text()).toBe('Start het IAMA')
      expect(wrapper.find('#file-upload-helper').html()).toContain(
        'Deze tool begeleidt jouw projectteam stap voor stap bij het uitvoeren van een IAMA.',
      )
      expect(wrapper.find('#file-upload-helper').html()).toContain(
        'Het IAMA is een groepsproces en is niet bedoeld om individueel te doorlopen.',
      )
      expect(wrapper.find('#file-upload-helper a').attributes('href')).toBe(
        'https://www.rijksoverheid.nl/documenten/2026/02/16/toelichtingsdocument-impact-assessment-mensenrechten-en-algoritmes',
      )
      expect(wrapper.find('nldd-title h2').text()).toBe('Verdergaan met een eerder bestand')
      expect(wrapper.find('[slot="subtitle"]').text()).toContain('Heb je al eerder een IAMA ingevuld?')
      expect(wrapper.find('nldd-button').attributes('text')).toBe('Beginnen met het IAMA')
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
      // The heading stays short (nldd-title caps at 40ch); the question that
      // used to be the label now reads on the line below it.
      expect(wrapper.find('nldd-title h2').text()).toBe('Verdergaan met een eerder bestand')
      expect(wrapper.find('[slot="subtitle"]').text()).toBe(
        'Heb je al eerder een pre-scan ingevuld voor deze gegevensverwerking? ' +
          'Upload het PDF- of JSON-bestand om verder te werken.',
      )
      expect(wrapper.find('nldd-button').attributes('text')).toBe('Beginnen met de pre-scan')
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

    it('clears the stored file when the field is emptied (empty list)', () => {
      const wrapper = mountPage()
      const vm = wrapper.vm as unknown as {
        uploadedFile: File | null
        handleFileSelect: (e: Event) => void
      }
      vm.uploadedFile = new File(['{}'], 'oud.json', { type: 'application/json' })

      vm.handleFileSelect(fileChangeEvent([]))
      expect(vm.uploadedFile).toBeNull()
    })

    it('treats an event without detail as no files', () => {
      const wrapper = mountPage()
      const vm = wrapper.vm as unknown as {
        uploadedFile: File | null
        handleFileSelect: (e: Event) => void
      }

      vm.handleFileSelect(fileChangeEvent())
      expect(vm.uploadedFile).toBeNull()
    })

    it('reacts to a real change event on the file field', async () => {
      const wrapper = mountPage()
      // A bare DOM change event carries no detail, so it lands in the no-files branch.
      await wrapper.find('nldd-file-field').trigger('change')
      const vm = wrapper.vm as unknown as { uploadedFile: File | null }
      expect(vm.uploadedFile).toBeNull()
    })
  })

  describe('startDpia without an uploaded file', () => {
    it('emits start with no argument and resets isProcessing', async () => {
      const onStart = vi.fn()
      const wrapper = mountPage(onStart)

      await wrapper.find('nldd-button').trigger('click')
      await flushPromises()

      expect(onStart).toHaveBeenCalledTimes(1)
      expect(onStart.mock.calls[0]).toEqual([])
      expect(importFromJson).not.toHaveBeenCalled()
      expect((wrapper.vm as unknown as { isProcessing: boolean }).isProcessing).toBe(false)
      expect(wrapper.find('nldd-banner').exists()).toBe(false)
    })
  })

  describe('startDpia with an uploaded file (success)', () => {
    it('imports the file and emits start with the parsed state', async () => {
      importFromJson.mockResolvedValue(sampleState)
      const onStart = vi.fn()
      const wrapper = mountPage(onStart)

      const file = new File(['{}'], 'state.json', { type: 'application/json' })
      ;(wrapper.vm as unknown as { uploadedFile: File | null }).uploadedFile = file

      await wrapper.find('nldd-button').trigger('click')
      await flushPromises()

      expect(importFromJson).toHaveBeenCalledWith(file)
      expect(onStart).toHaveBeenCalledTimes(1)
      expect(onStart.mock.calls[0][0]).toBe(sampleState)
      expect((wrapper.vm as unknown as { isProcessing: boolean }).isProcessing).toBe(false)
    })

    it('routes a .pdf upload through importFromPdf (PDF ternary branch)', async () => {
      importFromPdf.mockResolvedValue(sampleState)
      const onStart = vi.fn()
      const wrapper = mountPage(onStart)

      const file = new File([new Uint8Array([1, 2])], 'rapport.PDF', { type: 'application/pdf' })
      ;(wrapper.vm as unknown as { uploadedFile: File | null }).uploadedFile = file

      await wrapper.find('nldd-button').trigger('click')
      await flushPromises()

      expect(importFromPdf).toHaveBeenCalledWith(file)
      expect(importFromJson).not.toHaveBeenCalled()
      expect(onStart).toHaveBeenCalledTimes(1)
      expect(onStart.mock.calls[0][0]).toBe(sampleState)
    })
  })

  describe('startDpia namespace-guard (mismatch tussen bestand en formulier)', () => {
    it('weigert een DPIA-bestand in het IAMA-formulier en emit geen start', async () => {
      const taskStore = useTaskStore()
      taskStore.activeNamespace = FormType.IAMA
      importFromJson.mockResolvedValue({
        metadata: { createdAt: '2026-01-01T00:00:00Z', urn: 'urn:nl:dpia:3.0' },
        answers: {},
      })
      const onStart = vi.fn()
      const wrapper = mountPage(onStart)

      const file = new File(['{}'], 'dpia.json', { type: 'application/json' })
      ;(wrapper.vm as unknown as { uploadedFile: File | null }).uploadedFile = file

      await wrapper.find('nldd-button').trigger('click')
      await flushPromises()

      expect(onStart).not.toHaveBeenCalled()
      const banner = wrapper.find('nldd-banner[variant="critical"]')
      expect(banner.exists()).toBe(true)
      expect(banner.attributes('text')).toContain('Dit bestand bevat geen IAMA-gegevens.')
      expect((wrapper.vm as unknown as { isProcessing: boolean }).isProcessing).toBe(false)
    })

    it('accepteert een pre-scan-bestand in het DPIA-formulier (cross-form prefill)', async () => {
      const taskStore = useTaskStore()
      taskStore.activeNamespace = FormType.DPIA
      const prescanState = {
        metadata: { createdAt: '2026-01-01T00:00:00Z', urn: 'urn:nl:prescan' },
        answers: {},
      }
      importFromJson.mockResolvedValue(prescanState)
      const onStart = vi.fn()
      const wrapper = mountPage(onStart)

      const file = new File(['{}'], 'prescan.json', { type: 'application/json' })
      ;(wrapper.vm as unknown as { uploadedFile: File | null }).uploadedFile = file

      await wrapper.find('nldd-button').trigger('click')
      await flushPromises()

      expect(onStart).toHaveBeenCalledTimes(1)
      expect(onStart.mock.calls[0][0]).toBe(prescanState)
      expect(wrapper.find('nldd-banner').exists()).toBe(false)
    })
  })

  describe('startDpia inner catch (import failure)', () => {
    it('shows the Error message when importFromJson rejects with an Error', async () => {
      importFromJson.mockRejectedValue(new Error('Ongeldig JSON-bestand'))
      const onStart = vi.fn()
      const wrapper = mountPage(onStart)

      const file = new File(['nope'], 'bad.json', { type: 'application/json' })
      ;(wrapper.vm as unknown as { uploadedFile: File | null }).uploadedFile = file

      await wrapper.find('nldd-button').trigger('click')
      await flushPromises()

      expect(onStart).not.toHaveBeenCalled()
      const banner = wrapper.find('nldd-banner[variant="critical"]')
      expect(banner.exists()).toBe(true)
      expect(banner.attributes('text')).toBe('Ongeldig JSON-bestand')
      expect((wrapper.vm as unknown as { isProcessing: boolean }).isProcessing).toBe(false)
    })

    it('shows a generic message when importFromJson rejects with a non-Error', async () => {
      importFromJson.mockRejectedValue('kapot')
      const onStart = vi.fn()
      const wrapper = mountPage(onStart)

      const file = new File(['nope'], 'bad.json', { type: 'application/json' })
      ;(wrapper.vm as unknown as { uploadedFile: File | null }).uploadedFile = file

      await wrapper.find('nldd-button').trigger('click')
      await flushPromises()

      expect(onStart).not.toHaveBeenCalled()
      const banner = wrapper.find('nldd-banner[variant="critical"]')
      expect(banner.exists()).toBe(true)
      expect(banner.attributes('text')).toBe('Fout bij het uploaden van het bestand')
    })
  })

  describe('startDpia outer catch (emit throws)', () => {
    it('shows the Error message when the start handler throws an Error', async () => {
      const onStart = vi.fn(() => {
        throw new Error('handler stuk')
      })
      const wrapper = mountPage(onStart)

      await wrapper.find('nldd-button').trigger('click')
      await flushPromises()

      const banner = wrapper.find('nldd-banner[variant="critical"]')
      expect(banner.exists()).toBe(true)
      expect(banner.attributes('text')).toBe('handler stuk')
      expect((wrapper.vm as unknown as { isProcessing: boolean }).isProcessing).toBe(false)
    })

    it('shows a generic message when the start handler throws a non-Error (no file)', async () => {
      const onStart = vi.fn(() => {
        throw 'oeps'
      })
      const wrapper = mountPage(onStart)

      await wrapper.find('nldd-button').trigger('click')
      await flushPromises()

      const banner = wrapper.find('nldd-banner[variant="critical"]')
      expect(banner.exists()).toBe(true)
      expect(banner.attributes('text')).toBe('Er is een onbekende fout opgetreden')
      expect((wrapper.vm as unknown as { isProcessing: boolean }).isProcessing).toBe(false)
    })
  })

  describe('isProcessing rendering', () => {
    it('switches the button label and icon while processing', async () => {
      const wrapper = mountPage()
      ;(wrapper.vm as unknown as { isProcessing: boolean }).isProcessing = true
      await wrapper.vm.$nextTick()

      const button = wrapper.find('nldd-button')
      expect(button.attributes('text')).toBe('Bezig met laden...')
      expect(button.attributes('start-icon')).toBe('arrow-clockwise')
      expect(button.attributes('disabled')).toBeDefined()
    })
  })
})

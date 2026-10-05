import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { useAnswerStore, type ImageValue } from '../../src/stores/answers'
import { type FlatTask } from '../../src/stores/tasks'
import ImageField from '../../src/components/task/ImageField.vue'

// resizeImageToDataUri touches canvas/Image APIs that jsdom does not implement; mock it.
const resizeMock = vi.fn<(file: File) => Promise<string>>()
vi.mock('../../src/utils/imageResize', () => ({
  resizeImageToDataUri: (file: File) => resizeMock(file),
}))

const autoGrowMock = vi.fn()
vi.mock('../../src/utils/autoGrowTextarea', () => ({
  autoGrowTextarea: (el: HTMLTextAreaElement) => autoGrowMock(el),
}))

const RASTER_DATA_URI = 'data:image/webp;base64,UklGRiQAAABXRUJQ'

const task: FlatTask = {
  id: '2.1.3',
  task: 'Voeg een afbeelding toe',
  type: ['image'],
  parentId: null,
  childrenIds: [],
}

function mountField(props: Partial<{ instanceId: string; label: string; description: string }> = {}) {
  return mount(ImageField, {
    props: {
      task,
      instanceId: props.instanceId ?? 'img-1',
      ...(props.label !== undefined ? { label: props.label } : {}),
      ...(props.description !== undefined ? { description: props.description } : {}),
    },
  })
}

function makeFile(): File {
  return new File(['x'], 'pic.png', { type: 'image/png' })
}

function setImageAnswer(store: ReturnType<typeof useAnswerStore>, instanceId: string, value: ImageValue) {
  store.setAnswer(instanceId, value)
}

describe('ImageField.vue', () => {
  let store: ReturnType<typeof useAnswerStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useAnswerStore()
    resizeMock.mockReset()
    resizeMock.mockResolvedValue(RASTER_DATA_URI)
    autoGrowMock.mockReset()
  })

  describe('empty state (no answer)', () => {
    it('shows the dropzone and hides preview/legacy/error/processing', () => {
      const wrapper = mountField()
      expect(wrapper.find('.image-dropzone').exists()).toBe(true)
      expect(wrapper.find('.image-dropzone button').text()).toBe('Kies een afbeelding')
      expect(wrapper.find('.image-dropzone').text()).toContain('of sleep of plak hem hier (Ctrl+V / ⌘V)')
      expect(wrapper.find('.image-preview').exists()).toBe(false)
      expect(wrapper.find('.rvo-alert--warning').exists()).toBe(false)
      expect(wrapper.find('[role="status"]').exists()).toBe(false)
    })

    it('sets the file input aria-label when no label prop is given', () => {
      const wrapper = mountField()
      const input = wrapper.find('input[type="file"]')
      expect(input.attributes('aria-label')).toBe('Afbeelding uploaden')
      expect(input.attributes('aria-labelledby')).toBeUndefined()
      expect(wrapper.find('.image-dropzone button').attributes('aria-describedby')).toBeUndefined()
    })

    it('sets aria-labelledby on the file input and aria-describedby on the choose button when a label is given', () => {
      const wrapper = mountField({ label: 'Mijn afbeelding' })
      const input = wrapper.find('input[type="file"]')
      expect(input.attributes('aria-labelledby')).toBe(`label-${task.id}-img-1`)
      expect(input.attributes('aria-label')).toBeUndefined()
      expect(wrapper.find('.image-dropzone button').attributes('aria-describedby')).toBe(`label-${task.id}-img-1`)
    })
  })

  describe('legacy string value', () => {
    it('renders a plain-text legacy reference (non-URL) inside a span', () => {
      store.setAnswer('img-1', 'Projectplan v3 in SharePoint')
      const wrapper = mountField()
      const alert = wrapper.find('.rvo-alert--warning')
      expect(alert.exists()).toBe(true)
      expect(alert.text()).toContain('Bestaande referentie:')
      expect(alert.text()).toContain('Projectplan v3 in SharePoint')
      expect(alert.find('a').exists()).toBe(false)
      expect(alert.find('span').text()).toBe('Projectplan v3 in SharePoint')
    })

    it('renders a legacy URL reference as a link', () => {
      store.setAnswer('img-1', 'https://example.com/diagram.png')
      const wrapper = mountField()
      const link = wrapper.find('.rvo-alert--warning a')
      expect(link.exists()).toBe(true)
      expect(link.attributes('href')).toBe('https://example.com/diagram.png')
      expect(link.attributes('target')).toBe('_blank')
    })

    it('treats an invalid URL string as a non-URL (catch branch in legacyIsUrl)', () => {
      store.setAnswer('img-1', 'not a url::::')
      const wrapper = mountField()
      const alert = wrapper.find('.rvo-alert--warning')
      expect(alert.exists()).toBe(true)
      expect(alert.find('a').exists()).toBe(false)
    })

    it('treats a non-http protocol URL as a non-URL', () => {
      store.setAnswer('img-1', 'ftp://example.com/file')
      const wrapper = mountField()
      const alert = wrapper.find('.rvo-alert--warning')
      expect(alert.exists()).toBe(true)
      expect(alert.find('a').exists()).toBe(false)
    })

    it('does not treat a data:image/ string as a legacy value', () => {
      store.setAnswer('img-1', 'data:image/png;base64,AAAA')
      const wrapper = mountField()
      expect(wrapper.find('.rvo-alert--warning').exists()).toBe(false)
    })
  })

  describe('image preview and metadata', () => {
    it('renders the preview image with the title as alt text when a title is set', () => {
      setImageAnswer(store, 'img-1', { data: RASTER_DATA_URI, title: 'Diagram' })
      const wrapper = mountField()
      const img = wrapper.find('img.image-preview')
      expect(img.exists()).toBe(true)
      expect(img.attributes('src')).toBe(RASTER_DATA_URI)
      expect(img.attributes('alt')).toBe('Diagram')
    })

    it('falls back to the task text as alt when no title is set', () => {
      setImageAnswer(store, 'img-1', { data: RASTER_DATA_URI })
      const wrapper = mountField()
      const img = wrapper.find('img.image-preview')
      expect(img.attributes('alt')).toBe(task.task)
      const titleInput = wrapper.find(`#image-title-img-1`).element as HTMLInputElement
      expect(titleInput.value).toBe('')
      const descTa = wrapper.find(`#image-description-img-1`).element as HTMLTextAreaElement
      expect(descTa.value).toBe('')
      const sourceInput = wrapper.find(`#image-source-img-1`).element as HTMLInputElement
      expect(sourceInput.value).toBe('')
    })

    it('prefills metadata fields from the stored image value', () => {
      setImageAnswer(store, 'img-1', {
        data: RASTER_DATA_URI,
        title: 'T',
        description: 'D',
        source: 'S',
      })
      const wrapper = mountField()
      expect((wrapper.find(`#image-title-img-1`).element as HTMLInputElement).value).toBe('T')
      expect((wrapper.find(`#image-description-img-1`).element as HTMLTextAreaElement).value).toBe('D')
      expect((wrapper.find(`#image-source-img-1`).element as HTMLInputElement).value).toBe('S')
    })
  })

  describe('updateMetadata via @change handlers', () => {
    it('sets a trimmed title and persists it', async () => {
      setImageAnswer(store, 'img-1', { data: RASTER_DATA_URI })
      const wrapper = mountField()
      const input = wrapper.find(`#image-title-img-1`)
      ;(input.element as HTMLInputElement).value = '  Nieuwe titel  '
      await input.trigger('change')
      expect(store.getAnswer('img-1')).toEqual({ data: RASTER_DATA_URI, title: 'Nieuwe titel' })
    })

    it('removes the field when the trimmed value is empty', async () => {
      setImageAnswer(store, 'img-1', { data: RASTER_DATA_URI, source: 'oude bron' })
      const wrapper = mountField()
      const input = wrapper.find(`#image-source-img-1`)
      ;(input.element as HTMLInputElement).value = '   '
      await input.trigger('change')
      expect(store.getAnswer('img-1')).toEqual({ data: RASTER_DATA_URI })
    })

    it('updates the description and triggers autoGrow on @input', async () => {
      setImageAnswer(store, 'img-1', { data: RASTER_DATA_URI })
      const wrapper = mountField()
      const ta = wrapper.find(`#image-description-img-1`)
      ;(ta.element as HTMLTextAreaElement).value = 'Beschrijving'
      await ta.trigger('input')
      expect(autoGrowMock).toHaveBeenCalled()
      await ta.trigger('change')
      expect(store.getAnswer('img-1')).toEqual({ data: RASTER_DATA_URI, description: 'Beschrijving' })
    })
  })

  describe('processFile success and error paths', () => {
    it('processes a selected file and stores the resulting data URI', async () => {
      const wrapper = mountField()
      const fileInput = wrapper.find('input[type="file"]')
      const el = fileInput.element as HTMLInputElement
      Object.defineProperty(el, 'files', { value: [makeFile()], configurable: true })
      await fileInput.trigger('change')
      await flushPromises()
      await nextTick()
      expect(resizeMock).toHaveBeenCalledTimes(1)
      expect(store.getAnswer('img-1')).toEqual({ data: RASTER_DATA_URI })
      expect(el.value).toBe('')
      expect(wrapper.find('img.image-preview').exists()).toBe(true)
    })

    it('shows the processing indicator while the resize promise is pending', async () => {
      let resolve!: (uri: string) => void
      resizeMock.mockReturnValue(new Promise<string>((r) => { resolve = r }))
      const wrapper = mountField()
      const fileInput = wrapper.find('input[type="file"]')
      const el = fileInput.element as HTMLInputElement
      Object.defineProperty(el, 'files', { value: [makeFile()], configurable: true })
      await fileInput.trigger('change')
      await nextTick()
      expect(wrapper.find('[role="status"]').text()).toBe('Bezig met verwerken...')
      expect(wrapper.find('.image-dropzone').exists()).toBe(false)
      resolve(RASTER_DATA_URI)
      await flushPromises()
      await nextTick()
      expect(wrapper.find('[role="status"]').exists()).toBe(false)
    })

    it('shows the Error message when resize throws an Error', async () => {
      resizeMock.mockRejectedValue(new Error('Bestand te groot'))
      const wrapper = mountField()
      const fileInput = wrapper.find('input[type="file"]')
      const el = fileInput.element as HTMLInputElement
      Object.defineProperty(el, 'files', { value: [makeFile()], configurable: true })
      await fileInput.trigger('change')
      await flushPromises()
      await nextTick()
      const alert = wrapper.find('[role="alert"]')
      expect(alert.exists()).toBe(true)
      expect(alert.text()).toContain('Bestand te groot')
    })

    it('shows a generic message when resize rejects with a non-Error', async () => {
      resizeMock.mockRejectedValue('boom')
      const wrapper = mountField()
      const fileInput = wrapper.find('input[type="file"]')
      const el = fileInput.element as HTMLInputElement
      Object.defineProperty(el, 'files', { value: [makeFile()], configurable: true })
      await fileInput.trigger('change')
      await flushPromises()
      await nextTick()
      expect(wrapper.find('[role="alert"]').text()).toContain('Er is een fout opgetreden.')
    })

    it('does nothing when no file is selected (handleFileSelect early return)', async () => {
      const wrapper = mountField()
      const fileInput = wrapper.find('input[type="file"]')
      const el = fileInput.element as HTMLInputElement
      Object.defineProperty(el, 'files', { value: [], configurable: true })
      await fileInput.trigger('change')
      await flushPromises()
      expect(resizeMock).not.toHaveBeenCalled()
    })
  })

  describe('processFile source carry-over', () => {
    it('keeps the existing image source when replacing the image', async () => {
      setImageAnswer(store, 'img-1', { data: RASTER_DATA_URI, source: 'bestaande bron' })
      const wrapper = mountField()
      const replaceBtn = wrapper.findAll('button').find((b) => b.text().includes('Vervang afbeelding'))
      expect(replaceBtn).toBeDefined()
      await replaceBtn!.trigger('click')
      const fileInput = wrapper.find('input[type="file"]')
      const el = fileInput.element as HTMLInputElement
      Object.defineProperty(el, 'files', { value: [makeFile()], configurable: true })
      await fileInput.trigger('change')
      await flushPromises()
      await nextTick()
      expect(store.getAnswer('img-1')).toEqual({ data: RASTER_DATA_URI, source: 'bestaande bron' })
    })

    it('adopts a legacy URL as the source when uploading the first image', async () => {
      store.setAnswer('img-1', 'https://example.com/old.png')
      const wrapper = mountField()
      const fileInput = wrapper.find('input[type="file"]')
      const el = fileInput.element as HTMLInputElement
      Object.defineProperty(el, 'files', { value: [makeFile()], configurable: true })
      await fileInput.trigger('change')
      await flushPromises()
      await nextTick()
      expect(store.getAnswer('img-1')).toEqual({
        data: RASTER_DATA_URI,
        source: 'https://example.com/old.png',
      })
    })
  })

  describe('saveImageValue merge branches', () => {
    it('merges all metadata fields from the existing value when only data changes', async () => {
      setImageAnswer(store, 'img-1', {
        data: 'data:image/png;base64,OLD',
        title: 'Titel',
        description: 'Omschrijving',
        source: 'Bron',
      })
      const wrapper = mountField()
      const replaceBtn = wrapper.findAll('button').find((b) => b.text().includes('Vervang afbeelding'))!
      await replaceBtn.trigger('click')
      const fileInput = wrapper.find('input[type="file"]')
      const el = fileInput.element as HTMLInputElement
      Object.defineProperty(el, 'files', { value: [makeFile()], configurable: true })
      await fileInput.trigger('change')
      await flushPromises()
      await nextTick()
      expect(store.getAnswer('img-1')).toEqual({
        data: RASTER_DATA_URI,
        title: 'Titel',
        description: 'Omschrijving',
        source: 'Bron',
      })
    })

    it('evaluates current?.source when replacing an image that has no source', async () => {
      setImageAnswer(store, 'img-1', { data: 'data:image/png;base64,OLD', title: 'Alleen titel' })
      const wrapper = mountField()
      const replaceBtn = wrapper.findAll('button').find((b) => b.text().includes('Vervang afbeelding'))!
      await replaceBtn.trigger('click')
      const fileInput = wrapper.find('input[type="file"]')
      const el = fileInput.element as HTMLInputElement
      Object.defineProperty(el, 'files', { value: [makeFile()], configurable: true })
      await fileInput.trigger('change')
      await flushPromises()
      await nextTick()
      expect(store.getAnswer('img-1')).toEqual({ data: RASTER_DATA_URI, title: 'Alleen titel' })
    })

    it('falls back to current.data when the resize dependency yields a nullish data URI', async () => {
      setImageAnswer(store, 'img-1', { data: 'data:image/png;base64,OLD', title: 'Behoud' })
      const wrapper = mountField()
      resizeMock.mockResolvedValue(undefined as unknown as string)
      const replaceBtn = wrapper.findAll('button').find((b) => b.text().includes('Vervang afbeelding'))!
      await replaceBtn.trigger('click')
      const fileInput = wrapper.find('input[type="file"]')
      const el = fileInput.element as HTMLInputElement
      Object.defineProperty(el, 'files', { value: [makeFile()], configurable: true })
      await fileInput.trigger('change')
      await flushPromises()
      await nextTick()
      expect(store.getAnswer('img-1')).toEqual({ data: 'data:image/png;base64,OLD', title: 'Behoud' })
    })

    it('falls back to an empty data string when no current image exists and resize yields nullish', async () => {
      const wrapper = mountField()
      resizeMock.mockResolvedValue(undefined as unknown as string)
      const fileInput = wrapper.find('input[type="file"]')
      const el = fileInput.element as HTMLInputElement
      Object.defineProperty(el, 'files', { value: [makeFile()], configurable: true })
      await fileInput.trigger('change')
      await flushPromises()
      await nextTick()
      expect(store.getAnswer('img-1')).toEqual({ data: '' })
    })
  })

  describe('imageData becoming null at handler/watcher time', () => {
    it('returns early from updateMetadata when the image was removed (no current)', async () => {
      setImageAnswer(store, 'img-1', { data: RASTER_DATA_URI, title: 'Titel' })
      const wrapper = mountField()
      const input = wrapper.find(`#image-title-img-1`)
      // Remove the answer (imageData -> null) without awaiting re-render: the DOM
      // input still exists and its @change fires updateMetadata while imageData is null.
      store.removeAnswer('img-1')
      ;(input.element as HTMLInputElement).value = 'genegeerd'
      await input.trigger('change')
      expect(store.getAnswer('img-1')).toBeNull()
    })

    it('skips autoGrow when the description changes but no textarea is rendered', async () => {
      setImageAnswer(store, 'img-1', { data: RASTER_DATA_URI, description: 'Begin' })
      const wrapper = mountField()
      autoGrowMock.mockClear()
      store.setAnswer('img-1', null)
      await nextTick()
      await nextTick()
      await flushPromises()
      expect(autoGrowMock).not.toHaveBeenCalled()
      wrapper.unmount()
    })
  })

  describe('drag and drop', () => {
    it('toggles the active class on dragover/dragleave on the dropzone', async () => {
      const wrapper = mountField()
      const dropzone = wrapper.find('.image-dropzone')
      await dropzone.trigger('dragover')
      expect(wrapper.find('.image-dropzone--active').exists()).toBe(true)
      await dropzone.trigger('dragleave')
      expect(wrapper.find('.image-dropzone--active').exists()).toBe(false)
    })

    it('processes a dropped file on the empty dropzone', async () => {
      const wrapper = mountField()
      const dropzone = wrapper.find('.image-dropzone')
      await dropzone.trigger('drop', { dataTransfer: { files: [makeFile()] } })
      await flushPromises()
      await nextTick()
      expect(resizeMock).toHaveBeenCalledTimes(1)
      expect(store.getAnswer('img-1')).toEqual({ data: RASTER_DATA_URI })
    })

    it('ignores a drop with no file (handleDrop false branch)', async () => {
      const wrapper = mountField()
      const dropzone = wrapper.find('.image-dropzone')
      await dropzone.trigger('drop', { dataTransfer: { files: [] } })
      await flushPromises()
      expect(resizeMock).not.toHaveBeenCalled()
      expect(wrapper.find('.image-dropzone--active').exists()).toBe(false)
    })

    it('shows the replace overlay when dragging over an existing preview', async () => {
      setImageAnswer(store, 'img-1', { data: RASTER_DATA_URI })
      const wrapper = mountField()
      const dragDiv = wrapper
        .findAll('div')
        .find((d) => d.element.firstElementChild?.classList.contains('image-replace-target'))!
      await dragDiv.trigger('dragover')
      expect(wrapper.find('.image-replace-overlay').exists()).toBe(true)
      expect(wrapper.find('.image-replace-overlay').text()).toContain(
        'Sleep een afbeelding hierheen om de huidige afbeelding te vervangen',
      )
      await dragDiv.trigger('dragleave')
      expect(wrapper.find('.image-replace-overlay').exists()).toBe(false)
    })

    it('replaces the image by dropping onto an existing preview', async () => {
      setImageAnswer(store, 'img-1', { data: 'data:image/png;base64,OLD' })
      const wrapper = mountField()
      const dragDiv = wrapper
        .findAll('div')
        .find((d) => d.element.firstElementChild?.classList.contains('image-replace-target'))!
      await dragDiv.trigger('drop', { dataTransfer: { files: [makeFile()] } })
      await flushPromises()
      await nextTick()
      expect(store.getAnswer('img-1')).toEqual({ data: RASTER_DATA_URI })
    })
  })

  describe('triggerFileSelect via the dropzone', () => {
    it('clicks the hidden file input when the choose button is clicked', async () => {
      const wrapper = mountField()
      const fileInput = wrapper.find('input[type="file"]').element as HTMLInputElement
      const clickSpy = vi.spyOn(fileInput, 'click').mockImplementation(() => {})
      await wrapper.find('.image-dropzone button').trigger('click')
      expect(clickSpy).toHaveBeenCalledTimes(1)
    })

    it('is not a button itself, but can take focus on click so a paste lands there', () => {
      const dropzone = mountField().find('.image-dropzone')
      expect(dropzone.attributes('role')).toBeUndefined()
      expect(dropzone.attributes('tabindex')).toBe('-1')
    })
  })

  describe('description watcher / autoGrow', () => {
    it('calls autoGrowTextarea when the stored description changes and a textarea exists', async () => {
      setImageAnswer(store, 'img-1', { data: RASTER_DATA_URI })
      const wrapper = mountField()
      autoGrowMock.mockClear()
      store.setAnswer('img-1', { data: RASTER_DATA_URI, description: 'Nieuw' })
      await nextTick()
      await nextTick()
      await flushPromises()
      expect(autoGrowMock).toHaveBeenCalled()
      wrapper.unmount()
    })
  })

  describe('paste from clipboard', () => {
    function clipboard(files: File[]) {
      return { clipboardData: { files } }
    }

    it('processes a pasted image on the dropzone', async () => {
      const wrapper = mountField()
      const file = makeFile()
      await wrapper.find('.image-dropzone').trigger('paste', clipboard([file]))
      await flushPromises()
      expect(resizeMock).toHaveBeenCalledWith(file)
      expect(store.getAnswer('img-1')).toEqual({ data: RASTER_DATA_URI })
    })

    it('mentions pasting in the dropzone text', () => {
      const wrapper = mountField()
      expect(wrapper.find('.image-dropzone').text()).toContain('plak hem hier (Ctrl+V / ⌘V)')
    })

    it('picks the first image when the clipboard also holds other files', async () => {
      const wrapper = mountField()
      const text = new File(['x'], 'notes.txt', { type: 'text/plain' })
      const image = makeFile()
      await wrapper.find('.image-dropzone').trigger('paste', clipboard([text, image]))
      await flushPromises()
      expect(resizeMock).toHaveBeenCalledWith(image)
    })

    it('shows an error when the clipboard holds no image', async () => {
      const wrapper = mountField()
      await wrapper.find('.image-dropzone').trigger('paste', clipboard([]))
      await flushPromises()
      expect(resizeMock).not.toHaveBeenCalled()
      expect(wrapper.find('[role="alert"]').text()).toContain('Het klembord bevat geen afbeelding.')
    })

    it('shows an error when the paste event has no clipboard data', async () => {
      const wrapper = mountField()
      await wrapper.find('.image-dropzone').trigger('paste')
      await flushPromises()
      expect(resizeMock).not.toHaveBeenCalled()
      expect(wrapper.find('[role="alert"]').text()).toContain('Het klembord bevat geen afbeelding.')
    })

    it('replaces an existing image when pasting on the focusable preview', async () => {
      setImageAnswer(store, 'img-1', { data: 'data:image/webp;base64,OUD', title: 'Procesplaat' })
      const wrapper = mountField()
      const target = wrapper.find('.image-replace-target')
      expect(target.attributes('tabindex')).toBe('0')
      const file = makeFile()
      await target.trigger('paste', clipboard([file]))
      await flushPromises()
      expect(resizeMock).toHaveBeenCalledWith(file)
      expect(store.getAnswer('img-1')).toEqual({ data: RASTER_DATA_URI, title: 'Procesplaat' })
    })

    it('leaves pasting into the metadata fields alone', async () => {
      setImageAnswer(store, 'img-1', { data: RASTER_DATA_URI })
      const wrapper = mountField()
      await wrapper.find('#image-title-img-1').trigger('paste', clipboard([makeFile()]))
      await flushPromises()
      expect(resizeMock).not.toHaveBeenCalled()
    })
  })
})

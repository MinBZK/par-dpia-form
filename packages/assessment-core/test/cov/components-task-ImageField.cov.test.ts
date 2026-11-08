import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick, ref } from 'vue'
import { useAnswerStore, type ImageValue } from '../../src/stores/answers'
import { type FlatTask } from '../../src/stores/tasks'
import ImageField from '../../src/components/task/ImageField.vue'
import { CONTENT_READONLY_KEY } from '../../src/injectionKeys'

// resizeImageToDataUri touches canvas/Image APIs that jsdom does not implement; mock it.
const resizeMock = vi.fn<(file: File) => Promise<string>>()
vi.mock('../../src/utils/imageResize', () => ({
  resizeImageToDataUri: (file: File) => resizeMock(file),
}))

const RASTER_DATA_URI = 'data:image/webp;base64,UklGRiQAAABXRUJQ'

const task: FlatTask = {
  id: '2.1.3',
  task: 'Voeg een afbeelding toe',
  type: ['image'],
  parentId: null,
  childrenIds: [],
}

function mountField(
  props: Partial<{ instanceId: string; label: string; description: string; accessibleLabel: string }> = {},
  readonly = false,
) {
  return mount(ImageField, {
    global: { provide: { [CONTENT_READONLY_KEY as symbol]: ref(readonly) } },
    props: {
      task,
      instanceId: props.instanceId ?? 'img-1',
      ...(props.label !== undefined ? { label: props.label } : {}),
      ...(props.description !== undefined ? { description: props.description } : {}),
      ...(props.accessibleLabel !== undefined ? { accessibleLabel: props.accessibleLabel } : {}),
    },
  })
}

function makeFile(): File {
  return new File(['x'], 'pic.png', { type: 'image/png' })
}

function setImageAnswer(store: ReturnType<typeof useAnswerStore>, instanceId: string, value: ImageValue) {
  store.setAnswer(instanceId, value)
}

// NLDD fields commit their value via a change CustomEvent carrying event.detail.value.
function dispatchNlddChange(el: Element, value: string) {
  el.dispatchEvent(new CustomEvent('change', { detail: { value } }))
}

// nldd-file-field reports its selection as detail: { files, paths }.
function dispatchFileChange(el: Element, files: File[]) {
  el.dispatchEvent(new CustomEvent('change', { detail: { files, paths: files.map((f) => f.name) } }))
}

const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/svg+xml'

describe('ImageField.vue', () => {
  let store: ReturnType<typeof useAnswerStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useAnswerStore()
    resizeMock.mockReset()
    resizeMock.mockResolvedValue(RASTER_DATA_URI)
  })

  describe('empty state (no answer)', () => {
    it('shows the area upload field and hides preview/legacy/error/processing', () => {
      const wrapper = mountField()
      const field = wrapper.find('nldd-file-field')
      expect(field.exists()).toBe(true)
      expect(field.attributes('variant')).toBe('area')
      expect(field.attributes('accept')).toBe(ACCEPT)
      expect(wrapper.find('.image-preview').exists()).toBe(false)
      expect(wrapper.find('nldd-banner').exists()).toBe(false)
      expect(wrapper.find('[role="status"]').exists()).toBe(false)
    })

    it('falls back to a generic accessible label when none is given', () => {
      expect(mountField().find('nldd-file-field').attributes('accessible-label')).toBe('Afbeelding uploaden')
    })

    it('uses the accessible label computed by FormField when it is given', () => {
      const wrapper = mountField({ accessibleLabel: 'Mijn afbeelding' })
      expect(wrapper.find('nldd-file-field').attributes('accessible-label')).toBe('Mijn afbeelding')
    })
  })

  describe('legacy string value', () => {
    it('renders a plain-text legacy reference (non-URL) inside a span', () => {
      store.setAnswer('img-1', 'Projectplan v3 in SharePoint')
      const wrapper = mountField()
      const banner = wrapper.find('nldd-banner[variant="warning"]')
      expect(banner.exists()).toBe(true)
      expect(banner.text()).toContain('Bestaande referentie:')
      expect(banner.text()).toContain('Projectplan v3 in SharePoint')
      expect(banner.text()).toContain('Upload een afbeelding om deze referentie te vervangen.')
      expect(banner.find('a').exists()).toBe(false)
      expect(banner.find('span').text()).toBe('Projectplan v3 in SharePoint')
    })

    it('renders a legacy URL reference as a link', () => {
      store.setAnswer('img-1', 'https://example.com/diagram.png')
      const wrapper = mountField()
      const link = wrapper.find('nldd-banner[variant="warning"] a')
      expect(link.exists()).toBe(true)
      expect(link.attributes('href')).toBe('https://example.com/diagram.png')
      expect(link.attributes('target')).toBe('_blank')
    })

    it('treats an invalid URL string as a non-URL (catch branch in legacyIsUrl)', () => {
      store.setAnswer('img-1', 'not a url::::')
      const wrapper = mountField()
      const banner = wrapper.find('nldd-banner[variant="warning"]')
      expect(banner.exists()).toBe(true)
      expect(banner.find('a').exists()).toBe(false)
    })

    it('treats a non-http protocol URL as a non-URL', () => {
      store.setAnswer('img-1', 'ftp://example.com/file')
      const wrapper = mountField()
      const banner = wrapper.find('nldd-banner[variant="warning"]')
      expect(banner.exists()).toBe(true)
      expect(banner.find('a').exists()).toBe(false)
    })

    it('does not treat a data:image/ string as a legacy value', () => {
      store.setAnswer('img-1', 'data:image/png;base64,AAAA')
      const wrapper = mountField()
      expect(wrapper.find('nldd-banner[variant="warning"]').exists()).toBe(false)
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

    it('offers a control-variant file field below the preview', () => {
      setImageAnswer(store, 'img-1', { data: RASTER_DATA_URI })
      const field = mountField().find('nldd-file-field')
      expect(field.attributes('variant')).toBeUndefined()
      expect(field.attributes('accept')).toBe(ACCEPT)
    })

    it('falls back to the task text as alt when no title is set', () => {
      setImageAnswer(store, 'img-1', { data: RASTER_DATA_URI })
      const wrapper = mountField()
      const img = wrapper.find('img.image-preview')
      expect(img.attributes('alt')).toBe(task.task)
      expect(wrapper.find('nldd-text-field[input-id="image-title-img-1"]').attributes('value')).toBe('')
      expect(wrapper.find('nldd-multi-line-text-field[input-id="image-description-img-1"]').attributes('value')).toBe('')
      expect(wrapper.find('nldd-text-field[input-id="image-source-img-1"]').attributes('value')).toBe('')
    })

    it('prefills metadata fields from the stored image value', () => {
      setImageAnswer(store, 'img-1', {
        data: RASTER_DATA_URI,
        title: 'T',
        description: 'D',
        source: 'S',
      })
      const wrapper = mountField()
      const labels = wrapper.findAll('nldd-form-field').map((f) => f.attributes('label'))
      expect(labels).toEqual(['Titel', 'Omschrijving', 'Bron'])
      expect(wrapper.find('nldd-text-field[input-id="image-title-img-1"]').attributes('value')).toBe('T')
      expect(wrapper.find('nldd-multi-line-text-field[input-id="image-description-img-1"]').attributes('value')).toBe('D')
      expect(wrapper.find('nldd-text-field[input-id="image-source-img-1"]').attributes('value')).toBe('S')
    })
  })

  describe('updateMetadata via @change handlers', () => {
    it('sets a trimmed title and persists it', async () => {
      setImageAnswer(store, 'img-1', { data: RASTER_DATA_URI })
      const wrapper = mountField()
      const field = wrapper.find('nldd-text-field[input-id="image-title-img-1"]')
      dispatchNlddChange(field.element, '  Nieuwe titel  ')
      await nextTick()
      expect(store.getAnswer('img-1')).toEqual({ data: RASTER_DATA_URI, title: 'Nieuwe titel' })
    })

    it('removes the field when the trimmed value is empty', async () => {
      setImageAnswer(store, 'img-1', { data: RASTER_DATA_URI, source: 'oude bron' })
      const wrapper = mountField()
      const field = wrapper.find('nldd-text-field[input-id="image-source-img-1"]')
      dispatchNlddChange(field.element, '   ')
      await nextTick()
      expect(store.getAnswer('img-1')).toEqual({ data: RASTER_DATA_URI })
    })

    it('updates the description from the change event detail', async () => {
      setImageAnswer(store, 'img-1', { data: RASTER_DATA_URI })
      const wrapper = mountField()
      const field = wrapper.find('nldd-multi-line-text-field[input-id="image-description-img-1"]')
      dispatchNlddChange(field.element, 'Beschrijving')
      await nextTick()
      expect(store.getAnswer('img-1')).toEqual({ data: RASTER_DATA_URI, description: 'Beschrijving' })
    })

    it('falls back to target.value when the change event carries no detail', async () => {
      setImageAnswer(store, 'img-1', { data: RASTER_DATA_URI })
      const wrapper = mountField()
      const field = wrapper.find('nldd-text-field[input-id="image-title-img-1"]')
      ;(field.element as HTMLInputElement).value = 'Native titel'
      field.element.dispatchEvent(new Event('change'))
      await nextTick()
      expect(store.getAnswer('img-1')).toEqual({ data: RASTER_DATA_URI, title: 'Native titel' })
    })
  })

  describe('processFile success and error paths', () => {
    it('processes a chosen file and stores the resulting data URI', async () => {
      const wrapper = mountField()
      dispatchFileChange(wrapper.find('nldd-file-field').element, [makeFile()])
      await flushPromises()
      await nextTick()
      expect(resizeMock).toHaveBeenCalledTimes(1)
      expect(store.getAnswer('img-1')).toEqual({ data: RASTER_DATA_URI })
      expect(wrapper.find('img.image-preview').exists()).toBe(true)
    })

    it('shows the processing indicator while the resize promise is pending', async () => {
      let resolve!: (uri: string) => void
      resizeMock.mockReturnValue(new Promise<string>((r) => { resolve = r }))
      const wrapper = mountField()
      dispatchFileChange(wrapper.find('nldd-file-field').element, [makeFile()])
      await nextTick()
      expect(wrapper.find('[role="status"]').text()).toBe('Bezig met verwerken...')
      expect(wrapper.find('nldd-file-field').exists()).toBe(false)
      resolve(RASTER_DATA_URI)
      await flushPromises()
      await nextTick()
      expect(wrapper.find('[role="status"]').exists()).toBe(false)
    })

    it('shows the Error message when resize throws an Error', async () => {
      resizeMock.mockRejectedValue(new Error('Bestand te groot'))
      const wrapper = mountField()
      dispatchFileChange(wrapper.find('nldd-file-field').element, [makeFile()])
      await flushPromises()
      await nextTick()
      const banner = wrapper.find('nldd-banner[variant="critical"]')
      expect(banner.exists()).toBe(true)
      expect(banner.attributes('text')).toBe('Bestand te groot')
    })

    it('shows a generic message when resize rejects with a non-Error', async () => {
      resizeMock.mockRejectedValue('boom')
      const wrapper = mountField()
      dispatchFileChange(wrapper.find('nldd-file-field').element, [makeFile()])
      await flushPromises()
      await nextTick()
      expect(wrapper.find('nldd-banner[variant="critical"]').attributes('text')).toBe('Er is een fout opgetreden.')
    })
  })

  describe('a change without a file', () => {
    it('does nothing when the event carries no detail at all', async () => {
      const wrapper = mountField()
      wrapper.find('nldd-file-field').element.dispatchEvent(new Event('change'))
      await flushPromises()
      expect(resizeMock).not.toHaveBeenCalled()
      expect(store.getAnswer('img-1')).toBeNull()
    })

    it('does nothing when the detail carries no files key', async () => {
      const wrapper = mountField()
      wrapper.find('nldd-file-field').element.dispatchEvent(new CustomEvent('change', { detail: {} }))
      await flushPromises()
      expect(resizeMock).not.toHaveBeenCalled()
      expect(store.getAnswer('img-1')).toBeNull()
    })

    it('does nothing when the file list is empty and no image is stored', async () => {
      const wrapper = mountField()
      dispatchFileChange(wrapper.find('nldd-file-field').element, [])
      await flushPromises()
      expect(resizeMock).not.toHaveBeenCalled()
      expect(store.getAnswer('img-1')).toBeNull()
    })

    it('removes the stored image when the field is cleared', async () => {
      setImageAnswer(store, 'img-1', { data: RASTER_DATA_URI, title: 'Diagram' })
      const wrapper = mountField()
      dispatchFileChange(wrapper.find('nldd-file-field').element, [])
      await flushPromises()
      await nextTick()
      expect(store.getAnswer('img-1')).toBeNull()
      expect(wrapper.find('img.image-preview').exists()).toBe(false)
      expect(wrapper.find('nldd-file-field').attributes('variant')).toBe('area')
    })
  })

  describe('processFile source carry-over', () => {
    it('keeps the existing image source when replacing the image', async () => {
      setImageAnswer(store, 'img-1', { data: RASTER_DATA_URI, source: 'bestaande bron' })
      const wrapper = mountField()
      dispatchFileChange(wrapper.find('nldd-file-field').element, [makeFile()])
      await flushPromises()
      await nextTick()
      expect(store.getAnswer('img-1')).toEqual({ data: RASTER_DATA_URI, source: 'bestaande bron' })
    })

    it('adopts a legacy URL as the source when uploading the first image', async () => {
      store.setAnswer('img-1', 'https://example.com/old.png')
      const wrapper = mountField()
      dispatchFileChange(wrapper.find('nldd-file-field').element, [makeFile()])
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
      dispatchFileChange(wrapper.find('nldd-file-field').element, [makeFile()])
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
      dispatchFileChange(wrapper.find('nldd-file-field').element, [makeFile()])
      await flushPromises()
      await nextTick()
      expect(store.getAnswer('img-1')).toEqual({ data: RASTER_DATA_URI, title: 'Alleen titel' })
    })

    it('falls back to current.data when the resize dependency yields a nullish data URI', async () => {
      setImageAnswer(store, 'img-1', { data: 'data:image/png;base64,OLD', title: 'Behoud' })
      const wrapper = mountField()
      resizeMock.mockResolvedValue(undefined as unknown as string)
      dispatchFileChange(wrapper.find('nldd-file-field').element, [makeFile()])
      await flushPromises()
      await nextTick()
      expect(store.getAnswer('img-1')).toEqual({ data: 'data:image/png;base64,OLD', title: 'Behoud' })
    })

    it('falls back to an empty data string when no current image exists and resize yields nullish', async () => {
      const wrapper = mountField()
      resizeMock.mockResolvedValue(undefined as unknown as string)
      dispatchFileChange(wrapper.find('nldd-file-field').element, [makeFile()])
      await flushPromises()
      await nextTick()
      expect(store.getAnswer('img-1')).toEqual({ data: '' })
    })
  })

  describe('imageData becoming null at handler time', () => {
    it('returns early from updateMetadata when the image was removed (no current)', async () => {
      setImageAnswer(store, 'img-1', { data: RASTER_DATA_URI, title: 'Titel' })
      const wrapper = mountField()
      const field = wrapper.find('nldd-text-field[input-id="image-title-img-1"]')
      // Remove the answer (imageData -> null) without awaiting re-render: the DOM
      // field still exists and its @change fires updateMetadata while imageData is null.
      store.removeAnswer('img-1')
      dispatchNlddChange(field.element, 'genegeerd')
      await nextTick()
      expect(store.getAnswer('img-1')).toBeNull()
    })
  })

  describe('read-only role', () => {
    it('makes the upload controls inert', () => {
      expect(mountField({}, true).find('.field-group').attributes('inert')).toBeDefined()
    })

    it('leaves them interactive for an editor', () => {
      expect(mountField().find('.field-group').attributes('inert')).toBeUndefined()
    })
  })
})

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Task } from '../../src/models/dpia'
import { FormType } from '../../src/models/dpia'

const createPdfMock = vi.fn()
const downloadMock = vi.fn()

vi.mock('pdfmake/build/pdfmake', () => {
  return {
    default: {
      addVirtualFileSystem: vi.fn(),
      addFonts: vi.fn(),
      createPdf: (docDefinition: unknown) => {
        createPdfMock(docDefinition)
        return { download: downloadMock }
      },
    },
  }
})

vi.mock('pdfmake/build/vfs_fonts', () => ({ default: {} }))

// FontService uses import.meta.glob + fetch — mock out or it hangs the import.
vi.mock('../../src/services/fontService', () => ({
  default: {
    getFonts: vi.fn(async () => ({ customFamily: { normal: 'custom.ttf' } })),
    getVFS: vi.fn(async () => ({ 'custom.ttf': 'base64data' })),
  },
}))

// convertWebpToPng touches canvas; stub it deterministically.
vi.mock('../../src/utils/imageResize', () => ({
  convertWebpToPng: vi.fn(async (data: string) => `${data}#converted-png`),
}))

// exportToPdf now embeds buildOutputData (AssessmentData PDF Info key) for every
// namespace; buildOutputData calls schemaStore.getUrn which needs fully loaded
// schemas. Stub getUrn so the export does not require real schema JSON.
vi.mock('../../src/stores/schemas', () => ({
  useSchemaStore: vi.fn(() => ({
    getUrn: (ns: string) =>
      ns === 'dpia'
        ? 'urn:nl:dpia:3.0'
        : ns === 'iama'
          ? 'urn:nl:iama:1.0'
          : 'urn:nl:prescan:2.0',
  })),
}))

import { exportToPdf } from '../../src/utils/pdfExport'
import { useTaskStore } from '../../src/stores/tasks'
import { useAnswerStore } from '../../src/stores/answers'
import { useCalculationStore } from '../../src/stores/calculations'
import type { AnswerValue, ImageValue } from '../../src/stores/answers'

function lastDocDefinition(): any {
  expect(createPdfMock).toHaveBeenCalled()
  return createPdfMock.mock.calls[createPdfMock.mock.calls.length - 1][0]
}

function collectTexts(node: any, acc: string[] = []): string[] {
  if (node == null) return acc
  if (typeof node === 'string') {
    acc.push(node)
    return acc
  }
  if (Array.isArray(node)) {
    for (const item of node) collectTexts(item, acc)
    return acc
  }
  if (typeof node === 'object') {
    if (typeof node.text === 'string') acc.push(node.text)
    else if (node.text !== undefined) collectTexts(node.text, acc)
    if (node.stack) collectTexts(node.stack, acc)
    if (node.content) collectTexts(node.content, acc)
    if (node.ul) collectTexts(node.ul, acc)
    if (node.ol) collectTexts(node.ol, acc)
    if (node.table?.body) collectTexts(node.table.body, acc)
  }
  return acc
}

function allTexts(): string[] {
  return collectTexts(lastDocDefinition().content)
}

function findNode(node: any, pred: (n: any) => boolean): any | undefined {
  if (node == null) return undefined
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findNode(item, pred)
      if (found) return found
    }
    return undefined
  }
  if (typeof node === 'object') {
    if (pred(node)) return node
    for (const key of Object.keys(node)) {
      const found = findNode(node[key], pred)
      if (found) return found
    }
  }
  return undefined
}

function answerValue(value: AnswerValue): { value: AnswerValue; lastEditedAt: string } {
  return { value, lastEditedAt: '2026-01-01T00:00:00Z' }
}

beforeEach(() => {
  setActivePinia(createPinia())
  createPdfMock.mockClear()
  downloadMock.mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('exportToPdf (Pre-scan namespace)', () => {
  let taskStore: ReturnType<typeof useTaskStore>
  let answerStore: ReturnType<typeof useAnswerStore>
  let calculationStore: ReturnType<typeof useCalculationStore>

  beforeEach(() => {
    taskStore = useTaskStore()
    answerStore = useAnswerStore()
    calculationStore = useCalculationStore()
    taskStore.setActiveNamespace(FormType.PRE_SCAN)
    answerStore.setActiveNamespace(FormType.PRE_SCAN)
  })

  function initTasks(tasks: Task[]) {
    taskStore.init(tasks, true)
  }

  it('builds a Pre-scan PDF with a results section and uses the provided filename', async () => {
    initTasks([
      {
        task: 'Algemene vragen',
        id: '0',
        type: ['task_group'],
        tasks: [{ task: 'Naam', id: '0.1', type: ['text_input'] }],
      },
      {
        task: 'Ondertekening',
        id: '1',
        type: ['task_group', 'signing'],
        tasks: [{ task: 'Handtekening', id: '1.1', type: ['text_input'] }],
      },
    ] as unknown as Task[])

    answerStore.setAnswer('0.1', 'Mijn project')

    calculationStore.assessmentResults = [
      {
        id: 'DPIA',
        level: 'required',
        result: 'verplicht',
        explanation: 'Regel 1\n\nRegel 2',
        required: true,
      },
      {
        id: 'IAMA',
        level: 'recommended',
        result: 'aanbevolen',
        explanation: 'Aanbevolen toelichting',
        required: false,
      },
      {
        id: 'NIET',
        level: 'not_required',
        result: 'niet nodig',
        explanation: 'Niet relevant',
        required: false,
      },
    ] as any

    await expect(
      exportToPdf(taskStore, answerStore, calculationStore, 'mijn-bestand.pdf'),
    ).resolves.toBeUndefined()

    expect(downloadMock).toHaveBeenCalledWith('mijn-bestand.pdf')

    const texts = allTexts()
    expect(texts).toContain('1.  Resultaten')
    expect(texts).toContain(
      'Op basis van uw antwoorden zijn de volgende assessments vereist of aanbevolen:',
    )
    expect(texts).toContain('DPIA')
    expect(texts).toContain('IAMA')
    expect(texts).not.toContain('NIET')
    expect(texts).toContain('Regel 1')
    expect(texts).toContain('Regel 2')
    expect(texts).toContain('2.  Algemene vragen')
    expect(texts.some((t) => t.includes('Ondertekening'))).toBe(false)
    expect(lastDocDefinition().info.title).toBe('Pre-scan DPIA Rapportagemodel')

    const footer = lastDocDefinition().footer(3, 7)
    expect(footer.text).toBe('Pagina 3 van 7')
    expect(footer.alignment).toBe('center')
  })

  it('renders the empty-results message when no assessment is required or recommended', async () => {
    initTasks([
      {
        task: 'Vragen',
        id: '0',
        type: ['task_group'],
        tasks: [{ task: 'Veld', id: '0.1', type: ['text_input'] }],
      },
    ] as unknown as Task[])

    calculationStore.assessmentResults = [] as any

    await exportToPdf(taskStore, answerStore, calculationStore)

    const texts = allTexts()
    expect(texts).toContain(
      'Op basis van de huidige antwoorden zijn er geen assessments vereist of aanbevolen.',
    )
  })

  it('falls back to a generated filename when none is provided', async () => {
    initTasks([
      {
        task: 'Vragen',
        id: '0',
        type: ['task_group'],
        tasks: [{ task: 'Veld', id: '0.1', type: ['text_input'] }],
      },
    ] as unknown as Task[])
    calculationStore.assessmentResults = [] as any

    await exportToPdf(taskStore, answerStore, calculationStore)

    const arg = downloadMock.mock.calls[0][0] as string
    expect(arg.startsWith('prescan_')).toBe(true)
    expect(arg.endsWith('.pdf')).toBe(true)
  })
})

describe('exportToPdf (DPIA namespace)', () => {
  let taskStore: ReturnType<typeof useTaskStore>
  let answerStore: ReturnType<typeof useAnswerStore>
  let calculationStore: ReturnType<typeof useCalculationStore>

  beforeEach(() => {
    taskStore = useTaskStore()
    answerStore = useAnswerStore()
    calculationStore = useCalculationStore()
  })

  function initTasks(tasks: Task[]) {
    taskStore.init(tasks, true)
  }

  it('places metadata (19), signing (20) and management summary (18) as un-numbered sections and numbers the official tasks', async () => {
    initTasks([
      {
        task: 'Managementsamenvatting',
        id: '18',
        type: ['task_group'],
        description: 'Samenvatting beschrijving',
        tasks: [{ task: 'Samenvatting', id: '18.1', type: ['open_text'] }],
      },
      {
        task: 'Metadata',
        id: '19',
        type: ['task_group'],
        tasks: [{ task: 'Versie', id: '19.1', type: ['text_input'] }],
      },
      {
        task: 'Ondertekening',
        id: '20',
        type: ['task_group', 'signing'],
        tasks: [{ task: 'Naam', id: '20.1', type: ['text_input'] }],
      },
      {
        task: 'Officiële sectie',
        id: '2',
        type: ['task_group'],
        is_official_id: true,
        description: 'Beschrijving van de officiële sectie',
        tasks: [{ task: 'Vraag', id: '2.1', type: ['text_input'] }],
      },
      {
        task: 'Officiële ondertekening',
        id: '3',
        type: ['task_group', 'signing'],
        is_official_id: true,
        tasks: [{ task: 'Veld', id: '3.1', type: ['text_input'] }],
      },
      {
        task: 'Niet-officieel',
        id: '4',
        type: ['task_group'],
        tasks: [{ task: 'Veld', id: '4.1', type: ['text_input'] }],
      },
    ] as unknown as Task[])

    answerStore.setAnswer('18.1', 'De samenvatting')
    answerStore.setAnswer('19.1', 'v1.0')
    answerStore.setAnswer('20.1', 'Sam de Vries')
    answerStore.setAnswer('2.1', 'Een antwoord')

    await exportToPdf(taskStore, answerStore, calculationStore)

    const texts = allTexts()
    expect(texts).toContain('Metadata')
    expect(texts).toContain('Ondertekening')
    expect(texts).toContain('Managementsamenvatting')
    expect(texts).toContain('Beschrijving')
    expect(texts).toContain('Samenvatting beschrijving')
    expect(texts).toContain('1.  Officiële sectie')
    expect(texts).toContain('Beschrijving van de officiële sectie')
    expect(texts.some((t) => t.includes('Officiële ondertekening'))).toBe(false)
    expect(texts.some((t) => t.includes('Niet-officieel'))).toBe(false)
    expect(lastDocDefinition().info.title).toBe('DPIA Rapportagemodel')
  })

  it('omits the optional 18/19/20 sections when those root tasks are absent', async () => {
    initTasks([
      {
        task: 'Officiële sectie A',
        id: '5',
        type: ['task_group'],
        is_official_id: true,
        tasks: [{ task: 'Vraag A', id: '5.1', type: ['text_input'] }],
      },
      {
        task: 'Officiële sectie B',
        id: '6',
        type: ['task_group'],
        is_official_id: true,
        tasks: [{ task: 'Vraag B', id: '6.1', type: ['text_input'] }],
      },
    ] as unknown as Task[])

    await exportToPdf(taskStore, answerStore, calculationStore)

    const texts = allTexts()
    expect(texts.some((t) => t === 'Metadata')).toBe(false)
    expect(texts).toContain('1.  Officiële sectie A')
    expect(texts).toContain('2.  Officiële sectie B')
  })

  it('renders a simple (non-group) un-numbered section without a description', async () => {
    initTasks([
      {
        task: 'Metadata simpel',
        id: '19',
        type: ['text_input'],
        tasks: [],
      },
    ] as unknown as Task[])

    answerStore.setAnswer('19', 'Losse waarde')

    await exportToPdf(taskStore, answerStore, calculationStore)

    const texts = allTexts()
    expect(texts).toContain('Metadata simpel')
    expect(texts).toContain('Losse waarde')
    expect(texts.some((t) => t === 'Beschrijving')).toBe(false)
  })
})

describe('answer value formatting', () => {
  let taskStore: ReturnType<typeof useTaskStore>
  let answerStore: ReturnType<typeof useAnswerStore>
  let calculationStore: ReturnType<typeof useCalculationStore>

  beforeEach(() => {
    taskStore = useTaskStore()
    answerStore = useAnswerStore()
    calculationStore = useCalculationStore()
  })

  async function exportSingleLeaf(value: AnswerValue): Promise<void> {
    taskStore.init(
      [
        {
          task: 'Leaf',
          id: '7',
          type: ['text_input'],
          is_official_id: true,
          tasks: [],
        },
      ] as unknown as Task[],
      true,
    )
    if (value !== undefined) {
      answerStore.answers[FormType.DPIA]['7'] = answerValue(value)
    }
    await exportToPdf(taskStore, answerStore, calculationStore)
  }

  it('formats an unanswered question with the Dutch placeholder', async () => {
    await exportSingleLeaf(undefined as unknown as AnswerValue)
    expect(allTexts()).toContain(
      'Vraag is niet ingevuld of er is geen waarde geselecteerd.',
    )
  })

  it('formats an array answer as comma-separated cleaned items, dropping null/empty items', async () => {
    await exportSingleLeaf(['Eerste', null as unknown as string, '', 'Tweede'])
    expect(allTexts()).toContain('Eerste, Tweede')
  })

  it('formats the string "true" as "Ja"', async () => {
    await exportSingleLeaf('true')
    expect(allTexts()).toContain('Ja')
  })

  it('formats the string "false" as "Nee"', async () => {
    await exportSingleLeaf('false')
    expect(allTexts()).toContain('Nee')
  })

  it('formats the string "null" as an empty string', async () => {
    await exportSingleLeaf('null')
    const node = findNode(lastDocDefinition().content, (n) => n.text === '' && n.style === 'normal')
    expect(node).toBeDefined()
  })

  it('renders a normal string answer via markdown', async () => {
    await exportSingleLeaf('Gewone **vetgedrukte** tekst')
    expect(allTexts().some((t) => t.includes('Gewone'))).toBe(true)
    expect(allTexts()).toContain('vetgedrukte')
  })
})

describe('grouped / repeatable / image content', () => {
  let taskStore: ReturnType<typeof useTaskStore>
  let answerStore: ReturnType<typeof useAnswerStore>
  let calculationStore: ReturnType<typeof useCalculationStore>

  beforeEach(() => {
    taskStore = useTaskStore()
    answerStore = useAnswerStore()
    calculationStore = useCalculationStore()
  })

  it('renders a task_group answer with child tables, instance labels, nested repeatables and images', async () => {
    taskStore.init(
      [
        {
          task: 'Hoofdtaak',
          id: '8',
          type: ['task_group'],
          is_official_id: true,
          tasks: [
            {
              task: 'Subgroep met label',
              id: '8.1',
              type: ['task_group'],
              instance_label_template: 'Item {8.1.1}',
              tasks: [
                { task: 'Naam', id: '8.1.1', type: ['text_input'] },
                { task: 'Afbeelding', id: '8.1.2', type: ['image'] },
                {
                  task: 'Geneste herhaalbare',
                  id: '8.1.3',
                  type: ['task_group'],
                  repeatable: true,
                  tasks: [{ task: 'Detail', id: '8.1.3.1', type: ['text_input'] }],
                },
              ],
            },
            {
              task: 'Subgroep zonder eigen velden',
              id: '8.2',
              type: ['task_group'],
              tasks: [
                {
                  task: 'Diepe groep',
                  id: '8.2.1',
                  type: ['task_group'],
                  tasks: [{ task: 'Diep veld', id: '8.2.1.1', type: ['text_input'] }],
                },
              ],
            },
          ],
        },
      ] as unknown as Task[],
      true,
    )

    const image: ImageValue = {
      data: 'data:image/png;base64,IMGDATA',
      title: 'Mijn afbeelding',
      description: 'Een beschrijving',
      source: 'bron.png',
    }

    answerStore.setAnswer('8.1.1', 'Adres')
    answerStore.answers[FormType.DPIA]['8.1.2'] = answerValue(image)
    const nestedInstanceId = Object.values(taskStore.taskInstances[FormType.DPIA]).find(
      (i) => i.taskId === '8.1.3.1',
    )!.id
    answerStore.setAnswer(nestedInstanceId, 'Geneste waarde')
    answerStore.setAnswer('8.2.1.1', 'Diepe waarde')

    await exportToPdf(taskStore, answerStore, calculationStore)

    const texts = allTexts()
    expect(texts).toContain('Subgroep met label')
    expect(texts).toContain('Subgroep zonder eigen velden')
    // No mapping source, so renderInstanceLabel leaves the template placeholder intact.
    expect(texts).toContain('Item {8.1.1}')
    expect(texts).toContain('Naam')
    expect(texts).toContain('Adres')
    expect(texts).toContain('Mijn afbeelding')
    expect(texts).toContain('Een beschrijving')
    expect(texts).toContain('Bron: bron.png')
    const imgNode = findNode(lastDocDefinition().content, (n) => typeof n.image === 'string')
    expect(imgNode).toBeDefined()
    expect(imgNode.image).toBe('data:image/png;base64,IMGDATA')
    expect(texts).toContain('Geneste herhaalbare')
    expect(texts).toContain('Geneste waarde')
    expect(texts).toContain('Diep veld')
    expect(texts).toContain('Diepe waarde')
  })

  it('renders an image as the direct answer of a non-group root task', async () => {
    taskStore.init(
      [
        {
          task: 'Losse afbeelding',
          id: '9',
          type: ['image'],
          is_official_id: true,
          tasks: [],
        },
      ] as unknown as Task[],
      true,
    )

    const image: ImageValue = { data: 'data:image/png;base64,SOLO' }
    answerStore.answers[FormType.DPIA]['9'] = answerValue(image)

    await exportToPdf(taskStore, answerStore, calculationStore)

    const imgNode = findNode(lastDocDefinition().content, (n) => typeof n.image === 'string')
    expect(imgNode).toBeDefined()
    expect(imgNode.image).toBe('data:image/png;base64,SOLO')
  })

  it('converts a WebP image answer to PNG via the pre-conversion cache', async () => {
    taskStore.init(
      [
        {
          task: 'WebP afbeelding',
          id: '10',
          type: ['image'],
          is_official_id: true,
          tasks: [],
        },
      ] as unknown as Task[],
      true,
    )

    const webp: ImageValue = { data: 'data:image/webp;base64,WEBPDATA' }
    answerStore.answers[FormType.DPIA]['10'] = answerValue(webp)

    await exportToPdf(taskStore, answerStore, calculationStore)

    const imgNode = findNode(lastDocDefinition().content, (n) => typeof n.image === 'string')
    expect(imgNode).toBeDefined()
    expect(imgNode.image).toBe('data:image/webp;base64,WEBPDATA#converted-png')
  })

  it('renders an image without optional title/description/source fields', async () => {
    taskStore.init(
      [
        {
          task: 'Kale afbeelding',
          id: '11',
          type: ['image'],
          is_official_id: true,
          tasks: [],
        },
      ] as unknown as Task[],
      true,
    )

    const image: ImageValue = { data: 'data:image/png;base64,BARE' }
    answerStore.answers[FormType.DPIA]['11'] = answerValue(image)

    await exportToPdf(taskStore, answerStore, calculationStore)

    const texts = allTexts()
    expect(texts.some((t) => t.startsWith('Bron:'))).toBe(false)
    const imgNode = findNode(lastDocDefinition().content, (n) => typeof n.image === 'string')
    expect(imgNode.image).toBe('data:image/png;base64,BARE')
  })

  it('renders an image inside a repeatable group table (imageBlocks branch)', async () => {
    taskStore.init(
      [
        {
          task: 'Groep met afbeelding',
          id: '12',
          type: ['task_group'],
          is_official_id: true,
          tasks: [
            {
              task: 'Subgroep',
              id: '12.1',
              type: ['task_group'],
              tasks: [
                { task: 'Tekstveld', id: '12.1.1', type: ['text_input'] },
                { task: 'Plaatje', id: '12.1.2', type: ['image'] },
              ],
            },
          ],
        },
      ] as unknown as Task[],
      true,
    )

    answerStore.setAnswer('12.1.1', 'Wat tekst')
    const image: ImageValue = { data: 'data:image/png;base64,INTABLE', title: 'In tabel' }
    answerStore.answers[FormType.DPIA]['12.1.2'] = answerValue(image)

    await exportToPdf(taskStore, answerStore, calculationStore)

    const texts = allTexts()
    expect(texts).toContain('Wat tekst')
    expect(texts).toContain('In tabel')
    const imgNode = findNode(lastDocDefinition().content, (n) => n.image === 'data:image/png;base64,INTABLE')
    expect(imgNode).toBeDefined()
  })

  it('hides a conditionally-hidden field so its instance produces no content', async () => {
    taskStore.init(
      [
        {
          task: 'Conditionele groep',
          id: '13',
          type: ['task_group'],
          is_official_id: true,
          tasks: [
            {
              task: 'Subgroep',
              id: '13.1',
              type: ['task_group'],
              tasks: [
                { task: 'Schakelaar', id: '13.1.1', type: ['radio_option'] },
                {
                  task: 'Verborgen veld',
                  id: '13.1.2',
                  type: ['text_input'],
                  dependencies: [
                    {
                      type: 'conditional',
                      action: 'show',
                      condition: { id: '13.1.1', operator: 'equals', value: 'yes' },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ] as unknown as Task[],
      true,
    )

    answerStore.setAnswer('13.1.1', 'no')
    answerStore.setAnswer('13.1.2', 'Geheim')

    await exportToPdf(taskStore, answerStore, calculationStore)

    const texts = allTexts()
    expect(texts).toContain('Schakelaar')
    expect(texts.some((t) => t.includes('Geheim'))).toBe(false)
  })

  it('renders an instance-mapped nested group (findMappedInstances path)', async () => {
    taskStore.init(
      [
        {
          task: 'Mapping hoofdtaak',
          id: '14',
          type: ['task_group'],
          is_official_id: true,
          tasks: [
            {
              task: 'Bron groep',
              id: '14.1',
              type: ['task_group'],
              repeatable: true,
              tasks: [
                { task: 'Bronnaam', id: '14.1.1', type: ['text_input'] },
                {
                  task: 'Gemapte groep',
                  id: '14.1.2',
                  type: ['task_group'],
                  dependencies: [{ type: 'instance_mapping', action: 'show' }],
                  tasks: [{ task: 'Gemapt veld', id: '14.1.2.1', type: ['text_input'] }],
                },
              ],
            },
          ],
        },
      ] as unknown as Task[],
      true,
    )

    const ns = FormType.DPIA
    const parentInstanceId = '14.1[0]'
    const mappedInstanceId = Object.values(taskStore.taskInstances[ns]).find(
      (i) => i.taskId === '14.1.2',
    )!.id
    taskStore.taskInstances[ns][mappedInstanceId].mappedFromInstanceId = parentInstanceId

    const sourceInstanceId = Object.values(taskStore.taskInstances[ns]).find(
      (i) => i.taskId === '14.1.1',
    )!.id
    answerStore.setAnswer(sourceInstanceId, 'Bronwaarde')
    const mappedFieldInstanceId = Object.values(taskStore.taskInstances[ns]).find(
      (i) => i.taskId === '14.1.2.1',
    )!.id
    answerStore.setAnswer(mappedFieldInstanceId, 'Gemapte waarde')

    await exportToPdf(taskStore, answerStore, calculationStore)

    const texts = allTexts()
    expect(texts).toContain('Bronwaarde')
    expect(texts).toContain('Gemapte waarde')
  })

  it('produces no child content when a repeatable group instance has no answers', async () => {
    taskStore.init(
      [
        {
          task: 'Lege groep-taak',
          id: '15',
          type: ['task_group'],
          is_official_id: true,
          tasks: [
            {
              task: 'Lege subgroep',
              id: '15.1',
              type: ['task_group'],
              tasks: [{ task: 'Niet ingevuld', id: '15.1.1', type: ['text_input'] }],
            },
          ],
        },
      ] as unknown as Task[],
      true,
    )

    await exportToPdf(taskStore, answerStore, calculationStore)

    const texts = allTexts()
    expect(texts).toContain('Lege subgroep')
  })

  it('renders a child group leaf with no instances as empty (instanceIds.length === 0)', async () => {
    taskStore.init(
      [
        {
          task: 'Taak met verwijderde instances',
          id: '16',
          type: ['task_group'],
          is_official_id: true,
          tasks: [
            { task: 'Veld zonder instance', id: '16.1', type: ['text_input'] },
          ],
        },
      ] as unknown as Task[],
      true,
    )

    const ns = FormType.DPIA
    for (const inst of Object.values(taskStore.taskInstances[ns])) {
      if (inst.taskId === '16.1') delete taskStore.taskInstances[ns][inst.id]
    }

    await exportToPdf(taskStore, answerStore, calculationStore)

    const texts = allTexts()
    expect(texts).toContain('Veld zonder instance')
  })

  it('renders a leaf image directly under a task_group (image branch of the leaf path)', async () => {
    taskStore.init(
      [
        {
          task: 'Groep met losse afbeelding',
          id: '21',
          type: ['task_group'],
          is_official_id: true,
          tasks: [{ task: 'Losse afbeelding', id: '21.1', type: ['image'] }],
        },
      ] as unknown as Task[],
      true,
    )

    const image: ImageValue = { data: 'data:image/png;base64,LEAFIMG', title: 'Leaf' }
    answerStore.answers[FormType.DPIA]['21.1'] = answerValue(image)

    await exportToPdf(taskStore, answerStore, calculationStore)

    const imgNode = findNode(lastDocDefinition().content, (n) => n.image === 'data:image/png;base64,LEAFIMG')
    expect(imgNode).toBeDefined()
    expect(allTexts()).toContain('Leaf')
  })

  it('hides a conditionally-hidden leaf field directly under a task_group (shouldShowTask false in leaf path)', async () => {
    taskStore.init(
      [
        {
          task: 'Groep met verborgen blad',
          id: '22',
          type: ['task_group'],
          is_official_id: true,
          tasks: [
            { task: 'Schakelaar', id: '22.1', type: ['radio_option'] },
            {
              task: 'Verborgen blad',
              id: '22.2',
              type: ['text_input'],
              dependencies: [
                {
                  type: 'conditional',
                  action: 'show',
                  condition: { id: '22.1', operator: 'equals', value: 'yes' },
                },
              ],
            },
          ],
        },
      ] as unknown as Task[],
      true,
    )

    answerStore.setAnswer('22.1', 'no')
    answerStore.setAnswer('22.2', 'Verborgen antwoord')

    await exportToPdf(taskStore, answerStore, calculationStore)

    const texts = allTexts()
    expect(texts.some((t) => t.includes('Verborgen antwoord'))).toBe(false)
  })

  it('skips a hidden child-group instance (continue in the group loop)', async () => {
    taskStore.init(
      [
        {
          task: 'Groep met verborgen subgroep',
          id: '23',
          type: ['task_group'],
          is_official_id: true,
          tasks: [
            { task: 'Schakelaar', id: '23.1', type: ['radio_option'] },
            {
              task: 'Verborgen subgroep',
              id: '23.2',
              type: ['task_group'],
              dependencies: [
                {
                  type: 'conditional',
                  action: 'show',
                  condition: { id: '23.1', operator: 'equals', value: 'yes' },
                },
              ],
              tasks: [{ task: 'Subveld', id: '23.2.1', type: ['text_input'] }],
            },
          ],
        },
      ] as unknown as Task[],
      true,
    )

    answerStore.setAnswer('23.1', 'no')
    answerStore.setAnswer('23.2.1', 'Verborgen subwaarde')

    await exportToPdf(taskStore, answerStore, calculationStore)

    const texts = allTexts()
    expect(texts.some((t) => t.includes('Verborgen subwaarde'))).toBe(false)
  })

  it('omits a nested child group that yields no elements (childElements.length === 0)', async () => {
    taskStore.init(
      [
        {
          task: 'Groep met lege diepe groep',
          id: '24',
          type: ['task_group'],
          is_official_id: true,
          tasks: [
            {
              task: 'Subgroep',
              id: '24.1',
              type: ['task_group'],
              tasks: [
                { task: 'Direct veld', id: '24.1.0', type: ['text_input'] },
                {
                  task: 'Diepe groep',
                  id: '24.1.1',
                  type: ['task_group'],
                  tasks: [{ task: 'Diep veld', id: '24.1.1.1', type: ['text_input'] }],
                },
              ],
            },
          ],
        },
      ] as unknown as Task[],
      true,
    )

    const ns = FormType.DPIA
    for (const inst of Object.values(taskStore.taskInstances[ns])) {
      if (inst.taskId === '24.1.1' || inst.taskId === '24.1.1.1') {
        delete taskStore.taskInstances[ns][inst.id]
      }
    }

    answerStore.setAnswer('24.1.0', 'Aanwezig')

    await exportToPdf(taskStore, answerStore, calculationStore)

    const texts = allTexts()
    expect(texts).toContain('Aanwezig')
    expect(texts.some((t) => t.includes('Diep veld'))).toBe(false)
  })

  it('handles a missing answers namespace during image pre-conversion (|| {} fallback)', async () => {
    taskStore.setActiveNamespace(FormType.PRE_SCAN)
    answerStore.setActiveNamespace(FormType.PRE_SCAN)
    taskStore.init([] as unknown as Task[], true)

    delete (answerStore.answers as Record<string, unknown>)[FormType.PRE_SCAN]
    calculationStore.assessmentResults = [] as any

    await expect(
      exportToPdf(taskStore, answerStore, calculationStore),
    ).resolves.toBeUndefined()

    expect(allTexts()).toContain('1.  Resultaten')
  })
})

describe('exportToPdf error handling', () => {
  it('rejects with a wrapped error when font loading fails', async () => {
    const taskStore = useTaskStore()
    const answerStore = useAnswerStore()
    const calculationStore = useCalculationStore()

    taskStore.init(
      [
        {
          task: 'Sectie',
          id: '17',
          type: ['task_group'],
          is_official_id: true,
          tasks: [{ task: 'Veld', id: '17.1', type: ['text_input'] }],
        },
      ] as unknown as Task[],
      true,
    )

    const FontService = (await import('../../src/services/fontService')).default
    vi.mocked(FontService.getFonts).mockRejectedValueOnce(new Error('font boom'))

    await expect(
      exportToPdf(taskStore, answerStore, calculationStore),
    ).rejects.toThrow('Failed to export PDF: Error: font boom')
  })
})

describe('exportToPdf (IAMA namespace)', () => {
  let taskStore: ReturnType<typeof useTaskStore>
  let answerStore: ReturnType<typeof useAnswerStore>
  let calculationStore: ReturnType<typeof useCalculationStore>

  beforeEach(() => {
    taskStore = useTaskStore()
    answerStore = useAnswerStore()
    calculationStore = useCalculationStore()
    taskStore.setActiveNamespace(FormType.IAMA)
    answerStore.setActiveNamespace(FormType.IAMA)
  })

  it('numbers IAMA sections starting at 1 (no Resultaten section) and skips signing tasks', async () => {
    taskStore.init(
      [
        {
          task: 'Aanleiding',
          id: '0',
          type: ['task_group'],
          tasks: [{ task: 'Beschrijving', id: '0.1', type: ['text_input'] }],
        },
        {
          task: 'Betrokkenen',
          id: '1',
          type: ['task_group'],
          tasks: [{ task: 'Wie', id: '1.1', type: ['text_input'] }],
        },
        {
          task: 'Ondertekening',
          id: '2',
          type: ['task_group', 'signing'],
          tasks: [{ task: 'Handtekening', id: '2.1', type: ['text_input'] }],
        },
      ] as unknown as Task[],
      true,
    )

    answerStore.setAnswer('0.1', 'Mijn aanleiding')

    await exportToPdf(taskStore, answerStore, calculationStore)

    const texts = allTexts()
    // First section is numbered 1 — no spurious "Resultaten" section as in pre-scan.
    expect(texts.some((t) => t.includes('Resultaten'))).toBe(false)
    expect(texts).toContain('1.  Aanleiding')
    expect(texts).toContain('2.  Betrokkenen')
    expect(texts).toContain('Mijn aanleiding')
    // Signing task is excluded.
    expect(texts.some((t) => t.includes('Ondertekening'))).toBe(false)
    expect(lastDocDefinition().info.title).toBe('IAMA Rapportagemodel')
  })

  it('uses an iama_-prefixed generated filename when none is provided', async () => {
    taskStore.init(
      [
        {
          task: 'Vragen',
          id: '0',
          type: ['task_group'],
          tasks: [{ task: 'Veld', id: '0.1', type: ['text_input'] }],
        },
      ] as unknown as Task[],
      true,
    )

    await exportToPdf(taskStore, answerStore, calculationStore)

    const arg = downloadMock.mock.calls[0][0] as string
    expect(arg.startsWith('iama_')).toBe(true)
    expect(arg.endsWith('.pdf')).toBe(true)
  })
})

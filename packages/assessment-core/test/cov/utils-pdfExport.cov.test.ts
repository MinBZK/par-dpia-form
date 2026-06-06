import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Task } from '../../src/models/dpia'
import { FormType } from '../../src/models/dpia'

// ---------------------------------------------------------------------------
// Mock the side-effecting modules that pdfExport imports. None of these belong
// to the file under test, so mocking them does not affect its coverage; it only
// lets the PDF pipeline run in jsdom without real fonts / canvas / downloads.
// ---------------------------------------------------------------------------

// Capture the last document definition handed to pdfMake.createPdf so tests can
// assert on the generated content structure.
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

// FontService loads fonts via import.meta.glob + fetch — mock it out entirely.
vi.mock('../../src/services/fontService', () => ({
  default: {
    getFonts: vi.fn(async () => ({ customFamily: { normal: 'custom.ttf' } })),
    getVFS: vi.fn(async () => ({ 'custom.ttf': 'base64data' })),
  },
}))

// convertWebpToPng touches canvas; replace with a deterministic stub.
vi.mock('../../src/utils/imageResize', () => ({
  convertWebpToPng: vi.fn(async (data: string) => `${data}#converted-png`),
}))

import { exportToPdf } from '../../src/utils/pdfExport'
import { useTaskStore } from '../../src/stores/tasks'
import { useAnswerStore } from '../../src/stores/answers'
import { useCalculationStore } from '../../src/stores/calculations'
import type { AnswerValue, ImageValue } from '../../src/stores/answers'

// Convenience: grab the doc definition from the most recent createPdf call.
function lastDocDefinition(): any {
  expect(createPdfMock).toHaveBeenCalled()
  return createPdfMock.mock.calls[createPdfMock.mock.calls.length - 1][0]
}

// Walk a pdfmake content tree and collect every `text` string into a flat array.
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

// Recursively find a node satisfying `pred` anywhere in the content tree.
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

// ===========================================================================
// Pre-Scan namespace export
// ===========================================================================
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
      // A signing root task must be filtered out of Pre-scan sections.
      {
        task: 'Ondertekening',
        id: '1',
        type: ['task_group', 'signing'],
        tasks: [{ task: 'Handtekening', id: '1.1', type: ['text_input'] }],
      },
    ] as unknown as Task[])

    answerStore.setAnswer('0.1', 'Mijn project')

    // Two assessments: one required, one merely recommended, one filtered out.
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
    // Results header is section 1.
    expect(texts).toContain('1.  Resultaten')
    expect(texts).toContain(
      'Op basis van uw antwoorden zijn de volgende assessments vereist of aanbevolen:',
    )
    // Required + recommended appear; not_required filtered out.
    expect(texts).toContain('DPIA')
    expect(texts).toContain('IAMA')
    expect(texts).not.toContain('NIET')
    // Explanation lines split on \n with empty lines filtered.
    expect(texts).toContain('Regel 1')
    expect(texts).toContain('Regel 2')
    // First non-signing root task becomes section 2.
    expect(texts).toContain('2.  Algemene vragen')
    // The signing root task is excluded.
    expect(texts.some((t) => t.includes('Ondertekening'))).toBe(false)
    // info.title uses the Pre-scan DPIA label.
    expect(lastDocDefinition().info.title).toBe('Pre-scan DPIA Rapportagemodel')

    // The footer callback renders the Dutch page counter.
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

    // generateFilename produces "<namespace>_<timestamp>.pdf".
    const arg = downloadMock.mock.calls[0][0] as string
    expect(arg.startsWith('prescan_')).toBe(true)
    expect(arg.endsWith('.pdf')).toBe(true)
  })
})

// ===========================================================================
// DPIA namespace export
// ===========================================================================
describe('exportToPdf (DPIA namespace)', () => {
  let taskStore: ReturnType<typeof useTaskStore>
  let answerStore: ReturnType<typeof useAnswerStore>
  let calculationStore: ReturnType<typeof useCalculationStore>

  beforeEach(() => {
    taskStore = useTaskStore()
    answerStore = useAnswerStore()
    calculationStore = useCalculationStore()
    // Default namespace is DPIA already.
  })

  function initTasks(tasks: Task[]) {
    taskStore.init(tasks, true)
  }

  it('places metadata (19), signing (20) and management summary (18) as un-numbered sections and numbers the official tasks', async () => {
    initTasks([
      // Management summary (18)
      {
        task: 'Managementsamenvatting',
        id: '18',
        type: ['task_group'],
        description: 'Samenvatting beschrijving',
        tasks: [{ task: 'Samenvatting', id: '18.1', type: ['open_text'] }],
      },
      // Metadata (19)
      {
        task: 'Metadata',
        id: '19',
        type: ['task_group'],
        tasks: [{ task: 'Versie', id: '19.1', type: ['text_input'] }],
      },
      // Signing (20)
      {
        task: 'Ondertekening',
        id: '20',
        type: ['task_group', 'signing'],
        tasks: [{ task: 'Naam', id: '20.1', type: ['text_input'] }],
      },
      // An official, numbered task (not signing) WITH a description so the
      // numbered-section description branch is exercised.
      {
        task: 'Officiële sectie',
        id: '2',
        type: ['task_group'],
        is_official_id: true,
        description: 'Beschrijving van de officiële sectie',
        tasks: [{ task: 'Vraag', id: '2.1', type: ['text_input'] }],
      },
      // An official task that is also a signing task: filtered from officialTasks.
      {
        task: 'Officiële ondertekening',
        id: '3',
        type: ['task_group', 'signing'],
        is_official_id: true,
        tasks: [{ task: 'Veld', id: '3.1', type: ['text_input'] }],
      },
      // A non-official root task: not numbered, not un-numbered → excluded.
      {
        task: 'Niet-officieel',
        id: '4',
        type: ['task_group'],
        tasks: [{ task: 'Veld', id: '4.1', type: ['text_input'] }],
      },
    ] as unknown as Task[])

    answerStore.setAnswer('18.1', 'De samenvatting')
    answerStore.setAnswer('19.1', 'v1.0')
    answerStore.setAnswer('20.1', 'Jan Jansen')
    answerStore.setAnswer('2.1', 'Een antwoord')

    await exportToPdf(taskStore, answerStore, calculationStore)

    const texts = allTexts()
    // Un-numbered sections (no leading number).
    expect(texts).toContain('Metadata')
    expect(texts).toContain('Ondertekening')
    expect(texts).toContain('Managementsamenvatting')
    // Description rendered for management summary.
    expect(texts).toContain('Beschrijving')
    expect(texts).toContain('Samenvatting beschrijving')
    // The single official non-signing task is numbered "1." and shows its description.
    expect(texts).toContain('1.  Officiële sectie')
    expect(texts).toContain('Beschrijving van de officiële sectie')
    // Official-signing task excluded from numbered sections.
    expect(texts.some((t) => t.includes('Officiële ondertekening'))).toBe(false)
    // Non-official root excluded entirely.
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
    // No Metadata/Ondertekening/Managementsamenvatting headers.
    expect(texts.some((t) => t === 'Metadata')).toBe(false)
    // Two official tasks numbered 1 and 2.
    expect(texts).toContain('1.  Officiële sectie A')
    expect(texts).toContain('2.  Officiële sectie B')
  })

  it('renders a simple (non-group) un-numbered section without a description', async () => {
    // Root task id 19 that is NOT a task_group: buildAnswer takes the else branch.
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
    // No description heading because the task has none.
    expect(texts.some((t) => t === 'Beschrijving')).toBe(false)
  })
})

// ===========================================================================
// buildAnswer / formatAnswerContent value formatting (exercised via DPIA export)
// ===========================================================================
describe('answer value formatting', () => {
  let taskStore: ReturnType<typeof useTaskStore>
  let answerStore: ReturnType<typeof useAnswerStore>
  let calculationStore: ReturnType<typeof useCalculationStore>

  beforeEach(() => {
    taskStore = useTaskStore()
    answerStore = useAnswerStore()
    calculationStore = useCalculationStore()
  })

  // Build one official, non-group leaf root task whose own answer is rendered
  // through buildAnswer's else branch + formatAnswerContent.
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
    // No answer set → getAnswer returns null → formatAnswerContent null branch.
    await exportSingleLeaf(undefined as unknown as AnswerValue)
    expect(allTexts()).toContain(
      'Vraag is niet ingevuld of er is geen waarde geselecteerd.',
    )
  })

  it('formats an array answer as comma-separated cleaned items, dropping null/empty items', async () => {
    await exportSingleLeaf(['Eerste', null as unknown as string, '', 'Tweede'])
    // formatAnswerValue joins cleaned items with ", " (null/empty filtered out).
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
    // The node exists with empty text.
    const node = findNode(lastDocDefinition().content, (n) => n.text === '' && n.style === 'normal')
    expect(node).toBeDefined()
  })

  it('renders a normal string answer via markdown', async () => {
    await exportSingleLeaf('Gewone **vetgedrukte** tekst')
    // markdownToPdfContent splits the bold run; the plain part is present.
    expect(allTexts().some((t) => t.includes('Gewone'))).toBe(true)
    expect(allTexts()).toContain('vetgedrukte')
  })
})

// ===========================================================================
// Repeatable groups, tables, images and nested instances
// ===========================================================================
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
    // Tree:
    // 8 (official task_group)
    //   8.1 (group, instance_label_template)
    //     8.1.1 (leaf text)
    //     8.1.2 (leaf image)
    //     8.1.3 (repeatable group, nested)
    //       8.1.3.1 (leaf text)
    //   8.2 (group with grandchildren, no own leaves → buildTableRows skips it)
    //     8.2.1 (group)
    //       8.2.1.1 (leaf)
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
    // 8.1.3 is repeatable so its child 8.1.3.1 is indexed (e.g. 8.1.3.1[0]).
    const nestedInstanceId = Object.values(taskStore.taskInstances[FormType.DPIA]).find(
      (i) => i.taskId === '8.1.3.1',
    )!.id
    answerStore.setAnswer(nestedInstanceId, 'Geneste waarde')
    answerStore.setAnswer('8.2.1.1', 'Diepe waarde')

    await exportToPdf(taskStore, answerStore, calculationStore)

    const texts = allTexts()
    // Child task headers from buildAnswer's task_group branch.
    expect(texts).toContain('Subgroep met label')
    expect(texts).toContain('Subgroep zonder eigen velden')
    // Instance label header from buildTableRows. Without a mapping source the
    // template placeholder is left intact by renderInstanceLabel.
    expect(texts).toContain('Item {8.1.1}')
    // Leaf field label + value in the table.
    expect(texts).toContain('Naam')
    expect(texts).toContain('Adres')
    // Image title/description/source from buildImageContent.
    expect(texts).toContain('Mijn afbeelding')
    expect(texts).toContain('Een beschrijving')
    expect(texts).toContain('Bron: bron.png')
    // The image data is rendered (converted PNG passthrough since it is not webp).
    const imgNode = findNode(lastDocDefinition().content, (n) => typeof n.image === 'string')
    expect(imgNode).toBeDefined()
    expect(imgNode.image).toBe('data:image/png;base64,IMGDATA')
    // Nested repeatable category header.
    expect(texts).toContain('Geneste herhaalbare')
    expect(texts).toContain('Geneste waarde')
    // Deep field reached via the grandchild recursion.
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

    // buildAnswer else branch detects the ImageValue and calls buildImageContent.
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

    // getPdfImageData returns the cached, converted PNG (left side of ??).
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

    // Only data, no title/description/source → those buildImageContent branches stay false.
    const image: ImageValue = { data: 'data:image/png;base64,BARE' }
    answerStore.answers[FormType.DPIA]['11'] = answerValue(image)

    await exportToPdf(taskStore, answerStore, calculationStore)

    const texts = allTexts()
    expect(texts.some((t) => t.startsWith('Bron:'))).toBe(false)
    const imgNode = findNode(lastDocDefinition().content, (n) => typeof n.image === 'string')
    expect(imgNode.image).toBe('data:image/png;base64,BARE')
  })

  it('renders an image inside a repeatable group table (imageBlocks branch)', async () => {
    // A group whose direct leaf child is an image: buildTableRows pushes it to imageBlocks.
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
    // 13.1.2 depends on 13.1.1 == "yes"; with "no" the field is hidden in the table.
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
    // The switch label is shown, the hidden field's value is not.
    expect(texts).toContain('Schakelaar')
    expect(texts.some((t) => t.includes('Geheim'))).toBe(false)
  })

  it('renders an instance-mapped nested group (findMappedInstances path)', async () => {
    // 14.1 is a repeatable group; 14.1.1 is a nested group with an instance_mapping
    // dependency, so processTaskWithInstances resolves instances via findMappedInstances.
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

    // Default instances exist for 14.1[0] and its children. Set up a mapping so
    // the mapped child group instance points back to the parent instance.
    const ns = FormType.DPIA
    const parentInstanceId = '14.1[0]'
    // Find the default instance id of the mapped group (14.1.2[0]).
    const mappedInstanceId = Object.values(taskStore.taskInstances[ns]).find(
      (i) => i.taskId === '14.1.2',
    )!.id
    taskStore.taskInstances[ns][mappedInstanceId].mappedFromInstanceId = parentInstanceId

    // Answers live at the indexed instance ids (the repeatable parent indexes them).
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
    // A repeatable group whose only instance has no answers: buildTableRows yields
    // no rows and no images, exercising the "no rows" / "no images" guards.
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

    // No answers at all. The leaf 15.1.1 still appears because formatAnswerContent
    // renders the "not filled" placeholder for a present instance.
    await exportToPdf(taskStore, answerStore, calculationStore)

    const texts = allTexts()
    expect(texts).toContain('Lege subgroep')
  })

  it('renders a child group leaf with no instances as empty (instanceIds.length === 0)', async () => {
    // Remove the default instances of a leaf so getInstanceIdsForTask returns [].
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
    // Delete the default instance of 16.1 so processTaskWithInstances returns early.
    for (const inst of Object.values(taskStore.taskInstances[ns])) {
      if (inst.taskId === '16.1') delete taskStore.taskInstances[ns][inst.id]
    }

    await exportToPdf(taskStore, answerStore, calculationStore)

    const texts = allTexts()
    // The child header still renders, but the field has no content.
    expect(texts).toContain('Veld zonder instance')
  })

  it('renders a leaf image directly under a task_group (image branch of the leaf path)', async () => {
    // A task_group whose direct child is a LEAF image task: processTaskWithInstances
    // hits the no-children branch and pushes buildImageContent for the image answer.
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
    // 22.2 (leaf) depends on sibling 22.1 == "yes". With "no" it is hidden, so the
    // leaf-path shouldShowTask guard skips it.
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
    // 23.2 is a child GROUP with a conditional dependency on sibling leaf 23.1.
    // With the condition unmet, shouldShowTask(23.2, ...) is false → the loop continues.
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
    // The subgroup's field value must not appear because the subgroup is hidden.
    expect(texts.some((t) => t.includes('Verborgen subwaarde'))).toBe(false)
  })

  it('omits a nested child group that yields no elements (childElements.length === 0)', async () => {
    // 24.1 has a grandchild group 24.1.1 (passes the "has children" filter) but
    // 24.1.1 has no instances, so the recursion returns [] and nothing is pushed.
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
    // Remove all instances of the deep group 24.1.1 so its recursion returns [].
    for (const inst of Object.values(taskStore.taskInstances[ns])) {
      if (inst.taskId === '24.1.1' || inst.taskId === '24.1.1.1') {
        delete taskStore.taskInstances[ns][inst.id]
      }
    }

    answerStore.setAnswer('24.1.0', 'Aanwezig')

    await exportToPdf(taskStore, answerStore, calculationStore)

    const texts = allTexts()
    // The direct field renders; the empty deep group contributes nothing.
    expect(texts).toContain('Aanwezig')
    expect(texts.some((t) => t.includes('Diep veld'))).toBe(false)
  })

  it('handles a missing answers namespace during image pre-conversion (|| {} fallback)', async () => {
    // Switch to the Pre-scan namespace, then delete its answers object entirely.
    // With zero non-signing root tasks, no answer is read during content building,
    // so preConvertImages takes the `answers[namespace] || {}` fallback path.
    taskStore.setActiveNamespace(FormType.PRE_SCAN)
    answerStore.setActiveNamespace(FormType.PRE_SCAN)
    taskStore.init([] as unknown as Task[], true)

    delete (answerStore.answers as Record<string, unknown>)[FormType.PRE_SCAN]
    calculationStore.assessmentResults = [] as any

    await expect(
      exportToPdf(taskStore, answerStore, calculationStore),
    ).resolves.toBeUndefined()

    // Only the results section is produced.
    expect(allTexts()).toContain('1.  Resultaten')
  })
})

// ===========================================================================
// Error handling
// ===========================================================================
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

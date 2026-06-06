import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTaskStore, type FlatTask, type TaskInstance } from '../../src/stores/tasks'
import { useAnswerStore, type Answer, type ImageValue, type AnswerValue } from '../../src/stores/answers'
import { exportToMarkdown } from '../../src/utils/markdownExport'
import { FormType } from '../../src/models/dpia'

// ---------------------------------------------------------------------------
// Helpers: directly populate the Pinia stores so every code path in
// markdownExport can be driven deterministically. exportToMarkdown only reads
// flatTasks, taskInstances, rootTaskIds and answers for the active namespace.
// ---------------------------------------------------------------------------

type StoreSetup = {
  taskStore: ReturnType<typeof useTaskStore>
  answerStore: ReturnType<typeof useAnswerStore>
}

function answer(value: AnswerValue): Answer {
  return { value, lastEditedAt: '2026-01-01T00:00:00Z' }
}

function seed(
  ns: FormType,
  tasks: Record<string, FlatTask>,
  rootIds: string[],
  instances: Record<string, TaskInstance>,
  answers: Record<string, Answer>,
): StoreSetup {
  const taskStore = useTaskStore()
  const answerStore = useAnswerStore()

  taskStore.activeNamespace = ns
  answerStore.activeNamespace = ns

  taskStore.flatTasks[ns] = tasks
  taskStore.rootTaskIds[ns] = rootIds
  taskStore.taskInstances[ns] = instances
  answerStore.answers[ns] = answers

  return { taskStore, answerStore }
}

// Capture the markdown text that exportToMarkdown hands to downloadFile by
// intercepting the Blob it creates via URL.createObjectURL.
async function runExport(setup: StoreSetup, filename?: string): Promise<string> {
  let captured = ''
  const createSpy = vi
    .spyOn(URL, 'createObjectURL')
    .mockImplementation((blob: Blob) => {
      // Read the blob's text synchronously is not possible; store a promise.
      // Instead capture via a side channel below.
      void blob
      return 'blob:mock'
    })
  // Re-implement to actually read the blob text.
  let blobTextPromise: Promise<string> = Promise.resolve('')
  createSpy.mockImplementation((blob: Blob) => {
    blobTextPromise = blob.text()
    return 'blob:mock'
  })
  const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  const clickSpy = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(() => {})

  await exportToMarkdown(setup.taskStore, setup.answerStore, filename)
  captured = await blobTextPromise

  createSpy.mockRestore()
  revokeSpy.mockRestore()
  clickSpy.mockRestore()
  return captured
}

describe('exportToMarkdown', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // -------------------------------------------------------------------------
  // DPIA branch: metadata (#19), management summary (#18) and numbered official
  // sections, plus task_group children, repeatable groups, tables, images and
  // all formatAnswerValue variants.
  // -------------------------------------------------------------------------
  it('exports a full DPIA document covering metadata, summary and official sections', async () => {
    const img: ImageValue = {
      data: 'data:image/png;base64,abc',
      title: 'Diagram [1]',
      description: 'Een schema',
      source: 'bron.png',
    }

    const tasks: Record<string, FlatTask> = {
      // Metadata section (id 19) — simple (non task_group) section: hits the
      // else-branch of buildAnswerContent via getRootTaskInstanceIds.
      '19': {
        id: '19', task: 'Metadata', type: ['text_input'],
        parentId: null, childrenIds: [],
        description: 'Algemene gegevens',
      },
      // Management summary (id 18) — no description (false branch of buildSection).
      '18': {
        id: '18', task: 'Managementsamenvatting', type: ['text_input'],
        parentId: null, childrenIds: [],
      },
      // Official section 1 (task_group with children → buildAnswerContent group path)
      '1': {
        id: '1', task: 'Sectie <b>een</b>', type: ['task_group'],
        parentId: null, childrenIds: ['1.1', '1.2'],
        is_official_id: true,
        description: 'Beschrijving sectie 1',
      },
      // simple leaf child rendered as plain answer (no children → simple task path)
      '1.1': {
        id: '1.1', task: 'Veld 1.1', type: ['text_input'],
        parentId: '1', childrenIds: [],
      },
      // repeatable group child with instance_label_template + table + image + nested complex child
      '1.2': {
        id: '1.2', task: 'Herhaalbare groep', type: ['task_group'],
        parentId: '1', childrenIds: ['1.2.1', '1.2.2', '1.2.3'],
        repeatable: true,
        instance_label_template: 'Item',
      },
      '1.2.1': {
        id: '1.2.1', task: 'Naam', type: ['text_input'],
        parentId: '1.2', childrenIds: [],
      },
      '1.2.2': {
        id: '1.2.2', task: 'Afbeelding', type: ['image'],
        parentId: '1.2', childrenIds: [],
      },
      // complex child (has children) → recursion into processTaskWithInstances
      '1.2.3': {
        id: '1.2.3', task: 'Subgroep', type: ['task_group'],
        parentId: '1.2', childrenIds: ['1.2.3.1'],
      },
      '1.2.3.1': {
        id: '1.2.3.1', task: 'Subveld', type: ['text_input'],
        parentId: '1.2.3', childrenIds: [],
      },
      // Official section 2 — task_group WITHOUT children (childrenIds empty) so
      // buildAnswerContent takes else-branch for a task_group too.
      '2': {
        id: '2', task: 'Sectie twee', type: ['task_group'],
        parentId: null, childrenIds: [],
        is_official_id: true,
      },
      // A signing root task that must be filtered out entirely.
      '99': {
        id: '99', task: 'Ondertekening', type: ['task_group', 'signing'],
        parentId: null, childrenIds: [],
        is_official_id: true,
      },
    }

    const instances: Record<string, TaskInstance> = {
      '19': { id: '19', taskId: '19', groupId: 'g19', parentInstanceId: null, childInstanceIds: [] },
      '18': { id: '18', taskId: '18', groupId: 'g18', parentInstanceId: null, childInstanceIds: [] },
      '1': { id: '1', taskId: '1', groupId: 'g1', parentInstanceId: null, childInstanceIds: ['1.1', '1.2[0]'] },
      '1.1': { id: '1.1', taskId: '1.1', groupId: 'g1', parentInstanceId: '1', childInstanceIds: [] },
      '1.2[0]': { id: '1.2[0]', taskId: '1.2', groupId: 'g1.2.0', parentInstanceId: '1', childInstanceIds: ['1.2.1[0]', '1.2.2[0]', '1.2.3[0]'] },
      '1.2.1[0]': { id: '1.2.1[0]', taskId: '1.2.1', groupId: 'g1.2.0', parentInstanceId: '1.2[0]', childInstanceIds: [] },
      '1.2.2[0]': { id: '1.2.2[0]', taskId: '1.2.2', groupId: 'g1.2.0', parentInstanceId: '1.2[0]', childInstanceIds: [] },
      '1.2.3[0]': { id: '1.2.3[0]', taskId: '1.2.3', groupId: 'g1.2.0', parentInstanceId: '1.2[0]', childInstanceIds: ['1.2.3.1[0]'] },
      '1.2.3.1[0]': { id: '1.2.3.1[0]', taskId: '1.2.3.1', groupId: 'g1.2.0', parentInstanceId: '1.2.3[0]', childInstanceIds: [] },
      '2': { id: '2', taskId: '2', groupId: 'g2', parentInstanceId: null, childInstanceIds: [] },
      '99': { id: '99', taskId: '99', groupId: 'g99', parentInstanceId: null, childInstanceIds: [] },
    }

    const answers: Record<string, Answer> = {
      '19': answer('Projectnaam'),
      '18': answer('Een korte samenvatting'),
      '1.1': answer('Antwoord 1.1'),
      '1.2.1[0]': answer('Pipe | hier\nmet newline'),
      '1.2.2[0]': answer(img),
      '1.2.3.1[0]': answer('Subantwoord'),
      // section 2 instance "2": image answer → formatAnswerValue → formatImageValue
      '2': answer({ data: 'data:image/png;base64,sec2', title: 'Sectie 2 beeld' } as ImageValue),
    }

    const setup = seed(FormType.DPIA, tasks, ['19', '18', '1', '2', '99'], instances, answers)
    const md = await runExport(setup)

    // Header + form type DPIA
    expect(md).toContain('# DPIA')
    expect(md).toContain('*Gegenereerd op ')
    expect(md).toContain('---')

    // Metadata section heading (level 2) + its description in italics
    expect(md).toContain('## Metadata')
    expect(md).toContain('*Algemene gegevens*')
    expect(md).toContain('Projectnaam')

    // Management summary heading present, but NO description line (no description field)
    expect(md).toContain('## Managementsamenvatting')

    // Official sections are numbered starting at 1; signing (#99) is excluded.
    expect(md).toContain('## 1. Sectie een') // HTML stripped from "Sectie <b>een</b>"
    expect(md).toContain('*Beschrijving sectie 1*')
    expect(md).toContain('## 2. Sectie twee')
    expect(md).not.toContain('Ondertekening')

    // task_group child headings (heading level capped at 6)
    expect(md).toContain('Veld 1.1')
    expect(md).toContain('Antwoord 1.1')

    // Repeatable instance label bolded
    expect(md).toContain('**Item**')

    // Table rendering with pipe + newline escaping
    expect(md).toContain('| Vraag | Antwoord |')
    expect(md).toContain('|---|---|')
    expect(md).toContain('Pipe \\| hier met newline')

    // Image rendered with title, ref link, description and source
    expect(md).toContain('**Diagram [1]**')
    expect(md).toContain('![Diagram \\[1\\]][img-1]')
    expect(md).toContain('[img-1]: data:image/png;base64,abc')
    expect(md).toContain('*Een schema*')
    expect(md).toContain('*Bron: bron.png*')

    // Nested complex child answer present
    expect(md).toContain('Subantwoord')

    // Section 2 (task_group without children) renders an image answer via
    // formatAnswerValue → formatImageValue.
    expect(md).toContain('**Sectie 2 beeld**')
    expect(md).toContain(': data:image/png;base64,sec2')
  })

  // -------------------------------------------------------------------------
  // DPIA branch where the metadata/summary tasks are ABSENT (false branches of
  // the two `if` guards in buildDpiaSections) and there are no official tasks.
  // -------------------------------------------------------------------------
  it('handles a DPIA without metadata, summary or official sections', async () => {
    const tasks: Record<string, FlatTask> = {
      '5': {
        id: '5', task: 'Niet-officieel', type: ['task_group'],
        parentId: null, childrenIds: [],
        is_official_id: false,
      },
    }
    const instances: Record<string, TaskInstance> = {
      '5': { id: '5', taskId: '5', groupId: 'g5', parentInstanceId: null, childInstanceIds: [] },
    }
    const setup = seed(FormType.DPIA, tasks, ['5'], instances, {})
    const md = await runExport(setup)

    expect(md).toContain('# DPIA')
    // No metadata/summary/official headings produced.
    expect(md).not.toContain('## Metadata')
    expect(md).not.toContain('## 1.')
  })

  // -------------------------------------------------------------------------
  // Pre-scan branch: every root task numbered. Also exercises the default
  // filename path (no filename argument) which calls generateFilename.
  // -------------------------------------------------------------------------
  it('exports a Pre-scan document with numbered sections and default filename', async () => {
    const tasks: Record<string, FlatTask> = {
      '0': {
        id: '0', task: 'Pre-scan sectie', type: ['task_group'],
        parentId: null, childrenIds: ['0.1'],
      },
      '0.1': {
        id: '0.1', task: 'Vraag', type: ['select_option'],
        parentId: '0', childrenIds: [],
      },
    }
    const instances: Record<string, TaskInstance> = {
      '0': { id: '0', taskId: '0', groupId: 'g0', parentInstanceId: null, childInstanceIds: ['0.1'] },
      '0.1': { id: '0.1', taskId: '0.1', groupId: 'g0', parentInstanceId: '0', childInstanceIds: [] },
    }
    const answers: Record<string, Answer> = {
      '0.1': answer(['Keuze A', '', null as unknown as string, 'Keuze B']),
    }
    const setup = seed(FormType.PRE_SCAN, tasks, ['0'], instances, answers)

    let downloadName = ''
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob: Blob) => {
      void blob
      return 'blob:mock'
    })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const createSpy = vi.spyOn(document, 'createElement')
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    await exportToMarkdown(setup.taskStore, setup.answerStore)

    // The anchor element should have a generated .download name with .md extension.
    const anchorCall = createSpy.mock.results.find(
      (r) => r.value instanceof HTMLAnchorElement,
    )
    downloadName = (anchorCall!.value as HTMLAnchorElement).download
    expect(downloadName).toMatch(/^prescan_.*\.md$/)
  })

  it('exports a Pre-scan document and renders array/boolean/null answer values', async () => {
    const tasks: Record<string, FlatTask> = {
      '0': {
        id: '0', task: 'Antwoordtypes', type: ['task_group'],
        parentId: null, childrenIds: ['0.1', '0.2', '0.3', '0.4', '0.5', '0.6'],
      },
      '0.1': { id: '0.1', task: 'Lijst', type: ['select_option'], parentId: '0', childrenIds: [] },
      '0.2': { id: '0.2', task: 'Ja', type: ['radio_option'], parentId: '0', childrenIds: [] },
      '0.3': { id: '0.3', task: 'Nee', type: ['radio_option'], parentId: '0', childrenIds: [] },
      '0.4': { id: '0.4', task: 'Stringnull', type: ['text_input'], parentId: '0', childrenIds: [] },
      '0.5': { id: '0.5', task: 'Lege lijst', type: ['select_option'], parentId: '0', childrenIds: [] },
      '0.6': { id: '0.6', task: 'Gewoon', type: ['text_input'], parentId: '0', childrenIds: [] },
    }
    const instances: Record<string, TaskInstance> = {
      '0': { id: '0', taskId: '0', groupId: 'g0', parentInstanceId: null, childInstanceIds: ['0.1', '0.2', '0.3', '0.4', '0.5', '0.6'] },
      '0.1': { id: '0.1', taskId: '0.1', groupId: 'g0', parentInstanceId: '0', childInstanceIds: [] },
      '0.2': { id: '0.2', taskId: '0.2', groupId: 'g0', parentInstanceId: '0', childInstanceIds: [] },
      '0.3': { id: '0.3', taskId: '0.3', groupId: 'g0', parentInstanceId: '0', childInstanceIds: [] },
      '0.4': { id: '0.4', taskId: '0.4', groupId: 'g0', parentInstanceId: '0', childInstanceIds: [] },
      '0.5': { id: '0.5', taskId: '0.5', groupId: 'g0', parentInstanceId: '0', childInstanceIds: [] },
      '0.6': { id: '0.6', taskId: '0.6', groupId: 'g0', parentInstanceId: '0', childInstanceIds: [] },
    }
    const answers: Record<string, Answer> = {
      '0.1': answer(['Keuze A', 'Keuze B']), // non-empty array → bullet list
      '0.2': answer('true'), // → Ja
      '0.3': answer('false'), // → Nee
      '0.4': answer('null'), // literal string 'null' → Niet ingevuld
      '0.5': answer([] as string[]), // empty array → Niet ingevuld
      '0.6': answer('Vrije tekst'), // plain string → String(value)
    }
    const setup = seed(FormType.PRE_SCAN, tasks, ['0'], instances, answers)
    const md = await runExport(setup, 'eigen-naam.md')

    expect(md).toContain('# Pre-scan DPIA')
    expect(md).toContain('- Keuze A')
    expect(md).toContain('- Keuze B')
    expect(md).toContain('Ja')
    expect(md).toContain('Nee')
    expect(md).toContain('*Niet ingevuld*')
    expect(md).toContain('Vrije tekst')
  })

  // -------------------------------------------------------------------------
  // processTaskWithInstances: instance mapping branch (hasInstanceMapping true)
  // plus the early return when no instances exist, plus shouldShowTask=false to
  // hide both a group instance and an individual child field, plus an image
  // without title/description/source (formatImageValue false branches), plus a
  // simple task answer (formatAnswerValue via simple-task path) hidden by deps.
  // -------------------------------------------------------------------------
  it('handles instance mapping, hidden tasks, empty instance lists and bare images', async () => {
    const bareImg: ImageValue = { data: 'data:image/jpeg;base64,xyz' } // no title/desc/source

    const tasks: Record<string, FlatTask> = {
      // Root official section grouping mapped + dependency-gated children.
      '3': {
        id: '3', task: 'Sectie drie', type: ['task_group'],
        parentId: null, childrenIds: ['3.1', '3.2', '3.3', '3.4'],
        is_official_id: true,
      },
      // child with instance_mapping dependency → mapping branch
      '3.1': {
        id: '3.1', task: 'Gemapte groep', type: ['task_group'],
        parentId: '3', childrenIds: ['3.1.1'],
        dependencies: [{ type: 'instance_mapping', action: 'create_instances' }],
      },
      '3.1.1': {
        id: '3.1.1', task: 'Gemapt veld', type: ['text_input'],
        parentId: '3.1', childrenIds: [],
      },
      // simple child task with NO instances → early return (instanceIds.length === 0)
      '3.2': {
        id: '3.2', task: 'Leeg veld', type: ['text_input'],
        parentId: '3', childrenIds: [],
      },
      // group child gated by a 'show' conditional that is NOT met → whole instance skipped
      '3.3': {
        id: '3.3', task: 'Verborgen groep', type: ['task_group'],
        parentId: '3', childrenIds: ['3.3.1'],
        dependencies: [
          { type: 'conditional', action: 'show', condition: { id: '3.flag', operator: 'equals', value: 'ja' } },
        ],
      },
      '3.3.1': {
        id: '3.3.1', task: 'Onbereikbaar', type: ['text_input'],
        parentId: '3.3', childrenIds: [],
      },
      // group child whose table-field child is hidden by a failing condition, and
      // which also contains a bare image (no title) → image-only block, no table.
      '3.4': {
        id: '3.4', task: 'Beeldgroep', type: ['task_group'],
        parentId: '3', childrenIds: ['3.4.1', '3.4.2'],
      },
      // hidden simple field (condition not met) → continue inside the table loop
      '3.4.1': {
        id: '3.4.1', task: 'Verborgen veld', type: ['text_input'],
        parentId: '3.4', childrenIds: [],
        dependencies: [
          { type: 'conditional', action: 'show', condition: { id: '3.4.flag', operator: 'equals', value: 'ja' } },
        ],
      },
      '3.4.2': {
        id: '3.4.2', task: 'Bare image', type: ['image'],
        parentId: '3.4', childrenIds: [],
      },
    }

    const instances: Record<string, TaskInstance> = {
      '3': { id: '3', taskId: '3', groupId: 'g3', parentInstanceId: null, childInstanceIds: ['3.1[0]', '3.4[0]'] },
      // mapped instance: mappedFromInstanceId points at parent '3'
      '3.1[0]': { id: '3.1[0]', taskId: '3.1', groupId: 'g3.1', parentInstanceId: '3', mappedFromInstanceId: '3', childInstanceIds: ['3.1.1[0]'] },
      '3.1.1[0]': { id: '3.1.1[0]', taskId: '3.1.1', groupId: 'g3.1', parentInstanceId: '3.1[0]', childInstanceIds: [] },
      // 3.2 has NO instance → triggers early return
      // 3.3 instance present but condition not met → instance skipped
      '3.3[0]': { id: '3.3[0]', taskId: '3.3', groupId: 'g3.3', parentInstanceId: '3', childInstanceIds: ['3.3.1[0]'] },
      '3.3.1[0]': { id: '3.3.1[0]', taskId: '3.3.1', groupId: 'g3.3', parentInstanceId: '3.3[0]', childInstanceIds: [] },
      // condition source for 3.3 (same group g3.3) with a non-matching value → hidden
      '3.flag': { id: '3.flag', taskId: '3.flag', groupId: 'g3.3', parentInstanceId: '3.3[0]', childInstanceIds: [] },
      '3.4[0]': { id: '3.4[0]', taskId: '3.4', groupId: 'g3.4', parentInstanceId: '3', childInstanceIds: ['3.4.1[0]', '3.4.2[0]'] },
      '3.4.1[0]': { id: '3.4.1[0]', taskId: '3.4.1', groupId: 'g3.4', parentInstanceId: '3.4[0]', childInstanceIds: [] },
      '3.4.2[0]': { id: '3.4.2[0]', taskId: '3.4.2', groupId: 'g3.4', parentInstanceId: '3.4[0]', childInstanceIds: [] },
      // condition source for 3.4.1 (same group g3.4) with a non-matching value → field hidden
      '3.4.flag': { id: '3.4.flag', taskId: '3.4.flag', groupId: 'g3.4', parentInstanceId: '3.4[0]', childInstanceIds: [] },
    }

    const answers: Record<string, Answer> = {
      '3.1.1[0]': answer('Gemapte waarde'),
      '3.flag': answer('nee'), // != 'ja' → conditionMet false → group 3.3 hidden
      '3.4.flag': answer('nee'), // != 'ja' → conditionMet false → field 3.4.1 hidden
      '3.4.2[0]': answer(bareImg),
    }

    const setup = seed(FormType.DPIA, tasks, ['3'], instances, answers)
    const md = await runExport(setup)

    // Mapped child rendered (mapping branch produced its instance).
    expect(md).toContain('Gemapte waarde')

    // Hidden conditional group never renders its child.
    expect(md).not.toContain('Onbereikbaar')

    // Hidden table field is suppressed; with no visible table fields there is
    // no table header for the image group.
    expect(md).not.toContain('Verborgen veld')

    // Bare image: no bold title line, alt text falls back to 'Afbeelding'.
    expect(md).toContain('![Afbeelding][img-1]')
    expect(md).toContain('[img-1]: data:image/jpeg;base64,xyz')

    // 3.2 has a child heading but, having no instances, the early return means
    // no answer content (no *Niet ingevuld*) follows beneath it.
    expect(md).toContain('### Leeg veld')
    expect(md).toMatch(/### Leeg veld\n\n### Verborgen groep/)
  })

  // -------------------------------------------------------------------------
  // The instance_mapping branch fires only when processTaskWithInstances is
  // entered with a non-null parentInstanceId AND the task hasInstanceMapping.
  // That only happens through the recursion for a complex (has-children) child.
  // -------------------------------------------------------------------------
  it('resolves nested mapped instances via the instance_mapping branch', async () => {
    const tasks: Record<string, FlatTask> = {
      '6': {
        id: '6', task: 'Sectie zes', type: ['task_group'],
        parentId: null, childrenIds: ['6.1'],
        is_official_id: true,
      },
      // outer group child (rendered with parentInstanceId=null)
      '6.1': {
        id: '6.1', task: 'Buitengroep', type: ['task_group'],
        parentId: '6', childrenIds: ['6.1.1'],
      },
      // complex child WITH instance_mapping → recursion enters mapping branch
      '6.1.1': {
        id: '6.1.1', task: 'Gemapte subgroep', type: ['task_group'],
        parentId: '6.1', childrenIds: ['6.1.1.1'],
        dependencies: [{ type: 'instance_mapping', action: 'create_instances' }],
      },
      '6.1.1.1': {
        id: '6.1.1.1', task: 'Diep veld', type: ['text_input'],
        parentId: '6.1.1', childrenIds: [],
      },
    }
    const instances: Record<string, TaskInstance> = {
      '6': { id: '6', taskId: '6', groupId: 'g6', parentInstanceId: null, childInstanceIds: ['6.1[0]'] },
      '6.1[0]': { id: '6.1[0]', taskId: '6.1', groupId: 'g6.1', parentInstanceId: '6', childInstanceIds: ['6.1.1[0]'] },
      // mapped from its parent instance '6.1[0]'
      '6.1.1[0]': { id: '6.1.1[0]', taskId: '6.1.1', groupId: 'g6.1', parentInstanceId: '6.1[0]', mappedFromInstanceId: '6.1[0]', childInstanceIds: ['6.1.1.1[0]'] },
      '6.1.1.1[0]': { id: '6.1.1.1[0]', taskId: '6.1.1.1', groupId: 'g6.1', parentInstanceId: '6.1.1[0]', childInstanceIds: [] },
    }
    const answers: Record<string, Answer> = {
      '6.1.1.1[0]': answer('Diepe waarde'),
    }
    const setup = seed(FormType.DPIA, tasks, ['6'], instances, answers)
    const md = await runExport(setup)

    expect(md).toContain('## 1. Sectie zes')
    expect(md).toContain('Diepe waarde')
  })

  // -------------------------------------------------------------------------
  // processTaskWithInstances simple-task path with a VISIBLE shouldShowTask and
  // a non-mapping, parent-scoped getInstanceIdsForTask(task.id, parentInstanceId)
  // call, plus a child group whose simple field is shown (table rendered).
  // -------------------------------------------------------------------------
  it('renders a visible simple repeatable field and a visible table field', async () => {
    const tasks: Record<string, FlatTask> = {
      '4': {
        id: '4', task: 'Sectie vier', type: ['task_group'],
        parentId: null, childrenIds: ['4.1', '4.2', '4.3'],
        is_official_id: true,
      },
      // simple repeatable child (no children) → simple-task path with shown instance
      '4.1': {
        id: '4.1', task: 'Simpel herhaalbaar', type: ['text_input'],
        parentId: '4', childrenIds: [],
        repeatable: true,
      },
      // group child with a visible simple field → table rendered
      '4.2': {
        id: '4.2', task: 'Tabelgroep', type: ['task_group'],
        parentId: '4', childrenIds: ['4.2.1'],
      },
      '4.2.1': {
        id: '4.2.1', task: 'Zichtbaar veld', type: ['text_input'],
        parentId: '4.2', childrenIds: [],
      },
      // simple child gated by a 'show' conditional NOT met → false side of
      // shouldShowTask in the simple-task path.
      '4.3': {
        id: '4.3', task: 'Verborgen simpel', type: ['text_input'],
        parentId: '4', childrenIds: [],
        dependencies: [
          { type: 'conditional', action: 'show', condition: { id: '4.flag', operator: 'equals', value: 'ja' } },
        ],
      },
    }
    const instances: Record<string, TaskInstance> = {
      '4': { id: '4', taskId: '4', groupId: 'g4', parentInstanceId: null, childInstanceIds: ['4.1[0]', '4.1[1]', '4.2[0]', '4.3'] },
      '4.1[0]': { id: '4.1[0]', taskId: '4.1', groupId: 'g4', parentInstanceId: '4', childInstanceIds: [] },
      '4.1[1]': { id: '4.1[1]', taskId: '4.1', groupId: 'g4', parentInstanceId: '4', childInstanceIds: [] },
      '4.2[0]': { id: '4.2[0]', taskId: '4.2', groupId: 'g4.2', parentInstanceId: '4', childInstanceIds: ['4.2.1[0]'] },
      '4.2.1[0]': { id: '4.2.1[0]', taskId: '4.2.1', groupId: 'g4.2', parentInstanceId: '4.2[0]', childInstanceIds: [] },
      '4.3': { id: '4.3', taskId: '4.3', groupId: 'g4.3', parentInstanceId: '4', childInstanceIds: [] },
      // condition source for 4.3 (same group g4.3) with a non-matching value → hidden
      '4.flag': { id: '4.flag', taskId: '4.flag', groupId: 'g4.3', parentInstanceId: '4', childInstanceIds: [] },
    }
    const answers: Record<string, Answer> = {
      '4.1[0]': answer('Eerste'),
      '4.3': answer('Mag niet zichtbaar zijn'),
      '4.flag': answer('nee'),
      '4.1[1]': answer('Tweede'),
      '4.2.1[0]': answer('Tabelwaarde'),
    }
    const setup = seed(FormType.DPIA, tasks, ['4'], instances, answers)
    const md = await runExport(setup)

    expect(md).toContain('Eerste')
    expect(md).toContain('Tweede')
    expect(md).toContain('| Vraag | Antwoord |')
    expect(md).toContain('Tabelwaarde')
    // Hidden simple field is suppressed by shouldShowTask=false.
    expect(md).not.toContain('Mag niet zichtbaar zijn')
  })

  // -------------------------------------------------------------------------
  // buildAnswerContent guards: a non task_group section (left side of && false)
  // and a task_group section whose childrenIds is undefined (right side false).
  // -------------------------------------------------------------------------
  it('handles a non task_group section (else branch)', async () => {
    const tasks: Record<string, FlatTask> = {
      '7': {
        id: '7', task: 'Open tekst sectie', type: ['open_text'],
        parentId: null, childrenIds: [],
        is_official_id: true,
      },
    }
    const instances: Record<string, TaskInstance> = {
      '7': { id: '7', taskId: '7', groupId: 'g7', parentInstanceId: null, childInstanceIds: [] },
    }
    const answers: Record<string, Answer> = {
      '7': answer('Een waarde'),
    }
    const setup = seed(FormType.DPIA, tasks, ['7'], instances, answers)
    const md = await runExport(setup)

    expect(md).toContain('## 1. Open tekst sectie')
    expect(md).toContain('Een waarde')
  })

  it('handles a task_group section whose childrenIds is undefined', async () => {
    const tasks: Record<string, FlatTask> = {
      '8': {
        id: '8', task: 'Groep zonder kinderen', type: ['task_group'],
        parentId: null,
        childrenIds: undefined as unknown as string[],
        is_official_id: true,
      },
    }
    const instances: Record<string, TaskInstance> = {
      '8': { id: '8', taskId: '8', groupId: 'g8', parentInstanceId: null, childInstanceIds: [] },
    }
    const setup = seed(FormType.DPIA, tasks, ['8'], instances, {})
    const md = await runExport(setup)

    // task_group with undefined childrenIds → else-branch → no answer → niet ingevuld
    expect(md).toContain('## 1. Groep zonder kinderen')
    expect(md).toContain('*Niet ingevuld*')
  })
})

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTaskStore, type FlatTask, type TaskInstance } from '../../src/stores/tasks'
import { useAnswerStore, type Answer, type ImageValue, type AnswerValue } from '../../src/stores/answers'
import { exportToMarkdown } from '../../src/utils/markdownExport'
import { FormType } from '../../src/models/dpia'

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

// Capture the markdown by intercepting the Blob exportToMarkdown passes to
// URL.createObjectURL; blob.text() is async so capture it as a promise.
async function runExport(setup: StoreSetup, filename?: string): Promise<string> {
  let captured = ''
  const createSpy = vi
    .spyOn(URL, 'createObjectURL')
    .mockImplementation((blob: Blob) => {
      void blob
      return 'blob:mock'
    })
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

  it('exports a full DPIA document covering metadata, summary and official sections', async () => {
    const img: ImageValue = {
      data: 'data:image/png;base64,abc',
      title: 'Diagram [1]',
      description: 'Een schema',
      source: 'bron.png',
    }

    const tasks: Record<string, FlatTask> = {
      '19': {
        id: '19', task: 'Metadata', type: ['text_input'],
        parentId: null, childrenIds: [],
        description: 'Algemene gegevens',
      },
      '18': {
        id: '18', task: 'Managementsamenvatting', type: ['text_input'],
        parentId: null, childrenIds: [],
      },
      '1': {
        id: '1', task: 'Sectie <b>een</b>', type: ['task_group'],
        parentId: null, childrenIds: ['1.1', '1.2'],
        is_official_id: true,
        description: 'Beschrijving sectie 1',
      },
      '1.1': {
        id: '1.1', task: 'Veld 1.1', type: ['text_input'],
        parentId: '1', childrenIds: [],
      },
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
      '1.2.3': {
        id: '1.2.3', task: 'Subgroep', type: ['task_group'],
        parentId: '1.2', childrenIds: ['1.2.3.1'],
      },
      '1.2.3.1': {
        id: '1.2.3.1', task: 'Subveld', type: ['text_input'],
        parentId: '1.2.3', childrenIds: [],
      },
      '2': {
        id: '2', task: 'Sectie twee', type: ['task_group'],
        parentId: null, childrenIds: [],
        is_official_id: true,
      },
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
      '2': answer({ data: 'data:image/png;base64,sec2', title: 'Sectie 2 beeld' } as ImageValue),
    }

    const setup = seed(FormType.DPIA, tasks, ['19', '18', '1', '2', '99'], instances, answers)
    const md = await runExport(setup)

    expect(md).toContain('# DPIA')
    expect(md).toContain('*Gegenereerd op ')
    expect(md).toContain('---')

    expect(md).toContain('## Metadata')
    expect(md).toContain('*Algemene gegevens*')
    expect(md).toContain('Projectnaam')

    expect(md).toContain('## Managementsamenvatting')

    expect(md).toContain('## 1. Sectie een') // HTML stripped from "Sectie <b>een</b>"
    expect(md).toContain('*Beschrijving sectie 1*')
    expect(md).toContain('## 2. Sectie twee')
    expect(md).not.toContain('Ondertekening')

    expect(md).toContain('Veld 1.1')
    expect(md).toContain('Antwoord 1.1')

    expect(md).toContain('**Item**')

    expect(md).toContain('| Vraag | Antwoord |')
    expect(md).toContain('|---|---|')
    expect(md).toContain('Pipe \\| hier met newline')

    expect(md).toContain('**Diagram [1]**')
    expect(md).toContain('![Diagram \\[1\\]][img-1]')
    expect(md).toContain('[img-1]: data:image/png;base64,abc')
    expect(md).toContain('*Een schema*')
    expect(md).toContain('*Bron: bron.png*')

    expect(md).toContain('Subantwoord')

    expect(md).toContain('**Sectie 2 beeld**')
    expect(md).toContain(': data:image/png;base64,sec2')
  })

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
    expect(md).not.toContain('## Metadata')
    expect(md).not.toContain('## 1.')
  })

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
      '0.1': answer(['Keuze A', 'Keuze B']),
      '0.2': answer('true'),
      '0.3': answer('false'),
      '0.4': answer('null'),
      '0.5': answer([] as string[]),
      '0.6': answer('Vrije tekst'),
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

  it('handles instance mapping, hidden tasks, empty instance lists and bare images', async () => {
    const bareImg: ImageValue = { data: 'data:image/jpeg;base64,xyz' }

    const tasks: Record<string, FlatTask> = {
      '3': {
        id: '3', task: 'Sectie drie', type: ['task_group'],
        parentId: null, childrenIds: ['3.1', '3.2', '3.3', '3.4'],
        is_official_id: true,
      },
      '3.1': {
        id: '3.1', task: 'Gemapte groep', type: ['task_group'],
        parentId: '3', childrenIds: ['3.1.1'],
        dependencies: [{ type: 'instance_mapping', action: 'create_instances' }],
      },
      '3.1.1': {
        id: '3.1.1', task: 'Gemapt veld', type: ['text_input'],
        parentId: '3.1', childrenIds: [],
      },
      // 3.2 deliberately has no instance below, exercising the empty-instance early return
      '3.2': {
        id: '3.2', task: 'Leeg veld', type: ['text_input'],
        parentId: '3', childrenIds: [],
      },
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
      '3.4': {
        id: '3.4', task: 'Beeldgroep', type: ['task_group'],
        parentId: '3', childrenIds: ['3.4.1', '3.4.2'],
      },
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
      '3.1[0]': { id: '3.1[0]', taskId: '3.1', groupId: 'g3.1', parentInstanceId: '3', mappedFromInstanceId: '3', childInstanceIds: ['3.1.1[0]'] },
      '3.1.1[0]': { id: '3.1.1[0]', taskId: '3.1.1', groupId: 'g3.1', parentInstanceId: '3.1[0]', childInstanceIds: [] },
      '3.3[0]': { id: '3.3[0]', taskId: '3.3', groupId: 'g3.3', parentInstanceId: '3', childInstanceIds: ['3.3.1[0]'] },
      '3.3.1[0]': { id: '3.3.1[0]', taskId: '3.3.1', groupId: 'g3.3', parentInstanceId: '3.3[0]', childInstanceIds: [] },
      '3.flag': { id: '3.flag', taskId: '3.flag', groupId: 'g3.3', parentInstanceId: '3.3[0]', childInstanceIds: [] },
      '3.4[0]': { id: '3.4[0]', taskId: '3.4', groupId: 'g3.4', parentInstanceId: '3', childInstanceIds: ['3.4.1[0]', '3.4.2[0]'] },
      '3.4.1[0]': { id: '3.4.1[0]', taskId: '3.4.1', groupId: 'g3.4', parentInstanceId: '3.4[0]', childInstanceIds: [] },
      '3.4.2[0]': { id: '3.4.2[0]', taskId: '3.4.2', groupId: 'g3.4', parentInstanceId: '3.4[0]', childInstanceIds: [] },
      '3.4.flag': { id: '3.4.flag', taskId: '3.4.flag', groupId: 'g3.4', parentInstanceId: '3.4[0]', childInstanceIds: [] },
    }

    const answers: Record<string, Answer> = {
      '3.1.1[0]': answer('Gemapte waarde'),
      '3.flag': answer('nee'),
      '3.4.flag': answer('nee'),
      '3.4.2[0]': answer(bareImg),
    }

    const setup = seed(FormType.DPIA, tasks, ['3'], instances, answers)
    const md = await runExport(setup)

    expect(md).toContain('Gemapte waarde')

    expect(md).not.toContain('Onbereikbaar')

    expect(md).not.toContain('Verborgen veld')

    expect(md).toContain('![Afbeelding][img-1]')
    expect(md).toContain('[img-1]: data:image/jpeg;base64,xyz')

    expect(md).toContain('### Leeg veld')
    expect(md).toMatch(/### Leeg veld\n\n### Verborgen groep/)
  })

  it('resolves nested mapped instances via the instance_mapping branch', async () => {
    const tasks: Record<string, FlatTask> = {
      '6': {
        id: '6', task: 'Sectie zes', type: ['task_group'],
        parentId: null, childrenIds: ['6.1'],
        is_official_id: true,
      },
      '6.1': {
        id: '6.1', task: 'Buitengroep', type: ['task_group'],
        parentId: '6', childrenIds: ['6.1.1'],
      },
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

  it('renders a visible simple repeatable field and a visible table field', async () => {
    const tasks: Record<string, FlatTask> = {
      '4': {
        id: '4', task: 'Sectie vier', type: ['task_group'],
        parentId: null, childrenIds: ['4.1', '4.2', '4.3'],
        is_official_id: true,
      },
      '4.1': {
        id: '4.1', task: 'Simpel herhaalbaar', type: ['text_input'],
        parentId: '4', childrenIds: [],
        repeatable: true,
      },
      '4.2': {
        id: '4.2', task: 'Tabelgroep', type: ['task_group'],
        parentId: '4', childrenIds: ['4.2.1'],
      },
      '4.2.1': {
        id: '4.2.1', task: 'Zichtbaar veld', type: ['text_input'],
        parentId: '4.2', childrenIds: [],
      },
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
    expect(md).not.toContain('Mag niet zichtbaar zijn')
  })

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

    expect(md).toContain('## 1. Groep zonder kinderen')
    expect(md).toContain('*Niet ingevuld*')
  })
})

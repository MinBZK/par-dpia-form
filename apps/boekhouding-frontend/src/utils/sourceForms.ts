import {
  FormType,
  REFERENCE_KEY,
  applyStateToStores,
  rebuildRepeatableInstances,
  useAnswerStore,
  useSchemaStore,
  useTaskStore,
  type GroupedAnswerValue,
} from '@overheid-assessment/core'
import { assessments as assessmentsApi, type AssessmentInstance } from '../api'
import { normalizeServerState } from './normalizeServerState'

const NAMESPACE_BY_TYPE: Record<AssessmentInstance['assessmentType'], FormType> = {
  prescan: FormType.PRE_SCAN,
  dpia: FormType.DPIA,
  iama: FormType.IAMA,
  aiia: FormType.AIIA,
}

// Upper bound of the backend's project assessment list (LIST_PAGE.maxSize).
const LIST_PAGE_SIZE = 500

interface TaskTree {
  references?: Record<string, unknown>
  tasks?: TaskTree[]
}

// True when any task in the tree declares a reference under `key`.
function declaresReferencesTo(tasks: TaskTree[], key: string): boolean {
  return tasks.some((task) =>
    Array.isArray(task.references?.[key]) || declaresReferencesTo(task.tasks ?? [], key),
  )
}

/**
 * The forms whose answers the active form can show: every other form whose
 * schema declares a reference to it. A DPIA keeps reading pre-scan answers
 * from its own `_prescanAnswers` snapshot; loading a live pre-scan as well
 * would make ApiPersistence write that pre-scan into the snapshot on save.
 */
export function referencingForms(activeNamespace: FormType): FormType[] {
  const key = REFERENCE_KEY[activeNamespace]
  if (!key) return []
  const schemaStore = useSchemaStore()
  return Object.values(FormType).filter((namespace) => {
    if (namespace === activeNamespace) return false
    if (activeNamespace === FormType.DPIA && namespace === FormType.PRE_SCAN) return false
    const schema = schemaStore.getSchema(namespace)
    return !!schema && declaresReferencesTo(schema.tasks, key)
  })
}

/**
 * Per wanted form, the assessment to read: the most recently updated one in
 * the project. The list endpoint already orders by updatedAt (newest first),
 * so the first hit per type wins.
 */
export function pickSourceAssessments(
  currentId: string,
  wanted: FormType[],
  candidates: Pick<AssessmentInstance, 'id' | 'assessmentType'>[],
): Map<FormType, string> {
  const picked = new Map<FormType, string>()
  for (const candidate of candidates) {
    const namespace = NAMESPACE_BY_TYPE[candidate.assessmentType]
    if (candidate.id === currentId || !wanted.includes(namespace)) continue
    if (!picked.has(namespace)) picked.set(namespace, candidate.id)
  }
  return picked
}

/**
 * Load the answers of the project's other assessments into their own
 * namespaces, so references from those forms resolve inside the active form:
 * pre-view references show them as context, pre-fill references copy them
 * into an empty field (FormField). ApiPersistence only saves the active
 * namespace, so the source assessments themselves are never written.
 *
 * Failures are logged and skipped: the source answers only add context to
 * the form, and the active assessment must open regardless.
 */
export async function loadSourceForms(current: AssessmentInstance): Promise<void> {
  const taskStore = useTaskStore()
  const answerStore = useAnswerStore()
  const schemaStore = useSchemaStore()

  const activeNamespace = taskStore.activeNamespace
  const wanted = referencingForms(activeNamespace)
  if (wanted.length === 0) return

  let candidates: AssessmentInstance[]
  try {
    candidates = (await assessmentsApi.list(current.projectId, 1, LIST_PAGE_SIZE)).items
  } catch (error) {
    console.warn('Kon de andere assessments in het project niet ophalen:', error)
    return
  }

  const sources = pickSourceAssessments(current.id, wanted, candidates)
  const loaded = await Promise.all(
    Array.from(sources, async ([namespace, id]) => {
      try {
        return { namespace, form: await assessmentsApi.get(id) }
      } catch (error) {
        console.warn(`Kon assessment ${id} (${namespace}) niet laden:`, error)
        return null
      }
    }),
  )

  try {
    for (const entry of loaded) {
      if (!entry) continue
      const { namespace, form } = entry
      // referencingForms only returns namespaces with a loaded schema.
      const schema = schemaStore.getSchema(namespace)!
      if (!(form.state as { metadata?: unknown } | undefined)?.metadata) continue
      if (taskStore.isInitialized[namespace]) continue
      const state = normalizeServerState(form.state, namespace)

      taskStore.setActiveNamespace(namespace)
      answerStore.setActiveNamespace(namespace)
      taskStore.init(schema.tasks)
      applyStateToStores(state, taskStore, answerStore)
      rebuildRepeatableInstances(
        taskStore,
        answerStore,
        state.answers as Record<string, GroupedAnswerValue>,
      )
    }
  } finally {
    taskStore.setActiveNamespace(activeNamespace)
    answerStore.setActiveNamespace(activeNamespace)
  }
}

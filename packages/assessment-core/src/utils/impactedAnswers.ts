import { parseInstanceId, type TaskStoreType, type FlatTask } from '../stores/tasks'
import type { AnswerStoreType, AnswerValue } from '../stores/answers'
import { normalizeValue, shouldShowTask } from './dependency'
import { getPlainTextWithoutDefinitions } from './stripHtml'

export type ImpactReason = 'sync_cascade' | 'conditional_hidden'

export interface ImpactedAnswer {
  /** Full instance id, e.g. "6.1.1.1[2]" */
  instanceId: string
  /** Task id without index, e.g. "6.1.1.1" */
  taskId: string
  /** Current stored answer value (never null — only entries with a value are reported). */
  value: AnswerValue
  /** Why this answer is impacted. */
  reason: ImpactReason
}

export interface ImpactSummary {
  total: number
  /** Breakdown per root section (e.g. "6") for dialog display. */
  bySection: Array<{
    sectionId: string
    sectionLabel: string
    count: number
    fieldNames: string[]
  }>
}

function hasValue(value: AnswerValue | null | undefined): boolean {
  if (value == null) return false
  if (typeof value === 'string') return value !== ''
  if (Array.isArray(value)) return value.length > 0
  return true
}

function rootSectionOf(taskId: string): string {
  return taskId.split('.')[0]
}

function sectionLabel(sectionId: string, taskStore: TaskStoreType): string {
  try {
    const task = taskStore.taskById(sectionId)
    return getPlainTextWithoutDefinitions(task.task)
  } catch {
    return sectionId
  }
}

function fieldName(taskId: string, taskStore: TaskStoreType): string {
  try {
    const task = taskStore.taskById(taskId)
    return getPlainTextWithoutDefinitions(task.task)
  } catch {
    return taskId
  }
}

/**
 * Summarise impacted answers grouped per root section, for warning dialogs.
 */
export function summariseImpact(
  items: ImpactedAnswer[],
  taskStore: TaskStoreType,
): ImpactSummary {
  const grouped = new Map<string, { label: string; fields: string[] }>()
  for (const item of items) {
    const section = rootSectionOf(item.taskId)
    const entry = grouped.get(section) ?? {
      label: sectionLabel(section, taskStore),
      fields: [],
    }
    entry.fields.push(fieldName(item.taskId, taskStore))
    grouped.set(section, entry)
  }
  return {
    total: items.length,
    bySection: Array.from(grouped, ([sectionId, { label, fields }]) => ({
      sectionId,
      sectionLabel: label,
      count: fields.length,
      fieldNames: Array.from(new Set(fields)).sort(),
    })).sort((a, b) => Number(a.sectionId) - Number(b.sectionId)),
  }
}

/**
 * Collect all descendant instance ids of a given instance (including itself).
 * Used to gather the answer footprint that will be removed when the instance
 * is deleted (e.g. deleting 3.1[2] also removes 3.1.1[2]).
 */
function collectDescendantTaskIds(
  rootTaskId: string,
  flatTasks: Record<string, FlatTask>,
): Set<string> {
  const result = new Set<string>([rootTaskId])
  const queue: string[] = [rootTaskId]
  while (queue.length > 0) {
    const id = queue.shift()!
    const task = flatTasks[id]
    if (!task) continue
    for (const childId of task.childrenIds || []) {
      if (!result.has(childId)) {
        result.add(childId)
        queue.push(childId)
      }
    }
  }
  return result
}

function collectDescendantInstances(
  instanceId: string,
  taskStore: TaskStoreType,
): string[] {
  const result: string[] = [instanceId]
  const instance = taskStore.getInstanceById(instanceId)
  if (!instance) return result
  for (const childId of instance.childInstanceIds) {
    result.push(...collectDescendantInstances(childId, taskStore))
  }
  return result
}

/**
 * Find answers that will be lost when `instanceId` is deleted.
 *
 * Includes:
 * - Answers on the deleted instance itself and its descendants.
 * - Answers on sync_instances targets (and their descendants) that map to
 *   the same _index, recursively — sync cascades can chain (3.1 → 6.1 → 7.1).
 */
export function findImpactedByDelete(
  instanceId: string,
  taskStore: TaskStoreType,
  answerStore: AnswerStoreType,
): ImpactedAnswer[] {
  const ns = taskStore.activeNamespace
  const flatTasks = taskStore.flatTasks[ns]
  const answers = answerStore.answers[ns] || {}

  const queue: string[] = [instanceId]
  const visitedInstances = new Set<string>()
  const impacted: ImpactedAnswer[] = []

  while (queue.length > 0) {
    const current = queue.shift()!
    if (visitedInstances.has(current)) continue
    visitedInstances.add(current)

    const parsed = parseInstanceId(current)
    if (parsed.index === undefined) continue

    // Gather all instance ids that would be removed when `current` is removed.
    const affectedIds = collectDescendantInstances(current, taskStore)
    for (const id of affectedIds) {
      const answer = answers[id]
      if (!hasValue(answer?.value)) continue
      const p = parseInstanceId(id)
      impacted.push({
        instanceId: id,
        taskId: p.taskId,
        value: answer.value,
        reason: 'sync_cascade',
      })
    }

    // A sync_instances dependency typically points at a text field inside
    // the repeatable source (e.g. 3.1.1 inside 3.1). Match any task whose
    // mapping source is this task id or any of its descendant task ids.
    const currentDescendantTaskIds = collectDescendantTaskIds(parsed.taskId, flatTasks)
    for (const [targetTaskId, task] of Object.entries(flatTasks)) {
      const mappingDep = task.dependencies?.find((d) => d.type === 'instance_mapping')
      if (!mappingDep?.source?.id) continue
      if (!currentDescendantTaskIds.has(mappingDep.source.id)) continue

      const targetInstance = taskStore.getInstanceById(`${targetTaskId}[${parsed.index}]`)
      if (targetInstance) queue.push(targetInstance.id)
    }
  }

  return impacted
}

/**
 * Find currently-visible answers that would become hidden if `conditionInstanceId`
 * had the hypothetical value `nextValue` instead of its current value.
 *
 * Walks every task with a conditional dependency whose condition id matches
 * the changed field's taskId, and checks shouldShowTask against a cloned
 * answerStore-view where the change has been applied.
 */
export function findImpactedByConditionalChange(
  conditionInstanceId: string,
  nextValue: AnswerValue,
  taskStore: TaskStoreType,
  answerStore: AnswerStoreType,
): ImpactedAnswer[] {
  const ns = taskStore.activeNamespace
  const flatTasks = taskStore.flatTasks[ns]
  const answers = answerStore.answers[ns] || {}
  const parsed = parseInstanceId(conditionInstanceId)
  const conditionTaskId = parsed.taskId

  const dependentTasks: FlatTask[] = Object.values(flatTasks).filter((t) =>
    t.dependencies?.some(
      (d) => d.type === 'conditional' && d.condition?.id === conditionTaskId,
    ),
  )
  if (dependentTasks.length === 0) return []

  const originalValue = answerStore.getAnswer(conditionInstanceId)
  if (originalValue === nextValue) return []

  const impacted: ImpactedAnswer[] = []
  for (const task of dependentTasks) {
    const instances = taskStore.getInstancesForTask(task.id)
    for (const instance of instances) {
      const instanceParsed = parseInstanceId(instance.id)
      if (
        parsed.index !== undefined &&
        instanceParsed.index !== undefined &&
        instanceParsed.index !== parsed.index
      ) continue

      const answer = answers[instance.id]
      if (!hasValue(answer?.value)) continue

      if (wouldBeHiddenUnder(task, instance.id, conditionInstanceId, nextValue, taskStore, answerStore)) {
        impacted.push({
          instanceId: instance.id,
          taskId: task.id,
          value: answer.value,
          reason: 'conditional_hidden',
        })
      }
    }
  }
  return impacted
}

/**
 * Reimplementation of `shouldShowTask`'s conditional branch that uses an
 * overridden value for a specific condition instance. Avoids mutating the
 * shared answer store (and triggering Vue reactivity) during what's really
 * a read-only "what if" computation.
 */
function wouldBeHiddenUnder(
  task: FlatTask,
  instanceId: string,
  overrideInstanceId: string,
  overrideValue: AnswerValue,
  taskStore: TaskStoreType,
  answerStore: AnswerStoreType,
): boolean {
  /* istanbul ignore if @preserve -- defensive: wouldBeHiddenUnder is only ever called from findImpactedByConditionalChange with a task whose dependencies array already matched the conditional filter, so task.dependencies is never falsy here */
  if (!task.dependencies) return false
  for (const dep of task.dependencies) {
    if (dep.type !== 'conditional' || !dep.condition) continue

    const { id: conditionTaskId, operator, value } = dep.condition
    if (value === null || value === undefined) continue

    const relatedInstance = taskStore.findRelatedInstance(conditionTaskId, instanceId)
    if (!relatedInstance) continue

    const rawValue =
      relatedInstance.id === overrideInstanceId
        ? overrideValue
        : answerStore.getAnswer(relatedInstance.id)

    const normalized =
      typeof rawValue === 'string' ? normalizeValue(rawValue) : rawValue

    let conditionMet = false
    if (operator === 'equals') conditionMet = normalized === value
    else if (operator === 'any') conditionMet = true
    else if (operator === 'contains') {
      conditionMet = Array.isArray(normalized)
        ? normalized.includes(value as string)
        : normalized === value
    }

    if (dep.action === 'show' && !conditionMet) return true
  }
  return false
}

/**
 * Filter an answer record to those that are currently visible according to
 * shouldShowTask. Used by the JSON exporter to match the PDF/Markdown filter
 * semantics — hidden answers must never leak through a shareable export.
 */
export function filterVisibleAnswers<T>(
  answers: Record<string, T>,
  taskStore: TaskStoreType,
  answerStore: AnswerStoreType,
): Record<string, T> {
  const ns = taskStore.activeNamespace
  const tasks = taskStore.flatTasks[ns] ?? {}
  const result: Record<string, T> = {}
  for (const [instanceId, value] of Object.entries(answers)) {
    const { taskId } = parseInstanceId(instanceId)
    // If the task isn't registered (e.g. stale answers from a schema change),
    // keep the answer — dropping it silently would be data-loss on export.
    if (!tasks[taskId]) {
      result[instanceId] = value
      continue
    }
    if (shouldShowTask(taskId, instanceId, taskStore, answerStore)) {
      result[instanceId] = value
    }
  }
  return result
}

import { useAnswerStore } from '../stores/answers'
import { useTaskStore, parseInstanceId, type FlatTask, type TaskInstance } from '../stores/tasks'
import { shouldShowTask as checkShouldShowTask, hasInstanceMapping } from '../utils/dependency'
import { computed } from 'vue'

export function useTaskDependencies() {
  const taskStore = useTaskStore()
  const answerStore = useAnswerStore()

  const shouldShowTask = computed(() => {
    return (taskId: string, instanceId: string): boolean => {
      return checkShouldShowTask(taskId, instanceId, taskStore, answerStore)
    }
  })

  const hasDependencyOfType = computed(() => {
    return (task: FlatTask, dependency: string): boolean => {
      if (!task.dependencies || task.dependencies.length === 0) {
        return false
      }
      return task.dependencies.some(dep => dep.type === dependency)
    }
  })

  const getDependencySourceTaskId = computed(() => {
    return (task: FlatTask): string | null => {
      if (!task.dependencies || task.dependencies.length === 0) {
        return null
      }

      for (const dependency of task.dependencies) {
        if (dependency.type === "source_options" && dependency.condition) {
          return dependency.condition.id
        }
        else if (dependency.type === "instance_mapping" && dependency.source) {
          return dependency.source.id
        }
        else if (dependency.type === "conditional" && dependency.condition) {
          return dependency.condition.id
        }
        else {
          throw new Error(`got an unsupported dependency type ${dependency.type}`)
        }
      }

      /* istanbul ignore next @preserve -- unreachable: the for-loop above always
         returns or throws on the first dependency; the empty-dependencies case
         already returned null before the loop. */
      return null
    }
  })

  const getSourceOptions = computed(() => {
    return (task: FlatTask): string[] => {
      if (!hasDependencyOfType.value(task, "source_options")) return []

      const sourceTaskId = getDependencySourceTaskId.value(task)
      /* istanbul ignore next @preserve -- unreachable: when a source_options
         dependency exists (guaranteed by the hasDependencyOfType guard above),
         getDependencySourceTaskId always resolves it to a non-null condition id. */
      if (sourceTaskId === null) return []

      const uniqueValues = new Set<string>()
      const sourceInstanceIds = taskStore.getInstanceIdsForTask(sourceTaskId)

      sourceInstanceIds.forEach((instanceId) => {
        const answer = answerStore.getAnswer(instanceId)
        if (typeof answer === 'string' && answer !== '') {
          uniqueValues.add(answer)
        }
      })

      return Array.from(uniqueValues)
    }
  })

  const hasSourceTaskValues = computed(() => {
    return (task: FlatTask): { hasValues: boolean; sourceId: string | null } => {
      const sourceTaskId = getDependencySourceTaskId.value(task)

      if (!sourceTaskId) {
        return { hasValues: true, sourceId: null }
      }

      const sourceInstances = taskStore.getInstancesForTask(sourceTaskId)

      const hasAnyValue = sourceInstances.some(instance => {
        const answer = answerStore.getAnswer(instance.id)
        return answer !== null && answer !== '' && answer !== undefined
      })

      return {
        hasValues: hasAnyValue,
        sourceId: sourceTaskId
      }
    }
  })

  const canUserCreateInstances = computed(() => {
    return (taskId: string): boolean => {
      const task = taskStore.taskById(taskId)
      if (!task.repeatable) return false
      return !hasInstanceMapping(task)
    }
  })

  // Reconcile targets to sources by shared _index — mappedFromInstanceId
  // is not persisted, so it can't survive a reload.
  const syncInstances = computed(() => {
    return (): void => {
      const namespace = taskStore.activeNamespace
      Object.entries(taskStore.flatTasks[namespace]).forEach(([taskId, task]) => {
        const mappingDeps = task.dependencies?.filter((d) => d.type === 'instance_mapping') || []
        if (mappingDeps.length === 0) return

        const parentInstanceId = task.parentId || undefined

        const indexOf = (instance: TaskInstance) => parseInstanceId(instance.id).index
        const byIndex = (instances: TaskInstance[]) =>
          new Map(instances.flatMap((inst) => {
            const idx = indexOf(inst)
            return idx === undefined ? [] : [[idx, inst] as const]
          }))

        for (const dep of mappingDeps) {
          const sourceId = dep.source?.id
          if (!sourceId) continue

          const sourceByIndex = byIndex(taskStore.getInstancesForTask(sourceId))
          const targetByIndex = byIndex(taskStore.getInstancesForTask(taskId))

          const allIndices = new Set([...sourceByIndex.keys(), ...targetByIndex.keys()])
          for (const idx of allIndices) {
            const source = sourceByIndex.get(idx)
            const target = targetByIndex.get(idx)

            if (source && target) {
              taskStore.setInstanceMappingSource(target.id, source.id)
            } else if (source) {
              const newId = taskStore.addRepeatableTaskInstance(taskId, parentInstanceId, idx)
              if (newId) taskStore.setInstanceMappingSource(newId, source.id)
            } else {
              // idx comes from the union of source and target indices, so when
              // source is absent the target is necessarily defined.
              taskStore.removeRepeatableTaskInstance(target!.id)
            }
          }
        }
      })
    }
  })

  return {
    shouldShowTask,
    hasSourceTaskValues,
    getDependencySourceTaskId,
    canUserCreateInstances,
    getSourceOptions,
    syncInstances,
  }
}

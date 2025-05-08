// src/stores/calculationStore.ts
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { useAnswerStore } from '@/stores/answers'
import { useTaskStore } from '@/stores/tasks'
import { useSchemaStore } from '@/stores/schemas'
import * as jexl from 'jexl'


export interface AssessmentLevel {
  level: string;
  expression: string;
  result: string;
  explanation: string;
}

export interface Assessment {
  id: string;
  levels: AssessmentLevel[];
}

export interface AssessmentResult {
  id: string;
  level: string;
  result: string;
  explanation: string;
  required: boolean; // For backward compatibility with UI components
}

const jexlInstance = new jexl.Jexl();

export const useCalculationStore = defineStore('calculationStore', () => {
  const answerStore = useAnswerStore()
  const taskStore = useTaskStore()
  const schemaStore = useSchemaStore()

  // State
  const calculatedScores = ref<Record<string, number>>({})
  const assessmentResults = ref<AssessmentResult[]>([])
  const isCalculating = ref(false)
  const calculationErrors = ref<string[]>([])
  const isInitialized = ref(false)

  // Initialize JEXL with custom transforms and functions
  function setupJexl() {
    // Add transform for counting options
    jexlInstance.addTransform('count', (value: any[] | null) => {
      if (!value || !Array.isArray(value)) return 0
      return value.length
    })

    jexlInstance.addFunction('weightedCountMap', (values: string[], keys: string[], weights: number[]) => {
      if (!values || !Array.isArray(values)) {
        return 0
      }

      // Create a map of key -> weight
      const weightMap: Record<string, number> = {}
      for (let i = 0; i < keys.length; i++) {
        weightMap[keys[i]] = weights[i] || 0
      }

      // Calculate weighted sum
      let total = 0
      for (const value of values) {
        total += weightMap[value] || 0
      }

      return total;
    })

    // Add answer retrieval function
    jexlInstance.addFunction('answers', (id: string) => {
      const instanceIds = taskStore.getInstanceIdsForTask(id)
      if (instanceIds.length === 0) return null

      // Get answer for the first instance (for non-repeatable tasks)
      return answerStore.getAnswer(instanceIds[0])
    })

    jexlInstance.addFunction('bool', (value) => {
      if (value === null || value === undefined) return false
      return value === true || value === 'true'
    })

    // Add function to count selected options in a task
    jexlInstance.addFunction('countSelectedOptions', (taskId: string) => {
      const instanceIds = taskStore.getInstanceIdsForTask(taskId)
      if (instanceIds.length === 0) return 0

      const answer = answerStore.getAnswer(instanceIds[0])
      if (!answer || !Array.isArray(answer)) return 0

      return answer.length
    })

    isInitialized.value = true
    console.log('JEXL setup complete')
  }
  // Calculate a score for a single task
  async function calculateTaskScore(task: any) {
    if (!task.calculation) return null

    try {
      // Evaluate the main expression
      const value = await jexlInstance.eval(task.calculation.expression)

      // Find the applicable risk score based on conditions
      if (task.calculation.riskScore) {
        for (const riskLevel of task.calculation.riskScore) {
          const conditionMet = await jexlInstance.eval(riskLevel.when, {
            [task.calculation.scoreKey]: value
          })

          if (conditionMet) {
            // Store the calculated score
            if (task.calculation.scoreKey) {
              calculatedScores.value[task.calculation.scoreKey] = riskLevel.value
            }
            return riskLevel.value
          }
        }
      }

      return value
    } catch (error) {
      console.error(`Error calculating score for task ${task.id}:`, error)
      return null
    }
  }

  // Process all tasks recursively to calculate scores
  async function processTaskScores(tasks: any[]) {
    for (const task of tasks) {
      // Calculate score for this task if it has a calculation
      if (task.calculation) {
        await calculateTaskScore(task)
      }

      // Process child tasks
      if (task.tasks && Array.isArray(task.tasks)) {
        await processTaskScores(task.tasks)
      }
    }
  }


  async function evaluateAssessments(): Promise<AssessmentResult[] | undefined> {
    assessmentResults.value = []
    const schema = schemaStore.getSchema(taskStore.activeNamespace)
    if (!schema || !schema.assessments) {
      console.warn('No assessments found in schema')
      return
    }

    const assessments = schema.assessments as Assessment[]

    for (const assessment of assessments) {
      try {
        const context = { scores: calculatedScores.value }
        let matchedLevel = null;

        for (const level of assessment.levels) {
          const result = await jexlInstance.eval(level.expression, context)
          if (result) {
            matchedLevel = level;
            break;
          }
        }

        if (matchedLevel) {
          assessmentResults.value.push({
            id: assessment.id,
            level: matchedLevel.level,
            result: matchedLevel.result,
            explanation: matchedLevel.explanation,
            required: matchedLevel.level === 'required' || matchedLevel.level === 'recommended'
          })
        }
      } catch (error) {
        console.error(`Error evaluating assessment ${assessment.id}:`, error)
        calculationErrors.value.push(`Error in ${assessment.id} assessment: ${error}`)
      }
    }

    // Sort alphabetically by ID
    assessmentResults.value.sort((a, b) => a.id.localeCompare(b.id))
  }

  // Main calculation function
  async function runCalculations() {
    calculationErrors.value = []
    isCalculating.value = true

    try {
      const schema = schemaStore.getSchema(taskStore.activeNamespace)
      if (!schema) {
        throw new Error('No schema found')
      }

      // Reset scores
      calculatedScores.value = {}

      // Process all task scores
      await processTaskScores(schema.tasks)

      // Evaluate assessments
      await evaluateAssessments()
    } catch (error) {
      console.error('Error running calculations:', error)
      calculationErrors.value.push(`Error: ${error}`)
    } finally {
      isCalculating.value = false
    }
  }
  // Initialize the calculator
  function init() {
    if (!isInitialized.value) {
      setupJexl();
    }

    // Only run calculations if JEXL is initialized
    if (isInitialized.value) {
      runCalculations();
    } else {
      console.error('Cannot run calculations - JEXL is not initialized');
    }
  }

  // Set up watcher to recalculate when answers change
  watch(
    () => answerStore.answers,
    () => {
      if (isInitialized.value) {
        runCalculations();
      }
    },
    { deep: true }
  )

  // Public API
  return {
    calculatedScores,
    assessmentResults,
    isCalculating,
    calculationErrors,
    runCalculations,
    init
  }
})

export type CalculationStoreType = ReturnType<typeof useCalculationStore>

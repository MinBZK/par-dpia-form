import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { useAnswerStore } from './answers'
import { useTaskStore } from './tasks'
import { useSchemaStore } from './schemas'
import * as jexl from 'jexl'
import { FormType } from '../models/dpia'


export interface Criterion {
  id: string;
  expression: string;
  explanation: string;
}

export interface AssessmentLevel {
  level: string;
  expression: string;
  result: string;
  explanation: string;
  criteria?: Criterion[];
}

export interface Assessment {
  id: string;
  levels: AssessmentLevel[];
}

export interface CriterionResult {
  id: string;
  met: boolean;
  explanation: string;
}

export interface AssessmentResult {
  id: string;
  level: string;
  result: string;
  explanation: string;
  required: boolean;
  criteria?: CriterionResult[];
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

    jexlInstance.addFunction('criteriaCheck', (criteriaObj) => {
      return Object.values(criteriaObj).some(val => val === true)
    })

    isInitialized.value = true
    console.log('JEXL setup complete')
  }

  // Calculate a score for a single task using JEXL expression evaluation
  async function calculateTaskScore(task: any) {
    if (!task.calculation) return null

    try {
      // Evaluate the main JEXL expression (safe domain-specific language, not arbitrary code)
      const value = await jexlInstance.eval(task.calculation.expression) // nosec: JEXL is a safe expression language

      // Find the applicable risk score based on conditions
      if (task.calculation.riskScore) {
        for (const riskLevel of task.calculation.riskScore) {
          const conditionMet = await jexlInstance.eval(riskLevel.when, { // nosec: JEXL expression
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
      if (task.calculation) {
        await calculateTaskScore(task)
      }
      if (task.tasks && Array.isArray(task.tasks)) {
        await processTaskScores(task.tasks)
      }
    }
  }

  async function evaluateCriteria(criteria: Criterion[], context: any): Promise<CriterionResult[]> {
    const metCriteria: CriterionResult[] = [];

    for (const criterion of criteria) {
      try {
        const isMet = await jexlInstance.eval(criterion.expression, context); // nosec: JEXL expression
        if (isMet) {
          metCriteria.push({
            id: criterion.id,
            met: true,
            explanation: criterion.explanation
          });
        }
      } catch (error) {
        console.error(`Error evaluating criterion ${criterion.id}:`, error);
        calculationErrors.value.push(`Error in criterion ${criterion.id}: ${error}`);
      }
    }

    return metCriteria;
  }

  function formatExplanation(assessmentId: string, level: string, defaultExplanation: string, metCriteria: CriterionResult[]): string {
    if (metCriteria.length > 0) {
      if (level === "recommended") {
        return `Een ${assessmentId} wordt aanbevolen omdat:\n• ${metCriteria.map(c => c.explanation).join("\n• ")}`;
      } else {
        return `Een ${assessmentId} is verplicht omdat:\n• ${metCriteria.map(c => c.explanation).join("\n• ")}`;
      }
    }
    return defaultExplanation;
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
        const context = { scores: calculatedScores.value };

        for (const level of assessment.levels) {
          let result = false;
          let metCriteria: CriterionResult[] = [];

          if (level.criteria && level.criteria.length > 0) {
            metCriteria = await evaluateCriteria(level.criteria, context);

            const criteriaContext = {
              ...context,
              criteria: metCriteria.reduce((obj, c) => {
                obj[c.id] = c.met;
                return obj;
              }, {} as Record<string, boolean>)
            };

            result = await jexlInstance.eval(level.expression, criteriaContext); // nosec: JEXL expression
          } else {
            result = await jexlInstance.eval(level.expression, context); // nosec: JEXL expression
          }

          if (result) {
            const explanation = formatExplanation(
              assessment.id,
              level.level,
              level.explanation || '',
              metCriteria
            );

            assessmentResults.value.push({
              id: assessment.id,
              level: level.level,
              result: level.result,
              explanation,
              required: level.level === 'required' || level.level === 'recommended',
              criteria: metCriteria.length > 0 ? metCriteria : undefined
            });

            break;
          }
        }
      } catch (error) {
        console.error(`Error evaluating assessment ${assessment.id}:`, error)
        calculationErrors.value.push(`Error in ${assessment.id} assessment: ${error}`)
      }
    }

    assessmentResults.value.sort((a, b) => a.id.localeCompare(b.id))
    return assessmentResults.value
  }

  async function runCalculations() {
    calculationErrors.value = []
    isCalculating.value = true

    try {
      const schema = schemaStore.getSchema(taskStore.activeNamespace)
      if (!schema) {
        throw new Error('No schema found')
      }

      calculatedScores.value = {}
      await processTaskScores(schema.tasks)
      await evaluateAssessments()
    } catch (error) {
      console.error('Error running calculations:', error)
      calculationErrors.value.push(`Error: ${error}`)
    } finally {
      isCalculating.value = false
    }
  }

  function init() {
    if (!isInitialized.value) {
      setupJexl();
    }

    if (isInitialized.value) {
      runCalculations();
    } else {
      console.error('Cannot run calculations - JEXL is not initialized');
    }
  }

  watch(
    () => answerStore.answers,
    () => {
      if (isInitialized.value && answerStore.activeNamespace === FormType.PRE_SCAN) {
        runCalculations();
      }
    },
    { deep: true }
  )

  function reset() {
    calculatedScores.value = {}
    assessmentResults.value = []
    isCalculating.value = false
    calculationErrors.value = []
    isInitialized.value = false
  }

  return {
    calculatedScores,
    assessmentResults,
    isCalculating,
    calculationErrors,
    runCalculations,
    reset,
    init
  }
})

export type CalculationStoreType = ReturnType<typeof useCalculationStore>

import { computed } from 'vue'
import { useAnswerStore } from '@/stores/answers'
import { useTaskStore, type FlatTask } from '@/stores/tasks'

export function useRiskCalculation() {
  const answerStore = useAnswerStore()
  const taskStore = useTaskStore()

  /**
   * Calculate risk level based on chance and impact using the risk matrix
   *
   * Risk Matrix:
   * - laag + laag = laag
   * - laag + midden = laag
   * - laag + hoog = laag
   * - midden + laag = laag
   * - midden + midden = midden
   * - midden + hoog = hoog
   * - hoog + laag = hoog
   * - hoog + midden = hoog
   * - hoog + hoog = hoog
   */
  const calculateRiskLevel = (chance: string, impact: string): string => {
    // Normalize input values
    const normalizeValue = (value: string): string => {
      const normalized = value.toLowerCase().trim()
      // Handle 'gemiddeld' as synonym for 'midden'
      return normalized === 'gemiddeld' ? 'midden' : normalized
    }

    const normalizedChance = normalizeValue(chance)
    const normalizedImpact = normalizeValue(impact)

    // Risk matrix calculation
    if (normalizedChance === 'hoog' || normalizedImpact === 'hoog') {
      return 'hoog'
    } else if (normalizedChance === 'midden' && normalizedImpact === 'midden') {
      return 'midden'
    } else {
      return 'laag'
    }
  }

  const getRiskCalculationValue = computed(() => {
    return (task: FlatTask, instanceId: string): string | null => {
      // Only calculate for risk level fields (16.1.7)
      if (task.id !== '16.1.7') return null

      // Get the current instance to find related instances
      const currentInstance = taskStore.getInstanceById(instanceId)
      if (!currentInstance?.parentInstanceId) return null

      // Get chance value from 16.1.3 in the same parent instance
      const chanceInstances = taskStore.getInstancesForTask('16.1.3', currentInstance.parentInstanceId)
      if (chanceInstances.length === 0) return null
      const chanceValue = answerStore.getAnswer(chanceInstances[0].id)

      // Get impact value from 16.1.5 in the same parent instance
      const impactInstances = taskStore.getInstancesForTask('16.1.5', currentInstance.parentInstanceId)
      if (impactInstances.length === 0) return null
      const impactValue = answerStore.getAnswer(impactInstances[0].id)

      // Calculate risk if both values are available
      if (chanceValue && impactValue && typeof chanceValue === 'string' && typeof impactValue === 'string') {
        return calculateRiskLevel(chanceValue, impactValue)
      }

      return null
    }
  })

  return {
    calculateRiskLevel,
    getRiskCalculationValue
  }
}

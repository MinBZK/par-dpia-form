import { useAnswerStore } from '@/stores/answers'

export function renderInstanceLabel(
  instance: number,
  template: string
): string {
  const answerStore = useAnswerStore()

  return template.replace(/\{([^}]+)\}/g, (match: string, fieldId: string): string => {
    const value = answerStore.answers[fieldId]?.[instance]?.value

    if (value === undefined || value === null) {
      return match
    }

    if (Array.isArray(value)) {
      return value.join(', ')

    }
    return String(value)
  })
}

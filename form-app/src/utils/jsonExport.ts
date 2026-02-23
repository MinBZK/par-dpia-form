import { type DPIASnapshot } from '@/models/dpiaSnapshot'
import { type TaskStoreType } from '@/stores/tasks'
import { type AnswerStoreType } from '@/stores/answers'
import { FormType } from '@/models/dpia.ts'

export async function importFromJson(file: File): Promise<DPIASnapshot> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (event) => {
      try {
        if (!event.target || typeof event.target.result !== 'string') {
          reject(new Error('Het bestand kon niet worden gelezen.'))
          return
        }

        let data: DPIASnapshot
        try {
          data = JSON.parse(event.target.result) as DPIASnapshot
        } catch {
          reject(
            new Error('Het bestand heeft geen geldig JSON-formaat. Selecteer een eerder geëxporteerd JSON- of PDF-bestand.'),
          )
          return
        }

        if (!data.metadata || !data.taskState || !data.answers) {
          reject(new Error('Het bestand heeft niet het verwachte formaat voor een DPIA-export.'))
          return
        }

        const hasDPIA = data.taskState[FormType.DPIA] && data.answers[FormType.DPIA]
        const hasPreScan = data.taskState[FormType.PRE_SCAN] && data.answers[FormType.PRE_SCAN]

        if (!hasDPIA && !hasPreScan) {
          reject(new Error('Het bestand bevat geen geldige DPIA- of pre-scan-gegevens.'))
          return
        }

        resolve(data)
      } catch {
        reject(new Error('Er is een fout opgetreden bij het verwerken van het bestand.'))
      }
    }
    reader.onerror = () => {
      reject(new Error('Het bestand kon niet worden gelezen.'))
    }
    reader.readAsText(file)
  })
}

export function buildSnapshot(
  taskStore: TaskStoreType,
  answerStore: AnswerStoreType,
): DPIASnapshot {
  const activeNamespace = taskStore.activeNamespace

  return {
    metadata: {
      savedAt: new Date().toISOString(),
      activeNamespace,
    },
    taskState: {
      [activeNamespace]: {
        currentRootTaskId: taskStore.currentRootTaskId[activeNamespace],
        taskInstances: taskStore.taskInstances[activeNamespace],
        completedRootTaskIds: Array.from(taskStore.completedRootTaskIds[activeNamespace]),
      },
    },
    answers: {
      [activeNamespace]: answerStore.answers[activeNamespace],
    },
  }
}

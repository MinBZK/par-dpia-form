import { type DPIASnapshot } from '@/models/dpiaSnapshot'
import { type FlatTask, type TaskStoreType } from '@/stores/tasks'
import { type AnswerStoreType } from '@/stores/answers'
import * as pdfMake from "pdfmake/build/pdfmake";
import * as pdfFonts from 'pdfmake/build/vfs_fonts';
import type { StyleDictionary, TDocumentDefinitions, Content } from 'pdfmake/interfaces';
import { renderInstanceLabel } from '@/utils/taskUtils'

(<any>pdfMake).addVirtualFileSystem(pdfFonts);

export function downloadJsonFile(data: unknown, filename: string): void {
  try {
    const jsonString = JSON.stringify(data, null, 4);
    const blob = new Blob([jsonString], { type: 'application/json' })

    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename

    document.body.appendChild(link)
    link.click()

    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  } catch (error) {
    console.error('Error in creating download file:', error)
    throw new Error('Failed to create download file')
  }
}

export async function readJsonFile(file: File): Promise<DPIASnapshot> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (event) => {
      try {
        if (!event.target || typeof event.target.result !== 'string') {
          reject(new Error('Could not read given file'))
          return
        }

        const data = JSON.parse(event.target.result) as DPIASnapshot

        if (!data.metadata || !data.taskState || !data.answers) {
          reject(new Error('File contains format incompatible with DPIASnapshot structure'))
          return
        }
        resolve(data)
      } catch (error) {
        if (error instanceof Error) {
          reject(error)
        } else {
          reject(new Error('Could not process file'))
        }
      }
    }
    reader.onerror = () => {
      reject(new Error('There was an error reading the file'))
    }
    reader.readAsText(file)
  })
}

const dpiaStyleDictionary: StyleDictionary = {
  title: {
    fontSize: 28,
    bold: true,
    margin: [0, 0, 0, 10],
    color: '#154273' // RVO blue
  },
  subtitle: {
    fontSize: 18,
    margin: [0, 15, 0, 0],
    color: '#333333'
  },
  subsubtitle: {
    fontSize: 14,
    margin: [0, 40, 0, 0],
    color: '#666666',
    italics: true
  },
  header: {
    fontSize: 24,
    bold: true,
    margin: [0, 0, 0, 20],
    color: '#154273' // RVO blue
  },
  subHeader: {
    fontSize: 16,
    bold: true,
    margin: [0, 15, 0, 10],
    color: '#154273' // RVO blue
  },
  subSubHeader: {
    fontSize: 14,
    bold: true,
    margin: [0, 10, 0, 5]
  },
  description: {
    fontSize: 11,
    margin: [0, 0, 0, 15]
  },
  normal: {
    fontSize: 11,
  },
  tableHeader: {
    fontSize: 12,
    bold: true,
    color: '#154273'
  },
  tableExample: {
    margin: [0, 5, 0, 15]
  }
}

export async function exportDpiaToPdf(
  taskStore: TaskStoreType,
  answerStore: AnswerStoreType,
): Promise<void> {
  const docDefinition: TDocumentDefinitions = {
    content: [
      // Cover page
      {
        stack: [
          { text: 'Data Protection Impact Assessment', style: 'title' },
          { text: 'DPIA Rapportagemodel', style: 'subtitle' },
          { text: `Gegenereerd met de 'DPIA Rapportagemodel Editor' op ${new Date().toISOString()}`, style: 'subsubtitle' },
        ],
        alignment: 'center',
        margin: [0, 150, 0, 0],
        pageBreak: 'after',
      },

      // Table of contents
      {
        toc: {
          title: { text: 'Inhoudsopgave', style: 'header' },
        },
      },

      // Contents
      ...taskStore.getRootTasks.filter(task => !task.type.includes("signing")).map(task => buildSection(task, taskStore, answerStore)),
    ],


    // Page numbers
    footer: function(currentPage, pageCount) {
      return {
        text: `Pagina ${currentPage} van ${pageCount}`,
        alignment: 'center',
        margin: [0, 0, 40, 0],
        color: '#999999',
        fontSize: 10
      }
    },

    // Document metadata
    info: {
      title: 'DPIA Rapportagemodel',
      author: 'DPIA Rapportagemodel Editor',
      creator: 'DPIA Rapportagemodel Editor'
    },

    // Page styling
    pageSize: 'A4',
    pageMargins: [70, 70, 70, 70],
    styles: dpiaStyleDictionary,
  }

  pdfMake.createPdf(docDefinition).download('DPIA_Rapportagemodel.pdf')
}

function buildSection(task: FlatTask, taskStore: TaskStoreType, answerStore: AnswerStoreType): Content {
  const contentElements: Content = [
    buildSectionTitle(task.id, task.task),
  ]

  if (task.description) {
    contentElements.push(buildSectionDesciption(task.description))
  }

  contentElements.push(buildAnswer(task, taskStore, answerStore))

  return {
    stack: contentElements,
    pageBreak: 'before'
  }
}

function buildSectionTitle(taskId: string, taskName: string): Content {
  return {
    text: `${taskId}.  ${taskName}`, style: 'header', tocItem: true
  }
}

function buildSectionDesciption(description?: string): Content {
  return {
    stack: [
      { text: "Beschrijving", style: 'subSubHeader' },
      { text: `${description}`, style: 'description' },
    ]
  }
}

function buildAnswer(task: FlatTask, taskStore: TaskStoreType, answerStore: AnswerStoreType): Content {
  const answerContent: Content = []
  if (task.type?.includes("task_group") && task.childrenIds?.length > 0) {
    const childElements: Content = []

    for (const childId of task.childrenIds) {
      const childTask = taskStore.taskById(childId)
      childElements.push({ text: `${childTask.task}`, style: 'subSubHeader' })

      for (const id of taskStore.getInstanceIdsForTask(childId)) {

        // Single task
        // If a root task in a DPIA has no child tasks we know it only has exactly 1 instance and must
        // be of type open_text, text_input or select_option.
        if (!childTask.childrenIds.length) {
          const instanceId = taskStore.getInstanceIdsForTask(childTask.id)[0]
          const singleTaskAnswer = answerStore.getAnswer(instanceId)
          childElements.push({ text: `${singleTaskAnswer ? singleTaskAnswer : ''}`, style: 'normal' })
        } else {
          if (!childTask.repeatable) {
            childElements.push({ text: `instance=${id}, childName=${childTask.task}, childrenLen=${childTask.childrenIds.length}, taskGroup=${task.type.includes("task_group")}, NOT REPEATABLE\n\n`, style: 'normal' })
          } else {
            // Task is repeatable. We need to distinguish between instances created by the user,
            // and instances that are synced from another task
            const hasInstanceMapping = childTask.dependencies?.filter(dep => dep.type === "instance_mapping")
            if (hasInstanceMapping) {
              childElements.push({ text: `DEPENDEND instance = ${id}, childName = ${childTask.task}, childrenLen = ${childTask.childrenIds.length}, taskGroup=${task.type.includes("task_group")}, REPEATABLE\n\n`, style: 'normal' })
            } else {
              childElements.push(createTableElement(id, childTask, taskStore, answerStore))
              //childElements.push({ text: `INDEPENDENT instance = ${id}, childName = ${childTask.task}, childrenLen = ${childTask.childrenIds.length}, taskGroup=${task.type.includes("task_group")}, REPEATABLE\n\n`, style: 'normal' })
            }
          }
        }
      }
    }

    answerContent.push({ stack: childElements })

  } else {
    const instanceId = taskStore.getRootTaskInstanceIds(task.id)[0]
    const singleTaskAnswer = answerStore.getAnswer(instanceId)
    answerContent.push({ text: `${singleTaskAnswer ? singleTaskAnswer : ''}`, style: 'normal' })
  }
  return { stack: answerContent }
}

// Helper function to format answer values for display
function formatAnswerValue(value: any): string {
  if (Array.isArray(value)) {
    return value.join(", ");
  } else if (value === true) {
    return "Ja";
  } else if (value === false) {
    return "Nee";
  } else if (value === null) {
    return "";
  }
  return value ? String(value) : "";
}

// Creates a table for a task group instance
function buildTableForInstance(
  instanceId: string,
  parentTask: FlatTask,
  taskStore: TaskStoreType,
  answerStore: AnswerStoreType
): any[][] {
  // Create table rows array
  const tableRows: any[][] = [];

  // Add header row with instance label
  //const instanceLabel = parentTask.instance_label_template
  //  ? renderInstanceLabel(instanceId, parentTask.instance_label_template)
  //  : parentTask.task;
  //tableRows.push([{ text: instanceLabel, style: 'tableHeader', colSpan: 2 }, {}]);

  // Add rows for each child task that's a simple field
  for (const childTaskId of parentTask.childrenIds) {
    const childTask = taskStore.taskById(childTaskId);

    // Skip tasks with children (only include simple fields)
    if (childTask.childrenIds && childTask.childrenIds.length > 0) {
      continue;
    }

    // Add a row for each instance of this child task
    const childInstanceIds = taskStore.getInstanceIdsForTask(childTaskId, instanceId);
    for (const childInstanceId of childInstanceIds) {
      const value = answerStore.getAnswer(childInstanceId);
      tableRows.push([
        {
          text: childTask.task, bold: true, margin: [0, 3, 0, 3], fillColor: '#f5f5f5',
        },
        { text: formatAnswerValue(value), margin: [0, 3, 0, 3] }
      ]);
    }
  }

  return tableRows;
}

// Creates a table content element for a task instance
function createTableElement(
  instanceId: string,
  task: FlatTask,
  taskStore: TaskStoreType,
  answerStore: AnswerStoreType
): Content {
  return {
    style: 'tableExample',
    table: {
      widths: ['35%', '65%'],
      body: buildTableForInstance(instanceId, task, taskStore, answerStore)
    },
  };
}

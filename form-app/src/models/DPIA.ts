import * as t from 'io-ts'

export const TaskTypeValue = t.union([
  t.literal('task_group'),
  t.literal('text_input'),
  t.literal('open_text'),
  t.literal('date'),
  t.literal('select_option'),
  t.literal('upload_document'),
  t.literal('sign_task'),
])
export type TaskTypeValue = t.TypeOf<typeof TaskTypeValue>

export const Source = t.intersection([
  // Required properties
  t.type({
    source: t.string,
  }),
  // Optional properties
  t.partial({
    description: t.string,
  }),
])
export type Source = t.TypeOf<typeof Source>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const Task: t.RecursiveType<any> = t.recursion('Task', () =>
  t.intersection([
    // Required properties
    t.type({
      task: t.string,
      id: t.string,
      type: t.array(TaskTypeValue),
    }),
    // Optional properties
    t.partial({
      description: t.string,
      category: t.string,
      repeatable: t.boolean,
      tasks: t.array(Task),
      options: t.array(t.string),
      sources: t.array(Source),
    }),
  ]),
)
export type Task = t.TypeOf<typeof Task>

export const Tasks = t.array(Task)
export type Tasks = t.TypeOf<typeof Tasks>

export const DPIA = t.type({
  name: t.string,
  urn: t.string,
  version: t.string,
  description: t.string,
  tasks: Tasks,
})

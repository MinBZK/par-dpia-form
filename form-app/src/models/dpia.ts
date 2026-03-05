import * as t from 'io-ts'

export enum FormType {
  DPIA = 'dpia',
  PRE_SCAN = 'prescan',
  IAMA = 'iama',
}

export const TaskTypeValue = t.union([
  t.literal('task_group'),
  t.literal('signing'),
  t.literal('text_input'),
  t.literal('open_text'),
  t.literal('date'),
  t.literal('select_option'),
  t.literal('radio_option'),
  t.literal('checkbox_option'),
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

export const Option = t.intersection([
  // Required properties
  t.type({
    value: t.union([t.string, t.boolean, t.null]),
  }),
  // Optional properties
  t.partial({
    label: t.string,
  }),
])

export type Option = t.TypeOf<typeof Option>

export const Condition = t.intersection([
  t.type({
    id: t.string,
    operator: t.string,
  }),
  t.partial({
    value: t.union([t.string, t.boolean, t.null]),
  }),
])

export type Condition = t.TypeOf<typeof Condition>

export const Dependency = t.intersection([
  t.type({
    type: t.string,
    action: t.string,
  }),
  t.partial({
    condition: Condition,
    source: t.type({
      id: t.string,
    }),
    mapping_type: t.string,
  }),
])

export type Dependency = t.TypeOf<typeof Dependency>

export const RiskScore = t.type({
  when: t.string,
  value: t.number
})

export type RiskScore = t.TypeOf<typeof RiskScore>

export const Calculation = t.intersection([
  t.type({
    expression: t.string,
  }),
  t.partial({
    scoreKey: t.string,
    riskScore: t.array(RiskScore)
  })
])

export type Calculation = t.TypeOf<typeof Calculation>

export const ReferenceType = t.union([
  t.literal('pre-view'),
  t.literal('pre-fill'),
  t.literal('one-to-one'),
  t.literal('one-to-many'),
  t.literal('many-to-many'),
])

export const TaskReference = t.type({
  id: t.string,
  type: ReferenceType
})

export const TaskReferences = t.partial({
  prescanModelId: t.string,
  DPIA: t.array(TaskReference)
})

export type TaskReferences = t.TypeOf<typeof TaskReferences>
export type ReferenceType = t.TypeOf<typeof ReferenceType>
export type TaskReference = t.TypeOf<typeof TaskReference>

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
      is_official_id: t.boolean,
      valueType: t.string,
      instance_label_template: t.string,
      description: t.string,
      category: t.string,
      repeatable: t.boolean,
      tasks: t.array(Task),
      options: t.array(Option),
      sources: t.array(Source),
      dependencies: t.array(Dependency),
      defaultValue: t.union([t.string, t.boolean, t.null]),
      calculation: Calculation,
      references: TaskReferences,
    }),
  ]),
)
export type Task = t.TypeOf<typeof Task>

export const Tasks = t.array(Task)
export type Tasks = t.TypeOf<typeof Tasks>

export const Criterion = t.type({
  id: t.string,
  expression: t.string,
  explanation: t.string
})

export type Criterion = t.TypeOf<typeof Criterion>

export const AssessmentLevel = t.intersection([
  t.type({
    level: t.string,
    expression: t.string,
    result: t.string,
  }),
  t.partial({
    explanation: t.string,
    criteria: t.array(Criterion)
  })
])

export type AssessmentLevel = t.TypeOf<typeof AssessmentLevel>

export const Assessment = t.type({
    id: t.string,
    levels: t.array(AssessmentLevel),
  })

export type Assessment = t.TypeOf<typeof Assessment>

export const DPIA = t.intersection([
  t.type({
    name: t.string,
    urn: t.string,
    version: t.string,
    description: t.string,
    tasks: Tasks,
  }),
  t.partial({
    assessments: t.array(Assessment),
  })
])

import { pgTable, uuid, text, timestamp, integer, jsonb, uniqueIndex, primaryKey, pgEnum } from 'drizzle-orm/pg-core'

export const projectRoleEnum = pgEnum('project_role', ['owner', 'editor', 'viewer'])

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  oidcSub: text('oidc_sub').unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const projectMembers = pgTable('project_members', {
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: projectRoleEnum('role').notNull().default('editor'),
  invitedAt: timestamp('invited_at', { withTimezone: true }).notNull().defaultNow(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
}, (table) => [
  primaryKey({ columns: [table.projectId, table.userId] }),
])

export const assessmentTypeEnum = pgEnum('assessment_type', ['dpia', 'prescan'])

export const assessmentInstances = pgTable('assessment_instances', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  assessmentType: assessmentTypeEnum('assessment_type').notNull(),
  name: text('name').notNull(),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  currentVersion: integer('current_version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const assessmentVersions = pgTable('assessment_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  assessmentInstanceId: uuid('assessment_instance_id').notNull().references(() => assessmentInstances.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  snapshot: jsonb('snapshot').notNull(),
  savedBy: uuid('saved_by').notNull().references(() => users.id),
  savedAt: timestamp('saved_at', { withTimezone: true }).notNull().defaultNow(),
  changeDescription: text('change_description'),
}, (table) => [
  uniqueIndex('assessment_version_unique').on(table.assessmentInstanceId, table.version),
])

export const assessmentEdits = pgTable('assessment_edits', {
  id: uuid('id').primaryKey().defaultRandom(),
  assessmentInstanceId: uuid('assessment_instance_id').notNull().references(() => assessmentInstances.id, { onDelete: 'cascade' }),
  fieldId: text('field_id').notNull(),
  userId: uuid('user_id').notNull().references(() => users.id),
  oldValue: jsonb('old_value'),
  newValue: jsonb('new_value'),
  editedAt: timestamp('edited_at', { withTimezone: true }).notNull().defaultNow(),
})

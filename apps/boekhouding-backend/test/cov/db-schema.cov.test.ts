import { describe, it, expect } from 'vitest'
import { getTableConfig } from 'drizzle-orm/pg-core'
import {
  projectRoleEnum,
  assessmentTypeEnum,
  users,
  projects,
  projectMembers,
  assessmentInstances,
  assessmentVersions,
  assessmentEdits,
  comments,
} from '../../src/db/schema.js'

// getTableConfig() forces Drizzle's lazily-evaluated reference/config callbacks to run.

describe('db/schema enums', () => {
  it('projectRoleEnum holds the four membership roles', () => {
    expect(projectRoleEnum.enumName).toBe('project_role')
    expect(projectRoleEnum.enumValues).toEqual(['owner', 'editor', 'commenter', 'viewer'])
  })

  it('assessmentTypeEnum holds dpia and prescan', () => {
    expect(assessmentTypeEnum.enumName).toBe('assessment_type')
    expect(assessmentTypeEnum.enumValues).toEqual(['dpia', 'prescan'])
  })
})

describe('db/schema users table', () => {
  it('defines the expected columns', () => {
    const config = getTableConfig(users)
    expect(config.name).toBe('users')
    const names = config.columns.map((c) => c.name).sort()
    expect(names).toEqual(['created_at', 'display_name', 'email', 'id', 'oidc_sub'].sort())
  })

  it('has no foreign keys', () => {
    const config = getTableConfig(users)
    expect(config.foreignKeys).toHaveLength(0)
  })
})

describe('db/schema projects table', () => {
  it('references users via created_by', () => {
    const config = getTableConfig(projects)
    expect(config.name).toBe('projects')
    expect(config.foreignKeys).toHaveLength(1)
    const ref = config.foreignKeys[0].reference()
    expect(ref.columns.map((c) => c.name)).toEqual(['created_by'])
    expect(ref.foreignColumns.map((c) => c.name)).toEqual(['id'])
    expect(ref.foreignTable).toBe(users)
  })
})

describe('db/schema projectMembers table', () => {
  it('builds a composite primary key on project_id + user_id', () => {
    const config = getTableConfig(projectMembers)
    expect(config.name).toBe('project_members')
    expect(config.primaryKeys).toHaveLength(1)
    expect(config.primaryKeys[0].columns.map((c) => c.name)).toEqual([
      'project_id',
      'user_id',
    ])
  })

  it('cascade-deletes against both projects and users', () => {
    const config = getTableConfig(projectMembers)
    expect(config.foreignKeys).toHaveLength(2)
    const refs = config.foreignKeys.map((fk) => {
      const r = fk.reference()
      return { col: r.columns[0].name, table: r.foreignTable, onDelete: fk.onDelete }
    })
    const projectFk = refs.find((r) => r.col === 'project_id')
    const userFk = refs.find((r) => r.col === 'user_id')
    expect(projectFk).toBeDefined()
    expect(projectFk!.table).toBe(projects)
    expect(projectFk!.onDelete).toBe('cascade')
    expect(userFk).toBeDefined()
    expect(userFk!.table).toBe(users)
    expect(userFk!.onDelete).toBe('cascade')
  })
})

describe('db/schema assessmentInstances table', () => {
  it('has a project index and the cached_state column', () => {
    const config = getTableConfig(assessmentInstances)
    expect(config.name).toBe('assessment_instances')
    expect(config.indexes.map((i) => i.config.name)).toContain(
      'assessment_instances_project_idx',
    )
    expect(config.columns.map((c) => c.name)).toContain('cached_state')
  })

  it('cascade-deletes against projects and references users', () => {
    const config = getTableConfig(assessmentInstances)
    const refs = config.foreignKeys.map((fk) => {
      const r = fk.reference()
      return { col: r.columns[0].name, table: r.foreignTable, onDelete: fk.onDelete }
    })
    const projectFk = refs.find((r) => r.col === 'project_id')
    const createdByFk = refs.find((r) => r.col === 'created_by')
    expect(projectFk!.table).toBe(projects)
    expect(projectFk!.onDelete).toBe('cascade')
    expect(createdByFk!.table).toBe(users)
  })
})

describe('db/schema assessmentVersions table', () => {
  it('has a unique index on instance + version', () => {
    const config = getTableConfig(assessmentVersions)
    expect(config.name).toBe('assessment_versions')
    const uniqueIdx = config.indexes.find(
      (i) => i.config.name === 'assessment_version_unique',
    )
    expect(uniqueIdx).toBeDefined()
    expect(uniqueIdx!.config.unique).toBe(true)
    expect(uniqueIdx!.config.columns.map((c: any) => c.name)).toEqual([
      'assessment_instance_id',
      'version',
    ])
  })

  it('cascade-deletes against the assessment instance', () => {
    const config = getTableConfig(assessmentVersions)
    const instanceFk = config.foreignKeys
      .map((fk) => ({ ref: fk.reference(), onDelete: fk.onDelete }))
      .find((x) => x.ref.columns[0].name === 'assessment_instance_id')
    expect(instanceFk!.ref.foreignTable).toBe(assessmentInstances)
    expect(instanceFk!.onDelete).toBe('cascade')
  })
})

describe('db/schema assessmentEdits table', () => {
  it('indexes edits by version and cascade-deletes with the version', () => {
    const config = getTableConfig(assessmentEdits)
    expect(config.name).toBe('assessment_edits')
    expect(config.indexes.map((i) => i.config.name)).toContain(
      'assessment_edits_version_idx',
    )
    const versionFk = config.foreignKeys
      .map((fk) => ({ ref: fk.reference(), onDelete: fk.onDelete }))
      .find((x) => x.ref.columns[0].name === 'assessment_version_id')
    expect(versionFk!.ref.foreignTable).toBe(assessmentVersions)
    expect(versionFk!.onDelete).toBe('cascade')
  })

  it('references the editing user via edited_by', () => {
    const config = getTableConfig(assessmentEdits)
    const editedByFk = config.foreignKeys
      .map((fk) => fk.reference())
      .find((r) => r.columns[0].name === 'edited_by')
    expect(editedByFk!.foreignTable).toBe(users)
  })
})

describe('db/schema comments table', () => {
  it('has both polling and parent indexes', () => {
    const config = getTableConfig(comments)
    expect(config.name).toBe('comments')
    const idxNames = config.indexes.map((i) => i.config.name)
    expect(idxNames).toContain('comments_assessment_updated_idx')
    expect(idxNames).toContain('comments_parent_idx')
  })

  it('cascade-deletes with the instance and references author + resolver', () => {
    const config = getTableConfig(comments)
    const refs = config.foreignKeys.map((fk) => {
      const r = fk.reference()
      return { col: r.columns[0].name, table: r.foreignTable, onDelete: fk.onDelete }
    })
    const instanceFk = refs.find((r) => r.col === 'assessment_instance_id')
    const authorFk = refs.find((r) => r.col === 'author_id')
    const resolvedByFk = refs.find((r) => r.col === 'resolved_by')
    expect(instanceFk!.table).toBe(assessmentInstances)
    expect(instanceFk!.onDelete).toBe('cascade')
    expect(authorFk!.table).toBe(users)
    expect(resolvedByFk!.table).toBe(users)
  })
})

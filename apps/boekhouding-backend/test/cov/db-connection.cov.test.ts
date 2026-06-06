import { describe, it, expect } from 'vitest'
import { db } from '../../src/db/connection.js'
import { assessmentInstances } from '../../src/db/schema.js'

describe('db/connection', () => {
  it('exports a drizzle instance', () => {
    expect(db).toBeDefined()
    expect(typeof db).toBe('object')
  })

  it('is bound to the application schema', () => {
    expect(db.query).toBeDefined()
    expect(db.query.assessmentInstances).toBeDefined()
  })

  it('can build a SQL query against a schema table', () => {
    const { sql } = db.select().from(assessmentInstances).toSQL()
    expect(sql).toContain('assessment_instances')
  })
})

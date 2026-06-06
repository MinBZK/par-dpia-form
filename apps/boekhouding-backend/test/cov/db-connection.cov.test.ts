// Coverage test for src/db/connection.ts.
//
// connection.ts is a pure module: it builds a postgres-js client from
// config.databaseUrl and wraps it in a drizzle instance bound to the schema.
// There are no branches or functions of its own — importing the module
// executes every line. These assertions verify the exported `db` is a usable,
// schema-bound drizzle instance.
import { describe, it, expect } from 'vitest'
import { db } from '../../src/db/connection.js'
import { assessmentInstances } from '../../src/db/schema.js'

describe('db/connection', () => {
  it('exports a drizzle instance', () => {
    expect(db).toBeDefined()
    expect(typeof db).toBe('object')
  })

  it('is bound to the application schema', () => {
    // The schema passed to drizzle is exposed on the query namespace, proving
    // the `{ schema }` option in connection.ts was applied.
    expect(db.query).toBeDefined()
    expect(db.query.assessmentInstances).toBeDefined()
  })

  it('can build a SQL query against a schema table', () => {
    // Exercises the drizzle query builder end-to-end without touching the DB:
    // toSQL() compiles to parameterised SQL, confirming the client + schema
    // were wired correctly in connection.ts.
    const { sql } = db.select().from(assessmentInstances).toSQL()
    expect(sql).toContain('assessment_instances')
  })
})

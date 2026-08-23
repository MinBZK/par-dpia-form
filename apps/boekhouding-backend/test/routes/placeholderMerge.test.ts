// Folding an unclaimed invite placeholder into an existing account (#471).
//
// Adding someone to a project keys a users row by email address; they are linked
// to it on first login. Change that address at the identity provider, get added
// on the NEW one before the sync catches up, and one person has two rows. The
// email sync then refuses to move the address, so the project never appears.
//
// These run the real app and requireAuth against a real Postgres test DB, with
// real JWTs signed by the loopback JWKS.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { and, eq } from 'drizzle-orm'
import { buildApp } from '../../src/app.js'
import { db } from '../../src/db/connection.js'
import { projectMembers, users } from '../../src/db/schema.js'
import { getJwks } from '../helpers/testContext.js'
import { truncateAll } from '../helpers/testDb.js'
import { createUser, createProject, addMember } from '../helpers/fixtures.js'
import { userIdCache } from '../../src/utils/userIdCache.js'

let app: FastifyInstance
const jwks = getJwks()

async function login(sub: string, email: string) {
  const token = await jwks.signToken({ sub, email })
  return app.inject({ method: 'GET', url: '/api/v1/projects', headers: { authorization: `Bearer ${token}` } })
}

beforeAll(async () => {
  app = await buildApp({ logger: false })
  await app.ready()
})

afterAll(async () => {
  await app.close()
})

beforeEach(async () => {
  await truncateAll(process.env.DATABASE_SERVER_FULL!)
  userIdCache.clear()
})

describe('invite placeholder merge', () => {
  it('moves the memberships over and drops the placeholder', async () => {
    const user = await createUser({ email: 'oud@example.com' })
    const owner = await createUser()
    const project = await createProject(owner.id)
    await addMember(project.id, owner.id, 'owner')

    // Being added on the new address made a placeholder: no oidcSub.
    const [placeholder] = await db.insert(users)
      .values({ email: 'nieuw@example.com', displayName: 'nieuw@example.com' })
      .returning()
    await addMember(project.id, placeholder.id, 'editor')

    const res = await login(user.oidcSub!, 'nieuw@example.com')
    expect(res.statusCode).toBe(200)

    // One row left, on the new address.
    const rows = await db.select().from(users).where(eq(users.email, 'nieuw@example.com'))
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe(user.id)
    expect(await db.select().from(users).where(eq(users.id, placeholder.id))).toHaveLength(0)

    // And the project is theirs to open.
    const [member] = await db.select().from(projectMembers)
      .where(and(eq(projectMembers.projectId, project.id), eq(projectMembers.userId, user.id)))
    expect(member.role).toBe('editor')
  })

  it('keeps the role the account already had rather than the one it was added with', async () => {
    const user = await createUser({ email: 'oud@example.com' })
    const project = await createProject(user.id)
    await addMember(project.id, user.id, 'viewer')

    const [placeholder] = await db.insert(users)
      .values({ email: 'nieuw@example.com', displayName: 'nieuw@example.com' })
      .returning()
    await addMember(project.id, placeholder.id, 'owner')

    expect((await login(user.oidcSub!, 'nieuw@example.com')).statusCode).toBe(200)

    // An address collision must not hand anyone a higher role.
    const members = await db.select().from(projectMembers)
      .where(eq(projectMembers.projectId, project.id))
    expect(members).toHaveLength(1)
    expect(members[0].userId).toBe(user.id)
    expect(members[0].role).toBe('viewer')
  })

  it('leaves a claimed row alone, because that is a different person', async () => {
    const user = await createUser({ email: 'oud@example.com' })
    const other = await createUser({ email: 'nieuw@example.com' })

    expect((await login(user.oidcSub!, 'nieuw@example.com')).statusCode).toBe(200)

    // Both accounts intact, and the address did not move.
    const [mine] = await db.select().from(users).where(eq(users.id, user.id))
    expect(mine.email).toBe('oud@example.com')
    const [theirs] = await db.select().from(users).where(eq(users.id, other.id))
    expect(theirs.oidcSub).toBe(other.oidcSub)
  })
})

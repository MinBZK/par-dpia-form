import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../../src/db/connection.js'
import { projectMembers, users } from '../../src/db/schema.js'
import { truncateAll } from '../helpers/testDb.js'
import { createUser, createProject, addMember } from '../helpers/fixtures.js'
import { mergeInvitePlaceholder } from '../../src/utils/mergePlaceholder.js'

beforeEach(async () => {
  await truncateAll(process.env.DATABASE_SERVER_FULL!)
})

describe('mergeInvitePlaceholder', () => {
  it('refuses a row that has been claimed since the caller read it', async () => {
    const user = await createUser()
    const claimed = await createUser()

    expect(await mergeInvitePlaceholder(claimed.id, user.id)).toBe(false)

    // Both rows survive: a claimed row is a different person.
    expect(await db.select().from(users).where(eq(users.id, claimed.id))).toHaveLength(1)
  })

  it('refuses a row that no longer exists', async () => {
    const user = await createUser()
    expect(await mergeInvitePlaceholder(user.id, user.id)).toBe(false)
  })

  it('moves memberships and removes the placeholder', async () => {
    const user = await createUser()
    const project = await createProject(user.id)
    const [placeholder] = await db.insert(users)
      .values({ email: 'uitgenodigd@example.com', displayName: 'uitgenodigd@example.com' })
      .returning()
    await addMember(project.id, placeholder.id, 'commenter')

    expect(await mergeInvitePlaceholder(placeholder.id, user.id)).toBe(true)

    const members = await db.select().from(projectMembers).where(eq(projectMembers.projectId, project.id))
    expect(members).toHaveLength(1)
    expect(members[0].userId).toBe(user.id)
    expect(members[0].role).toBe('commenter')
    expect(await db.select().from(users).where(eq(users.id, placeholder.id))).toHaveLength(0)
  })
})

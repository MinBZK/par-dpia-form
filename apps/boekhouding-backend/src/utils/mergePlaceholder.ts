import { and, eq, isNull, notExists, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '../db/connection.js'
import { projectMembers, users } from '../db/schema.js'

/**
 * Fold an unclaimed invite placeholder into an existing account.
 *
 * Adding someone to a project creates a users row keyed only by their email
 * address; they are linked to it the first time they log in. Change that
 * address at the identity provider, get added on the new one before the sync
 * catches up, and one person ends up with two rows: their account on the old
 * address and a placeholder on the new one. The email sync then refuses to move
 * the address (the unique constraint would reject it), so the placeholder stays
 * orphaned and the project never shows up for them.
 *
 * A placeholder has never logged in, so project_members is the only table that
 * can reference it. Should that ever stop being true, the delete hits a foreign
 * key with no cascade, the transaction rolls back, and the caller keeps the old
 * behaviour of leaving the address alone.
 *
 * Memberships the account already has are left alone rather than overwritten:
 * an address collision is an administrative accident and must not hand anyone a
 * higher role than they had. The placeholder's own rows for those projects go
 * with it on delete, through the cascade on project_members.user_id.
 *
 * Returns false when the row was claimed between the caller's read and this
 * lock, in which case it is someone else's account and nothing is merged.
 */
export async function mergeInvitePlaceholder(placeholderId: string, userId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [locked] = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, placeholderId), isNull(users.oidcSub)))
      .for('update')
      .limit(1)
    if (!locked) return false

    const existing = alias(projectMembers, 'existing')
    await tx
      .update(projectMembers)
      .set({ userId })
      .where(and(
        eq(projectMembers.userId, placeholderId),
        notExists(
          tx
            .select({ one: sql`1` })
            .from(existing)
            .where(and(
              eq(existing.projectId, projectMembers.projectId),
              eq(existing.userId, userId),
            )),
        ),
      ))

    await tx.delete(users).where(eq(users.id, placeholderId))
    return true
  })
}

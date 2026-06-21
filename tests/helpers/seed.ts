import { dbFirst } from '../../src/lib/db/client';
import { createOrganizationWithOwner, markEmailVerified, signupUser } from '../../src/lib/services/auth';

export async function createVerifiedUser(db: D1Database, payload: { fullName: string; email: string }) {
  const user = await signupUser(db, {
    fullName: payload.fullName,
    email: payload.email,
    password: 'password-aman-123',
  });
  await markEmailVerified(db, user.id);
  return user;
}

export async function createOwnedOrganization(
  db: D1Database,
  payload: { ownerName: string; ownerEmail: string; organizationName: string; organizationSlug: string }
) {
  const owner = await createVerifiedUser(db, { fullName: payload.ownerName, email: payload.ownerEmail });
  const organization = await createOrganizationWithOwner(db, {
    name: payload.organizationName,
    slug: payload.organizationSlug,
    ownerUserId: owner.id,
    ownerFullName: owner.full_name,
  });
  const membership = await dbFirst<{ id: string }>(
    db,
    `select id from organization_members where organization_id = ? and user_id = ?`,
    [organization.organizationId, owner.id]
  );
  return { owner, organization, membershipId: membership?.id ?? null };
}


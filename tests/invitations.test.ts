import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TestD1 } from './helpers/d1';
import { createTestD1 } from './helpers/d1';
import { dbFirst } from '../src/lib/db/client';
import { acceptInvitation, cancelInvitation, createInvitation, resendInvitation } from '../src/lib/services/members';
import { createOwnedOrganization } from './helpers/seed';
import { sha256Hex } from '../src/lib/utils/crypto';
import { markEmailVerified, signupUser } from '../src/lib/services/auth';

describe('invitation lifecycle', () => {
  let testD1: TestD1;

  beforeEach(async () => { testD1 = await createTestD1(); });
  afterEach(async () => { await testD1?.dispose(); });

  it('resends only a pending invitation and invalidates the previous token', async () => {
    const organization = await createOwnedOrganization(testD1.db, {
      ownerName: 'Invitation Owner',
      ownerEmail: 'owner@invites.test',
      organizationName: 'Invitation Org',
      organizationSlug: 'invitation-org',
    });
    const created = await createInvitation(testD1.db, {
      organizationId: organization.organization.organizationId,
      email: 'new-member@invites.test',
      role: 'member',
      invitedByMemberId: organization.membershipId,
      actorUserId: organization.owner.id,
      actorMemberId: organization.membershipId,
    });

    const resent = await resendInvitation(testD1.db, {
      organizationId: organization.organization.organizationId,
      invitationId: created.invitation.id,
      actorUserId: organization.owner.id,
      actorMemberId: organization.membershipId,
    });
    expect(resent.inviteToken).not.toBe(created.inviteToken);
    expect(resent.invitation.status).toBe('invited');
    expect(resent.invitation.token_hash).toBe(await sha256Hex(resent.inviteToken));
    expect(resent.invitation.token_hash).not.toBe(created.invitation.token_hash);

    await expect(resendInvitation(testD1.db, {
      organizationId: 'other-org',
      invitationId: created.invitation.id,
      actorUserId: organization.owner.id,
      actorMemberId: organization.membershipId,
    })).rejects.toThrow('Undangan pending tidak ditemukan');
  });

  it('cancels a pending invitation without deleting its audit history', async () => {
    const organization = await createOwnedOrganization(testD1.db, {
      ownerName: 'Cancel Owner',
      ownerEmail: 'owner@cancel-invites.test',
      organizationName: 'Cancel Org',
      organizationSlug: 'cancel-org',
    });
    const created = await createInvitation(testD1.db, {
      organizationId: organization.organization.organizationId,
      email: 'cancel@invites.test',
      role: 'viewer',
      invitedByMemberId: organization.membershipId,
      actorUserId: organization.owner.id,
      actorMemberId: organization.membershipId,
    });

    const cancelled = await cancelInvitation(testD1.db, {
      organizationId: organization.organization.organizationId,
      invitationId: created.invitation.id,
      actorUserId: organization.owner.id,
      actorMemberId: organization.membershipId,
    });
    expect(cancelled.status).toBe('inactive');
    expect(await dbFirst<{ status: string; accepted_at: string | null }>(testD1.db, `select status, accepted_at from organization_members where id = ? and organization_id = ?`, [created.invitation.id, organization.organization.organizationId])).toMatchObject({ status: 'inactive', accepted_at: null });
    expect(await dbFirst<{ count: number }>(testD1.db, `select count(*) as count from audit_logs where organization_id = ? and action = 'invitation.cancelled' and entity_id = ?`, [organization.organization.organizationId, created.invitation.id])).toEqual({ count: 1 });
    await expect(cancelInvitation(testD1.db, {
      organizationId: organization.organization.organizationId,
      invitationId: created.invitation.id,
      actorUserId: organization.owner.id,
      actorMemberId: organization.membershipId,
    })).rejects.toThrow('sudah dibatalkan');
  });

  it('claims the placeholder user when the invitee signs up and accepts', async () => {
    const organization = await createOwnedOrganization(testD1.db, {
      ownerName: 'Claim Owner',
      ownerEmail: 'owner@claim-invites.test',
      organizationName: 'Claim Org',
      organizationSlug: 'claim-org',
    });
    const created = await createInvitation(testD1.db, {
      organizationId: organization.organization.organizationId,
      email: 'new-user@claim-invites.test',
      role: 'member',
      invitedByMemberId: organization.membershipId,
      actorUserId: organization.owner.id,
      actorMemberId: organization.membershipId,
    });
    const user = await signupUser(testD1.db, { fullName: 'New User', email: 'new-user@claim-invites.test', password: 'password-aman-123' });
    await markEmailVerified(testD1.db, user.id);
    const accepted = await acceptInvitation(testD1.db, { inviteToken: created.inviteToken, userId: user.id, userEmail: user.email });
    expect(accepted).toEqual({ organizationId: organization.organization.organizationId, role: 'member' });
    expect(await dbFirst<{ status: string; accepted_at: string | null; is_placeholder: number }>(testD1.db, `select om.status, om.accepted_at, u.is_placeholder from organization_members om join users u on u.id = om.user_id where om.id = ?`, [created.invitation.id])).toMatchObject({ status: 'active', is_placeholder: 0 });
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TestD1 } from './helpers/d1';
import { createTestD1 } from './helpers/d1';
import { dbFirst } from '../src/lib/db/client';
import { cancelInvitation, createInvitation, resendInvitation } from '../src/lib/services/members';
import { createOwnedOrganization } from './helpers/seed';
import { sha256Hex } from '../src/lib/utils/crypto';

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
    expect(resent.invitation.status).toBe('pending');
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
    expect(cancelled.status).toBe('revoked');
    expect(await dbFirst<{ status: string }>(testD1.db, `select status from invitations where id = ? and organization_id = ?`, [created.invitation.id, organization.organization.organizationId])).toEqual({ status: 'revoked' });
    expect(await dbFirst<{ count: number }>(testD1.db, `select count(*) as count from audit_logs where organization_id = ? and action = 'invitation.cancelled' and entity_id = ?`, [organization.organization.organizationId, created.invitation.id])).toEqual({ count: 1 });
    await expect(cancelInvitation(testD1.db, {
      organizationId: organization.organization.organizationId,
      invitationId: created.invitation.id,
      actorUserId: organization.owner.id,
      actorMemberId: organization.membershipId,
    })).rejects.toThrow('sudah dibatalkan');
  });
});

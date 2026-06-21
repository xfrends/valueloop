import { dbAll, dbFirst, dbRun } from '../db/client';
import { isoNow } from '../utils/date';
import { randomId, randomToken, sha256Hex } from '../utils/crypto';
import { assertOrganizationOwnerSlotAvailable, getActiveMemberCount, getPlanLimits, writeAuditLog } from './shared';
import type { OrganizationRole } from '../permissions';

export type OrganizationMemberRow = {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrganizationRole;
  status: 'active' | 'invited' | 'inactive';
  joined_at: string | null;
  created_at: string;
  updated_at: string;
  full_name: string;
  email: string;
  team_names: string | null;
};

export type InvitationRow = {
  id: string;
  organization_id: string;
  email: string;
  role: OrganizationRole;
  token_hash: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  expires_at: string;
  invited_by_member_id: string | null;
  created_at: string;
};

export type TeamRow = {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
  member_count: number;
};

export type AuditLogRow = {
  id: string;
  organization_id: string;
  actor_user_id: string | null;
  actor_member_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before_value: string | null;
  after_value: string | null;
  created_at: string;
  actor_name: string | null;
};

export async function listOrganizationMembers(db: D1Database, organizationId: string): Promise<OrganizationMemberRow[]> {
  return dbAll(
    db,
    `select
       om.*,
       u.full_name,
       u.email,
       (
         select group_concat(t.name, ', ')
         from team_members tm
         join teams t on t.id = tm.team_id
         where tm.organization_member_id = om.id and tm.organization_id = om.organization_id
       ) as team_names
     from organization_members om
     join users u on u.id = om.user_id
     where om.organization_id = ?
     order by om.status asc, om.role asc, u.full_name asc`,
    [organizationId]
  );
}

export async function listTeams(db: D1Database, organizationId: string): Promise<TeamRow[]> {
  return dbAll(
    db,
    `select
       t.*,
       count(tm.id) as member_count
     from teams t
     left join team_members tm on tm.team_id = t.id and tm.organization_id = t.organization_id
     where t.organization_id = ?
     group by t.id
     order by t.is_active desc, t.name asc`,
    [organizationId]
  );
}

export async function listInvitations(db: D1Database, organizationId: string): Promise<InvitationRow[]> {
  return dbAll(
    db,
    `select * from invitations where organization_id = ? order by created_at desc`,
    [organizationId]
  );
}

export async function listAuditLogs(db: D1Database, organizationId: string, limit = 50, offset = 0): Promise<AuditLogRow[]> {
  return dbAll(
    db,
    `select
       al.*,
       u.full_name as actor_name
     from audit_logs al
     left join users u on u.id = al.actor_user_id
     where al.organization_id = ?
     order by al.created_at desc
     limit ? offset ?`,
    [organizationId, limit, offset]
  );
}

export async function createTeam(
  db: D1Database,
  payload: {
    organizationId: string;
    actorUserId: string | null;
    actorMemberId: string | null;
    name: string;
    description?: string;
    isActive?: number;
  }
): Promise<TeamRow> {
  const id = randomId();
  await dbRun(
    db,
    `insert into teams (id, organization_id, name, description, is_active, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?)`,
    [id, payload.organizationId, payload.name.trim(), payload.description || '', payload.isActive ?? 1, isoNow(), isoNow()]
  );
  const row = await dbFirst<TeamRow>(
    db,
    `select t.*, 0 as member_count from teams t where t.id = ? and t.organization_id = ?`,
    [id, payload.organizationId]
  );
  await writeAuditLog(db, {
    organizationId: payload.organizationId,
    actorUserId: payload.actorUserId,
    actorMemberId: payload.actorMemberId,
    action: 'team.created',
    entityType: 'team',
    entityId: id,
    afterValue: row,
  });
  return row as TeamRow;
}

export async function updateTeam(
  db: D1Database,
  payload: {
    organizationId: string;
    teamId: string;
    actorUserId: string | null;
    actorMemberId: string | null;
    patch: Partial<{ name: string; description: string; isActive: number }>;
  }
): Promise<TeamRow> {
  const before = await dbFirst<TeamRow>(
    db,
    `select t.*, 0 as member_count from teams t where t.id = ? and t.organization_id = ?`,
    [payload.teamId, payload.organizationId]
  );
  if (!before) {
    throw new Error('Tim tidak ditemukan.');
  }

  await dbRun(
    db,
    `update teams set name = ?, description = ?, is_active = ?, updated_at = ? where id = ? and organization_id = ?`,
    [
      payload.patch.name ?? before.name,
      payload.patch.description ?? before.description,
      payload.patch.isActive ?? before.is_active,
      isoNow(),
      payload.teamId,
      payload.organizationId,
    ]
  );

  const after = await dbFirst<TeamRow>(
    db,
    `select t.*, (
       select count(*) from team_members tm where tm.team_id = t.id and tm.organization_id = t.organization_id
     ) as member_count
     from teams t where t.id = ? and t.organization_id = ?`,
    [payload.teamId, payload.organizationId]
  );

  await writeAuditLog(db, {
    organizationId: payload.organizationId,
    actorUserId: payload.actorUserId,
    actorMemberId: payload.actorMemberId,
    action: 'team.updated',
    entityType: 'team',
    entityId: payload.teamId,
    beforeValue: before,
    afterValue: after,
  });

  return after as TeamRow;
}

async function assertTeamInOrganization(db: D1Database, organizationId: string, teamId: string): Promise<void> {
  const team = await dbFirst<{ id: string }>(
    db,
    `select id from teams where id = ? and organization_id = ? limit 1`,
    [teamId, organizationId]
  );
  if (!team) {
    throw new Error('Tim tidak ditemukan.');
  }
}

async function assertActiveMemberInOrganization(db: D1Database, organizationId: string, organizationMemberId: string): Promise<void> {
  const member = await dbFirst<{ id: string }>(
    db,
    `select id from organization_members where id = ? and organization_id = ? and status = 'active' limit 1`,
    [organizationMemberId, organizationId]
  );
  if (!member) {
    throw new Error('Anggota tidak ditemukan.');
  }
}

export async function addMemberToTeam(
  db: D1Database,
  payload: {
    organizationId: string;
    teamId: string;
    organizationMemberId: string;
    actorUserId: string | null;
    actorMemberId: string | null;
  }
): Promise<void> {
  await assertTeamInOrganization(db, payload.organizationId, payload.teamId);
  await assertActiveMemberInOrganization(db, payload.organizationId, payload.organizationMemberId);

  await dbRun(
    db,
    `insert or ignore into team_members (id, organization_id, team_id, organization_member_id, created_at)
     values (?, ?, ?, ?, ?)`,
    [randomId(), payload.organizationId, payload.teamId, payload.organizationMemberId, isoNow()]
  );
  await writeAuditLog(db, {
    organizationId: payload.organizationId,
    actorUserId: payload.actorUserId,
    actorMemberId: payload.actorMemberId,
    action: 'team_member.created',
    entityType: 'team_member',
    entityId: payload.organizationMemberId,
    afterValue: payload,
  });
}

export async function removeMemberFromTeam(
  db: D1Database,
  payload: {
    organizationId: string;
    teamId: string;
    organizationMemberId: string;
    actorUserId: string | null;
    actorMemberId: string | null;
  }
): Promise<void> {
  await assertTeamInOrganization(db, payload.organizationId, payload.teamId);
  await assertActiveMemberInOrganization(db, payload.organizationId, payload.organizationMemberId);

  await dbRun(
    db,
    `delete from team_members where organization_id = ? and team_id = ? and organization_member_id = ?`,
    [payload.organizationId, payload.teamId, payload.organizationMemberId]
  );
  await writeAuditLog(db, {
    organizationId: payload.organizationId,
    actorUserId: payload.actorUserId,
    actorMemberId: payload.actorMemberId,
    action: 'team_member.deleted',
    entityType: 'team_member',
    entityId: payload.organizationMemberId,
    afterValue: payload,
  });
}

export async function createInvitation(
  db: D1Database,
  payload: {
    organizationId: string;
    email: string;
    role: OrganizationRole;
    invitedByMemberId: string | null;
    actorUserId: string | null;
    actorMemberId: string | null;
  }
): Promise<{ invitation: InvitationRow; inviteToken: string }> {
  if (payload.role === 'owner') {
    await assertOrganizationOwnerSlotAvailable(db, payload.organizationId);
  }

  const limits = await getPlanLimits(db, payload.organizationId);
  const maxMembers = Number(limits.maxMembers ?? 0);
  if (maxMembers > 0) {
    const activeMembers = await getActiveMemberCount(db, payload.organizationId);
    const pendingInvites = await dbFirst<{ count: number }>(
      db,
      `select count(*) as count from invitations where organization_id = ? and status = 'pending'`,
      [payload.organizationId]
    );
    if (activeMembers + Number(pendingInvites?.count ?? 0) >= maxMembers) {
      throw new Error('Limit member untuk plan organisasi sudah tercapai.');
    }
  }

  const inviteToken = randomToken(32);
  const tokenHash = await sha256Hex(inviteToken);
  const id = randomId();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();

  await dbRun(
    db,
    `insert into invitations (id, organization_id, email, role, token_hash, status, expires_at, invited_by_member_id, created_at)
     values (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
    [id, payload.organizationId, payload.email.toLowerCase(), payload.role, tokenHash, expiresAt, payload.invitedByMemberId, isoNow()]
  );

  const invitation = await dbFirst<InvitationRow>(db, `select * from invitations where id = ?`, [id]);
  await writeAuditLog(db, {
    organizationId: payload.organizationId,
    actorUserId: payload.actorUserId,
    actorMemberId: payload.actorMemberId,
    action: 'invitation.created',
    entityType: 'invitation',
    entityId: id,
    afterValue: invitation,
  });

  return { invitation: invitation as InvitationRow, inviteToken };
}

export async function acceptInvitation(
  db: D1Database,
  payload: {
    inviteToken: string;
    userId: string;
    userEmail: string;
  }
): Promise<{ organizationId: string; role: OrganizationRole }> {
  const tokenHash = await sha256Hex(payload.inviteToken);
  const invite = await dbFirst<InvitationRow>(
    db,
    `select * from invitations where token_hash = ? and status = 'pending' and expires_at > ? limit 1`,
    [tokenHash, isoNow()]
  );

  if (!invite) {
    throw new Error('Undangan tidak valid atau sudah kedaluwarsa.');
  }

  if (invite.email.toLowerCase() !== payload.userEmail.toLowerCase()) {
    throw new Error('Email akun tidak sesuai dengan undangan.');
  }

  if (invite.role === 'owner') {
    await assertOrganizationOwnerSlotAvailable(db, invite.organization_id);
  }

  const existingMember = await dbFirst<{ id: string; role: OrganizationRole; status: string }>(
    db,
    `select id, role, status from organization_members where organization_id = ? and user_id = ? limit 1`,
    [invite.organization_id, payload.userId]
  );

  if (existingMember) {
    await dbRun(
      db,
      `update organization_members set role = ?, status = 'active', joined_at = coalesce(joined_at, ?), updated_at = ? where id = ?`,
      [invite.role, isoNow(), isoNow(), existingMember.id]
    );
  } else {
    await dbRun(
      db,
      `insert into organization_members (id, organization_id, user_id, role, status, joined_at, created_at, updated_at)
       values (?, ?, ?, ?, 'active', ?, ?, ?)`,
      [randomId(), invite.organization_id, payload.userId, invite.role, isoNow(), isoNow(), isoNow()]
    );
  }

  await dbRun(
    db,
    `update invitations set status = 'accepted' where id = ?`,
    [invite.id]
  );

  await writeAuditLog(db, {
    organizationId: invite.organization_id,
    actorUserId: payload.userId,
    actorMemberId: null,
    action: 'invitation.accepted',
    entityType: 'invitation',
    entityId: invite.id,
    beforeValue: invite,
    afterValue: { ...invite, status: 'accepted' },
  });

  return { organizationId: invite.organization_id, role: invite.role };
}

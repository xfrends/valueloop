import { dbAll, dbFirst, dbRun } from '../db/client';
import { isoNow } from '../utils/date';
import { randomId } from '../utils/crypto';
import {
  assertOrganizationOwnerSlotAvailable,
  assertOrganizationSlugAvailable,
  ensureSubscription,
  getOrganizationSettings,
  normalizeOrganizationSlug,
  upsertOrganizationSettings,
  writeAuditLog,
} from './shared';
import type { OrganizationRole } from '../permissions';

export type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  logo_r2_key: string | null;
  timezone: string;
  default_locale: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export async function listUserOrganizations(db: D1Database, userId: string): Promise<Array<OrganizationRow & { role: OrganizationRole; membership_status: string }>> {
  return dbAll(
    db,
    `select o.*, om.role, om.status as membership_status
     from organization_members om
     join organizations o on o.id = om.organization_id
     where om.user_id = ? and om.status = 'active' and o.status = 'active'
     order by o.name asc`,
    [userId]
  );
}

export async function getOrganizationBySlug(db: D1Database, slug: string): Promise<OrganizationRow | null> {
  return dbFirst<OrganizationRow>(db, `select * from organizations where slug = ? limit 1`, [slug]);
}

export async function getOrganizationById(db: D1Database, organizationId: string): Promise<OrganizationRow | null> {
  return dbFirst<OrganizationRow>(db, `select * from organizations where id = ? limit 1`, [organizationId]);
}

export async function createOrganization(
  db: D1Database,
  payload: { name: string; slug?: string; timezone?: string; defaultLocale?: string }
): Promise<OrganizationRow> {
  const id = randomId();
  const slug = normalizeOrganizationSlug({ name: payload.name, slug: payload.slug });
  await assertOrganizationSlugAvailable(db, slug);
  await dbRun(
    db,
    `insert into organizations (id, name, slug, timezone, default_locale, status, created_at, updated_at)
     values (?, ?, ?, ?, ?, 'active', ?, ?)`,
    [id, payload.name.trim(), slug, payload.timezone || 'Asia/Jakarta', payload.defaultLocale || 'id', isoNow(), isoNow()]
  );
  await ensureSubscription(db, id);
  return (await getOrganizationById(db, id)) as OrganizationRow;
}

export async function switchOrganizationMembership(
  db: D1Database,
  payload: { organizationId: string; userId: string }
): Promise<{ organizationId: string; role: OrganizationRole } | null> {
  const membership = await dbFirst<{ organization_id: string; role: OrganizationRole; status: string }>(
    db,
    `select organization_id, role, status from organization_members where organization_id = ? and user_id = ? limit 1`,
    [payload.organizationId, payload.userId]
  );

  if (!membership || membership.status !== 'active') {
    return null;
  }

  return { organizationId: membership.organization_id, role: membership.role };
}

export async function updateOrganization(
  db: D1Database,
  payload: {
    organizationId: string;
    actorUserId: string | null;
    actorMemberId: string | null;
    name?: string;
    slug?: string;
    timezone?: string;
    defaultLocale?: string;
    logoR2Key?: string | null;
    status?: string;
  }
): Promise<void> {
  const before = await getOrganizationById(db, payload.organizationId);
  if (!before) {
    throw new Error('Organisasi tidak ditemukan.');
  }

  const nextSlug = payload.slug === undefined
    ? before.slug
    : normalizeOrganizationSlug({ name: payload.name ?? before.name, slug: payload.slug });
  if (nextSlug !== before.slug) {
    await assertOrganizationSlugAvailable(db, nextSlug, payload.organizationId);
  }
  await dbRun(
    db,
    `update organizations
     set name = ?, slug = ?, timezone = ?, default_locale = ?, logo_r2_key = ?, status = ?, updated_at = ?
     where id = ?`,
    [
      payload.name?.trim() || before.name,
      nextSlug,
      payload.timezone || before.timezone,
      payload.defaultLocale || before.default_locale,
      payload.logoR2Key === undefined ? before.logo_r2_key : payload.logoR2Key,
      payload.status || before.status,
      isoNow(),
      payload.organizationId,
    ]
  );

  await writeAuditLog(db, {
    organizationId: payload.organizationId,
    actorUserId: payload.actorUserId,
    actorMemberId: payload.actorMemberId,
    action: 'organization.updated',
    entityType: 'organization',
    entityId: payload.organizationId,
    beforeValue: before,
    afterValue: await getOrganizationById(db, payload.organizationId),
  });
}

export async function updateOrganizationSettings(
  db: D1Database,
  payload: {
    organizationId: string;
    actorUserId: string | null;
    actorMemberId: string | null;
    settings: Parameters<typeof upsertOrganizationSettings>[2];
  }
): Promise<void> {
  const before = await getOrganizationSettings(db, payload.organizationId);
  await upsertOrganizationSettings(db, payload.organizationId, payload.settings);
  await writeAuditLog(db, {
    organizationId: payload.organizationId,
    actorUserId: payload.actorUserId,
    actorMemberId: payload.actorMemberId,
    action: 'organization.settings_updated',
    entityType: 'organization_settings',
    entityId: payload.organizationId,
    beforeValue: before,
    afterValue: payload.settings,
  });
}

export async function setOrganizationMemberStatus(
  db: D1Database,
  payload: {
    organizationId: string;
    memberId: string;
    status: 'active' | 'invited' | 'inactive';
    actorUserId: string | null;
    actorMemberId: string | null;
  }
): Promise<void> {
  const before = await dbFirst<{ id: string; status: string; role: string }>(
    db,
    `select id, status, role from organization_members where id = ? and organization_id = ?`,
    [payload.memberId, payload.organizationId]
  );

  if (!before) {
    throw new Error('Anggota tidak ditemukan.');
  }

  await dbRun(
    db,
    `update organization_members set status = ?, updated_at = ? where id = ? and organization_id = ?`,
    [payload.status, isoNow(), payload.memberId, payload.organizationId]
  );

  await writeAuditLog(db, {
    organizationId: payload.organizationId,
    actorUserId: payload.actorUserId,
    actorMemberId: payload.actorMemberId,
    action: 'member.updated',
    entityType: 'organization_member',
    entityId: payload.memberId,
    beforeValue: before,
    afterValue: { ...before, status: payload.status },
  });
}

export async function changeOrganizationMemberRole(
  db: D1Database,
  payload: {
    organizationId: string;
    memberId: string;
    role: OrganizationRole;
    actorUserId: string | null;
    actorMemberId: string | null;
  }
): Promise<void> {
  const before = await dbFirst<{ id: string; status: string; role: string; user_id: string }>(
    db,
    `select om.id, om.status, om.role, om.user_id
     from organization_members om
     where om.id = ? and om.organization_id = ?`,
    [payload.memberId, payload.organizationId]
  );

  if (!before) {
    throw new Error('Anggota tidak ditemukan.');
  }

  if (payload.actorMemberId) {
    const actor = await dbFirst<{ role: OrganizationRole }>(
      db,
      `select role from organization_members where id = ? and organization_id = ? and status = 'active' limit 1`,
      [payload.actorMemberId, payload.organizationId]
    );
    if (!actor) {
      throw new Error('Aktor perubahan role tidak ditemukan.');
    }
    if ((before.role === 'owner' || payload.role === 'owner') && actor.role !== 'owner') {
      throw new Error('Hanya owner yang dapat mengubah kepemilikan organisasi.');
    }
    if (before.role === 'owner' && payload.role !== 'owner') {
      throw new Error('Role owner tidak dapat diturunkan langsung. Gunakan alur transfer ownership.');
    }
  }

  if (payload.role === 'owner') {
    await assertOrganizationOwnerSlotAvailable(db, payload.organizationId, payload.memberId);
  }

  await dbRun(
    db,
    `update organization_members set role = ?, updated_at = ? where id = ? and organization_id = ?`,
    [payload.role, isoNow(), payload.memberId, payload.organizationId]
  );

  await writeAuditLog(db, {
    organizationId: payload.organizationId,
    actorUserId: payload.actorUserId,
    actorMemberId: payload.actorMemberId,
    action: 'member.role_changed',
    entityType: 'organization_member',
    entityId: payload.memberId,
    beforeValue: before,
    afterValue: { ...before, role: payload.role },
  });
}

export async function listPlatformOrganizations(db: D1Database) {
  return dbAll<OrganizationRow & { member_count: number; plan_name: string | null; subscription_status: string | null }>(
    db,
    `select
       o.*,
       count(om.id) as member_count,
       p.name as plan_name,
       s.status as subscription_status
     from organizations o
     left join organization_members om on om.organization_id = o.id
     left join subscriptions s on s.organization_id = o.id
     left join plans p on p.id = s.plan_id
     group by o.id
     order by o.created_at desc`
  );
}

export async function listPlatformPlans(db: D1Database) {
  return dbAll<{
    id: string;
    code: string;
    name: string;
    limits: string;
    features: string;
    is_active: number;
    created_at: string;
    organization_count: number;
  }>(
    db,
    `select
       p.*,
       count(s.id) as organization_count
     from plans p
     left join subscriptions s on s.plan_id = p.id
     group by p.id
     order by p.is_active desc, p.name asc`
  );
}

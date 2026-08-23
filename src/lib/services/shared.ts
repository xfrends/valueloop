import { dbAll, dbFirst, dbRun } from '../db/client';
import { isoNow } from '../utils/date';
import { parseJsonObject, stringifyJson } from '../utils/json';
import type { OrganizationRole } from '../permissions';
import { slugify } from '../utils/slug';
import { createNotificationsForAudit } from '../notifications/service';
import type { OrganizationRealtime } from '../notifications/realtime';

export type OrganizationSettings = {
  challengeFrequency: string;
  questionCooldownDays: number;
  allowMultipleChallengesPerDay: boolean;
  allowSelfScoring: boolean;
  defaultScoreRubric: Array<{ min: number; max: number; label: string }>;
};

export const DEFAULT_ORG_SETTINGS: OrganizationSettings = {
  challengeFrequency: 'daily',
  questionCooldownDays: 14,
  allowMultipleChallengesPerDay: false,
  allowSelfScoring: false,
  defaultScoreRubric: [
    { min: 0, max: 2, label: 'Perlu banyak perbaikan' },
    { min: 3, max: 4, label: 'Masih kurang' },
    { min: 5, max: 6, label: 'Cukup' },
    { min: 7, max: 8, label: 'Baik' },
    { min: 9, max: 10, label: 'Sangat baik' },
  ],
};

export type OrganizationReadiness = {
  activeMembers: number;
  totalValues: number;
  activeValues: number;
  activeQuestions: number;
  activeValuesWithoutQuestions: number;
  totalChallenges: number;
  scoredChallenges: number;
  pendingInvitations: number;
  monthlyChallenges: number;
  maxMembers: number;
  maxActiveValues: number;
  maxChallengesPerMonth: number;
  subscriptionStatus: string | null;
};

export async function getOrganizationReadiness(db: D1Database, organizationId: string): Promise<OrganizationReadiness> {
  const row = await dbFirst<{
    active_members: number;
    total_values: number;
    active_values: number;
    active_questions: number;
    active_values_without_questions: number;
    total_challenges: number;
    scored_challenges: number;
    pending_invitations: number;
    monthly_challenges: number;
    max_members: number | null;
    max_active_values: number | null;
    max_challenges_per_month: number | null;
    subscription_status: string | null;
  }>(
    db,
    `select
       (select count(*) from organization_members where organization_id = ? and status = 'active') as active_members,
       (select count(*) from core_values where organization_id = ?) as total_values,
       (select count(*) from core_values where organization_id = ? and is_active = 1) as active_values,
       (select count(*) from questions where organization_id = ? and is_active = 1) as active_questions,
       (select count(*)
        from core_values cv
        where cv.organization_id = ?
          and cv.is_active = 1
          and not exists (
            select 1 from questions q
            where q.organization_id = cv.organization_id
              and q.core_value_id = cv.id
              and q.is_active = 1
          )) as active_values_without_questions,
       (select count(*) from challenge_sessions where organization_id = ? and status != 'cancelled') as total_challenges,
       (select count(*) from challenge_sessions where organization_id = ? and status = 'scored') as scored_challenges,
       (select count(*) from organization_members where organization_id = ? and status = 'invited' and invite_expires_at > ?) as pending_invitations,
       (select count(*) from challenge_sessions
        where organization_id = ?
          and status != 'cancelled'
          and session_date >= substr(?, 1, 7) || '-01') as monthly_challenges,
       (select json_extract(p.limits, '$.maxMembers')
        from subscriptions s join plans p on p.id = s.plan_id
        where s.organization_id = ? limit 1) as max_members,
       (select json_extract(p.limits, '$.maxActiveValues')
        from subscriptions s join plans p on p.id = s.plan_id
        where s.organization_id = ? limit 1) as max_active_values,
       (select json_extract(p.limits, '$.maxChallengesPerMonth')
        from subscriptions s join plans p on p.id = s.plan_id
        where s.organization_id = ? limit 1) as max_challenges_per_month,
       (select status from subscriptions where organization_id = ? limit 1) as subscription_status`,
    [
      organizationId,
      organizationId,
      organizationId,
      organizationId,
      organizationId,
      organizationId,
      organizationId,
      organizationId,
      isoNow(),
      organizationId,
      isoNow(),
      organizationId,
      organizationId,
      organizationId,
      organizationId,
    ]
  );

  return {
    activeMembers: Number(row?.active_members ?? 0),
    totalValues: Number(row?.total_values ?? 0),
    activeValues: Number(row?.active_values ?? 0),
    activeQuestions: Number(row?.active_questions ?? 0),
    activeValuesWithoutQuestions: Number(row?.active_values_without_questions ?? 0),
    totalChallenges: Number(row?.total_challenges ?? 0),
    scoredChallenges: Number(row?.scored_challenges ?? 0),
    pendingInvitations: Number(row?.pending_invitations ?? 0),
    monthlyChallenges: Number(row?.monthly_challenges ?? 0),
    maxMembers: Number(row?.max_members ?? 0),
    maxActiveValues: Number(row?.max_active_values ?? 0),
    maxChallengesPerMonth: Number(row?.max_challenges_per_month ?? 0),
    subscriptionStatus: row?.subscription_status ?? null,
  };
}

export function normalizeOrganizationSlug(payload: { name: string; slug?: string | null }): string {
  const slug = slugify(payload.slug?.trim() || payload.name);
  if (!slug) {
    throw new Error('Slug organisasi tidak valid.');
  }
  return slug;
}

const ORGANIZATION_SLUG_MAX_LENGTH = 120;

function organizationOwnerCode(ownerUserId: string): string {
  return ownerUserId.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'owner';
}

function appendOrganizationSlugSuffix(baseSlug: string, suffix: string): string {
  const availableBaseLength = Math.max(1, ORGANIZATION_SLUG_MAX_LENGTH - suffix.length - 1);
  const trimmedBase = baseSlug.slice(0, availableBaseLength).replace(/-+$/g, '') || 'organization';
  return `${trimmedBase}-${suffix}`;
}

async function organizationSlugExists(db: D1Database, slug: string): Promise<boolean> {
  const existing = await dbFirst<{ id: string }>(
    db,
    `select id from organizations where slug = ? limit 1`,
    [slug]
  );
  return Boolean(existing);
}

export async function generateOrganizationSlug(
  db: D1Database,
  payload: { name: string; ownerUserId: string }
): Promise<string> {
  const baseSlug = normalizeOrganizationSlug({ name: payload.name }).slice(0, ORGANIZATION_SLUG_MAX_LENGTH);
  if (!(await organizationSlugExists(db, baseSlug))) {
    return baseSlug;
  }

  const ownerCode = organizationOwnerCode(payload.ownerUserId);
  const ownerSlug = appendOrganizationSlugSuffix(baseSlug, ownerCode);
  if (!(await organizationSlugExists(db, ownerSlug))) {
    return ownerSlug;
  }

  for (let sequence = 2; sequence <= 9999; sequence += 1) {
    const candidate = appendOrganizationSlugSuffix(baseSlug, `${ownerCode}-${sequence}`);
    if (!(await organizationSlugExists(db, candidate))) {
      return candidate;
    }
  }

  throw new Error('Slug organisasi unik tidak dapat dibuat. Gunakan nama organisasi yang berbeda.');
}

export async function assertOrganizationSlugAvailable(
  db: D1Database,
  slug: string,
  excludeOrganizationId?: string
): Promise<void> {
  const existing = await dbFirst<{ id: string }>(
    db,
    `select id from organizations
     where slug = ?
       and (? is null or id <> ?)
     limit 1`,
    [slug, excludeOrganizationId ?? null, excludeOrganizationId ?? null]
  );

  if (existing) {
    throw new Error('Slug organisasi sudah digunakan.');
  }
}

export async function assertOrganizationOwnerSlotAvailable(
  db: D1Database,
  organizationId: string,
  excludeMemberId?: string
): Promise<void> {
  const existing = await dbFirst<{ id: string }>(
    db,
    `select id from organization_members
     where organization_id = ?
       and role = 'owner'
       and (? is null or id <> ?)
     limit 1`,
    [organizationId, excludeMemberId ?? null, excludeMemberId ?? null]
  );

  if (existing) {
    throw new Error('Setiap organisasi hanya boleh memiliki satu owner aktif.');
  }
}

export async function getOrganizationSettings(db: D1Database, organizationId: string): Promise<OrganizationSettings> {
  const row = await dbFirst<{ settings: string }>(
    db,
    `select settings from organization_settings where organization_id = ?`,
    [organizationId]
  );

  if (!row) {
    await dbRun(
      db,
      `insert into organization_settings (organization_id, settings, updated_at) values (?, ?, ?)`,
      [organizationId, stringifyJson(DEFAULT_ORG_SETTINGS), isoNow()]
    );
    return DEFAULT_ORG_SETTINGS;
  }

  const parsed = JSON.parse(row.settings) as Partial<OrganizationSettings>;
  return {
    ...DEFAULT_ORG_SETTINGS,
    ...parsed,
    defaultScoreRubric: Array.isArray(parsed.defaultScoreRubric) ? parsed.defaultScoreRubric : DEFAULT_ORG_SETTINGS.defaultScoreRubric,
  };
}

export async function upsertOrganizationSettings(
  db: D1Database,
  organizationId: string,
  settings: OrganizationSettings
): Promise<void> {
  await dbRun(
    db,
    `insert into organization_settings (organization_id, settings, updated_at)
     values (?, ?, ?)
     on conflict(organization_id) do update set settings = excluded.settings, updated_at = excluded.updated_at`,
    [organizationId, stringifyJson(settings), isoNow()]
  );
}

export async function writeAuditLog(
  db: D1Database,
  payload: {
    organizationId: string;
    actorUserId: string | null;
    actorMemberId: string | null;
    action: string;
    entityType: string;
    entityId: string | null;
    beforeValue?: unknown;
    afterValue?: unknown;
    realtime?: DurableObjectNamespace<OrganizationRealtime>;
  }
): Promise<void> {
  const auditId = crypto.randomUUID();
  await dbRun(
    db,
    `insert into audit_logs (id, organization_id, actor_user_id, actor_member_id, action, entity_type, entity_id, before_value, after_value, created_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      auditId,
      payload.organizationId,
      payload.actorUserId,
      payload.actorMemberId,
      payload.action,
      payload.entityType,
      payload.entityId,
      payload.beforeValue === undefined ? null : stringifyJson(payload.beforeValue),
      payload.afterValue === undefined ? null : stringifyJson(payload.afterValue),
      isoNow(),
    ]
  );
  await createNotificationsForAudit(db, {
    sourceEventId: auditId,
    organizationId: payload.organizationId,
    actorMemberId: payload.actorMemberId,
    action: payload.action,
    entityType: payload.entityType,
    entityId: payload.entityId,
    beforeValue: payload.beforeValue,
    afterValue: payload.afterValue,
  }, payload.realtime);
}

export async function getPlanFeatures(db: D1Database, organizationId: string): Promise<Record<string, unknown>> {
  const row = await dbFirst<{ features: string; limits: string }>(
    db,
    `select p.features, p.limits
     from subscriptions s
     join plans p on p.id = s.plan_id
     where s.organization_id = ? and p.is_active = 1
     limit 1`,
    [organizationId]
  );

  if (!row) {
    return {};
  }

  return JSON.parse(row.features || '{}') as Record<string, unknown>;
}

export async function getPlanLimits(db: D1Database, organizationId: string): Promise<Record<string, number>> {
  const row = await dbFirst<{ limits: string }>(
    db,
    `select p.limits
     from subscriptions s
     join plans p on p.id = s.plan_id
     where s.organization_id = ? and p.is_active = 1
     limit 1`,
    [organizationId]
  );

  if (!row) {
    return {};
  }

  return JSON.parse(row.limits || '{}') as Record<string, number>;
}

export type OrganizationPlanSummary = {
  subscription_id: string | null;
  subscription_status: string | null;
  plan_id: string | null;
  plan_code: string;
  plan_name: string;
  limits: Record<string, number>;
  features: Record<string, unknown>;
};

export type PlanCatalogItem = {
  id: string;
  code: string;
  name: string;
  limits: Record<string, number>;
  features: Record<string, unknown>;
  available: boolean;
};

export async function listPlanCatalog(db: D1Database): Promise<PlanCatalogItem[]> {
  const rows = await dbAll<{
    id: string;
    code: string;
    name: string;
    limits: string;
    features: string;
    is_active: number;
  }>(
    db,
    `select id, code, name, limits, features, is_active
     from plans
     order by case when code = 'free' then 0 else 1 end, name asc`
  );

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    limits: parseJsonObject(row.limits, {}) as Record<string, number>,
    features: parseJsonObject(row.features, {}),
    available: row.code === 'free' && row.is_active === 1,
  }));
}

export async function getOrganizationPlanSummary(db: D1Database, organizationId: string): Promise<OrganizationPlanSummary> {
  await ensureSubscription(db, organizationId);

  const row = await dbFirst<{
    subscription_id: string | null;
    subscription_status: string | null;
    plan_id: string | null;
    plan_code: string | null;
    plan_name: string | null;
    limits: string | null;
    features: string | null;
  }>(
    db,
    `select
       s.id as subscription_id,
       s.status as subscription_status,
       p.id as plan_id,
       p.code as plan_code,
       p.name as plan_name,
       p.limits,
       p.features
     from subscriptions s
     join plans p on p.id = s.plan_id
     where s.organization_id = ?
     limit 1`,
    [organizationId]
  );

  return {
    subscription_id: row?.subscription_id ?? null,
    subscription_status: row?.subscription_status ?? 'active',
    plan_id: row?.plan_id ?? null,
    plan_code: row?.plan_code ?? 'free',
    plan_name: row?.plan_name ?? 'Free',
    limits: JSON.parse(row?.limits || '{}') as Record<string, number>,
    features: JSON.parse(row?.features || '{}') as Record<string, unknown>,
  };
}

export async function ensureSubscription(db: D1Database, organizationId: string): Promise<void> {
  const existing = await dbFirst<{ id: string }>(
    db,
    `select id from subscriptions where organization_id = ?`,
    [organizationId]
  );

  if (existing) {
    return;
  }

  const plan = await dbFirst<{ id: string }>(db, `select id from plans where code = 'free' and is_active = 1 limit 1`);
  if (!plan) {
    return;
  }

  await dbRun(
    db,
    `insert into subscriptions (id, organization_id, plan_id, status, created_at, updated_at)
     values (?, ?, ?, 'trialing', ?, ?)`,
    [crypto.randomUUID(), organizationId, plan.id, isoNow(), isoNow()]
  );
}

export async function getActiveMemberCount(db: D1Database, organizationId: string): Promise<number> {
  const row = await dbFirst<{ count: number }>(
    db,
    `select count(*) as count from organization_members where organization_id = ? and status = 'active'`,
    [organizationId]
  );
  return Number(row?.count ?? 0);
}

export function defaultOrganizationRole(): OrganizationRole {
  return 'member';
}

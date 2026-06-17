import { dbFirst, dbRun } from '../db/client';
import { isoNow } from '../utils/date';
import { stringifyJson } from '../utils/json';
import type { OrganizationRole } from '../permissions';

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
  }
): Promise<void> {
  await dbRun(
    db,
    `insert into audit_logs (id, organization_id, actor_user_id, actor_member_id, action, entity_type, entity_id, before_value, after_value, created_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
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

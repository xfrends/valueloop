import { dbAll, dbFirst, dbRun } from '../db/client';
import { isoNow } from '../utils/date';
import { parseJsonArray, stringifyJson } from '../utils/json';
import { randomId } from '../utils/crypto';
import { getPlanLimits, writeAuditLog } from './shared';

function normalizeColor(color: string | undefined): string {
  if (!color) {
    return '#2563EB';
  }

  if (color.startsWith('#')) {
    return color;
  }

  const map: Record<string, string> = {
    blue: '#2563EB',
    emerald: '#10B981',
    amber: '#F59E0B',
    purple: '#8B5CF6',
    rose: '#F43F5E',
    slate: '#64748B',
  };

  return map[color] || '#2563EB';
}

export type CoreValueRow = {
  id: string;
  organization_id: string;
  name: string;
  short_description: string;
  description: string | null;
  expected_behaviors: string;
  anti_patterns: string;
  example: string | null;
  color: string;
  icon_name: string;
  sort_order: number;
  is_active: number;
  created_at: string;
  updated_at: string;
};

export type CoreValueActivationReadiness = {
  ready: boolean;
  missingRequirements: string[];
  activeQuestions: number;
};

async function resolveCoreValueActivationReadiness(
  db: D1Database,
  organizationId: string,
  valueId: string,
  value: Pick<CoreValueRow, 'name' | 'short_description' | 'description' | 'expected_behaviors' | 'anti_patterns' | 'example' | 'color' | 'icon_name'>
): Promise<CoreValueActivationReadiness> {
  const missingRequirements: string[] = [];
  if (!value.name.trim()) missingRequirements.push('nama');
  if (!value.short_description.trim()) missingRequirements.push('deskripsi singkat');
  if (!value.description?.trim()) missingRequirements.push('deskripsi lengkap');
  if (parseJsonArray(value.expected_behaviors).length === 0) missingRequirements.push('expected behaviors');
  if (parseJsonArray(value.anti_patterns).length === 0) missingRequirements.push('anti-patterns');
  if (!value.example?.trim()) missingRequirements.push('contoh penerapan');
  if (!value.color.trim()) missingRequirements.push('warna');
  if (!value.icon_name.trim()) missingRequirements.push('ikon');

  const questionCount = await dbFirst<{ count: number }>(
    db,
    `select count(*) as count from questions where organization_id = ? and core_value_id = ? and is_active = 1`,
    [organizationId, valueId]
  );
  const activeQuestions = Number(questionCount?.count ?? 0);
  if (activeQuestions === 0) missingRequirements.push('minimal satu question aktif');

  return { ready: missingRequirements.length === 0, missingRequirements, activeQuestions };
}

export async function getCoreValueActivationReadiness(
  db: D1Database,
  organizationId: string,
  valueId: string
): Promise<CoreValueActivationReadiness | null> {
  const value = await getCoreValue(db, organizationId, valueId);
  if (!value) return null;
  return resolveCoreValueActivationReadiness(db, organizationId, valueId, value);
}

function activationError(readiness: CoreValueActivationReadiness): Error {
  return new Error(`Core value belum dapat diaktifkan. Lengkapi ${readiness.missingRequirements.join(', ')}.`);
}

export async function listCoreValues(db: D1Database, organizationId: string): Promise<CoreValueRow[]> {
  return dbAll<CoreValueRow>(db, `select * from core_values where organization_id = ? order by is_active desc, sort_order asc, name asc`, [organizationId]);
}

export async function getCoreValue(db: D1Database, organizationId: string, valueId: string): Promise<CoreValueRow | null> {
  return dbFirst<CoreValueRow>(db, `select * from core_values where organization_id = ? and id = ? limit 1`, [organizationId, valueId]);
}

export async function createCoreValue(
  db: D1Database,
  payload: {
    organizationId: string;
    actorUserId: string | null;
    actorMemberId: string | null;
    name: string;
    shortDescription: string;
    description?: string;
    example?: string;
    color?: string;
    iconName?: string;
    sortOrder?: number;
    isActive?: number;
    expectedBehaviors?: string[];
    antiPatterns?: string[];
  }
): Promise<CoreValueRow> {
  const id = randomId();
  await dbRun(
    db,
    `insert into core_values
     (id, organization_id, name, short_description, description, expected_behaviors, anti_patterns, example, color, icon_name, sort_order, is_active, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      payload.organizationId,
      payload.name,
      payload.shortDescription,
      payload.description || '',
      stringifyJson(payload.expectedBehaviors || []),
      stringifyJson(payload.antiPatterns || []),
      payload.example || '',
      normalizeColor(payload.color),
      payload.iconName || 'star',
      payload.sortOrder ?? 0,
      0,
      isoNow(),
      isoNow(),
    ]
  );

  const created = await getCoreValue(db, payload.organizationId, id);
  await writeAuditLog(db, {
    organizationId: payload.organizationId,
    actorUserId: payload.actorUserId,
    actorMemberId: payload.actorMemberId,
    action: 'core_value.created',
    entityType: 'core_value',
    entityId: id,
    afterValue: created,
  });

  return created as CoreValueRow;
}

export async function updateCoreValue(
  db: D1Database,
  payload: {
    organizationId: string;
    valueId: string;
    actorUserId: string | null;
    actorMemberId: string | null;
    patch: Partial<{
      name: string;
      shortDescription: string;
      description: string;
      example: string;
      color: string;
      iconName: string;
      sortOrder: number;
      isActive: number;
      expectedBehaviors: string[];
      antiPatterns: string[];
    }>;
  }
): Promise<CoreValueRow> {
  const before = await getCoreValue(db, payload.organizationId, payload.valueId);
  if (!before) {
    throw new Error('Core value tidak ditemukan.');
  }

  const nextValue = {
    name: payload.patch.name ?? before.name,
    short_description: payload.patch.shortDescription ?? before.short_description,
    description: payload.patch.description ?? before.description,
    expected_behaviors: stringifyJson(payload.patch.expectedBehaviors ?? parseJsonArray(before.expected_behaviors)),
    anti_patterns: stringifyJson(payload.patch.antiPatterns ?? parseJsonArray(before.anti_patterns)),
    example: payload.patch.example ?? before.example,
    color: normalizeColor(payload.patch.color ?? before.color),
    icon_name: payload.patch.iconName ?? before.icon_name,
  };
  const nextIsActive = payload.patch.isActive ?? before.is_active;
  if (nextIsActive === 1) {
    const readiness = await resolveCoreValueActivationReadiness(db, payload.organizationId, payload.valueId, nextValue);
    if (!readiness.ready) throw activationError(readiness);
  }

  if (before.is_active === 0 && nextIsActive === 1) {
    const limits = await getPlanLimits(db, payload.organizationId);
    const maxActiveValues = Number(limits.maxActiveValues ?? 0);
    if (maxActiveValues > 0) {
      const activeCount = await dbFirst<{ count: number }>(
        db,
        `select count(*) as count from core_values where organization_id = ? and is_active = 1`,
        [payload.organizationId]
      );
      if (Number(activeCount?.count ?? 0) >= maxActiveValues) {
        throw new Error('Limit core value aktif untuk plan organisasi sudah tercapai.');
      }
    }
  }

  await dbRun(
    db,
    `update core_values
     set name = ?,
         short_description = ?,
         description = ?,
         expected_behaviors = ?,
         anti_patterns = ?,
         example = ?,
         color = ?,
         icon_name = ?,
         sort_order = ?,
         is_active = ?,
         updated_at = ?
     where organization_id = ? and id = ?`,
    [
      payload.patch.name ?? before.name,
      payload.patch.shortDescription ?? before.short_description,
      payload.patch.description ?? before.description,
      nextValue.expected_behaviors,
      nextValue.anti_patterns,
      nextValue.example,
      nextValue.color,
      nextValue.icon_name,
      payload.patch.sortOrder ?? before.sort_order,
      payload.patch.isActive ?? before.is_active,
      isoNow(),
      payload.organizationId,
      payload.valueId,
    ]
  );

  const after = await getCoreValue(db, payload.organizationId, payload.valueId);
  await writeAuditLog(db, {
    organizationId: payload.organizationId,
    actorUserId: payload.actorUserId,
    actorMemberId: payload.actorMemberId,
    action: 'core_value.updated',
    entityType: 'core_value',
    entityId: payload.valueId,
    beforeValue: before,
    afterValue: after,
  });

  return after as CoreValueRow;
}

export async function setCoreValueStatus(
  db: D1Database,
  payload: {
    organizationId: string;
    valueId: string;
    actorUserId: string | null;
    actorMemberId: string | null;
    isActive: number;
  }
): Promise<CoreValueRow> {
  if (![0, 1].includes(payload.isActive)) {
    throw new Error('Status core value tidak valid.');
  }

  const before = await getCoreValue(db, payload.organizationId, payload.valueId);
  if (!before) {
    throw new Error('Core value tidak ditemukan.');
  }
  if (before.is_active === payload.isActive) {
    return before;
  }

  if (payload.isActive === 1) {
    const readiness = await resolveCoreValueActivationReadiness(db, payload.organizationId, payload.valueId, before);
    if (!readiness.ready) throw activationError(readiness);

    const limits = await getPlanLimits(db, payload.organizationId);
    const maxActiveValues = Number(limits.maxActiveValues ?? 0);
    if (maxActiveValues > 0) {
      const activeCount = await dbFirst<{ count: number }>(
        db,
        `select count(*) as count from core_values where organization_id = ? and is_active = 1`,
        [payload.organizationId]
      );
      if (Number(activeCount?.count ?? 0) >= maxActiveValues) {
        throw new Error('Limit core value aktif untuk plan organisasi sudah tercapai.');
      }
    }
  }

  await dbRun(
    db,
    `update core_values set is_active = ?, updated_at = ? where organization_id = ? and id = ?`,
    [payload.isActive, isoNow(), payload.organizationId, payload.valueId]
  );

  const after = await getCoreValue(db, payload.organizationId, payload.valueId);
  await writeAuditLog(db, {
    organizationId: payload.organizationId,
    actorUserId: payload.actorUserId,
    actorMemberId: payload.actorMemberId,
    action: payload.isActive === 1 ? 'core_value.activated' : 'core_value.deactivated',
    entityType: 'core_value',
    entityId: payload.valueId,
    beforeValue: before,
    afterValue: after,
  });

  return after as CoreValueRow;
}

export async function deleteCoreValue(
  db: D1Database,
  payload: {
    organizationId: string;
    valueId: string;
    actorUserId: string | null;
    actorMemberId: string | null;
  }
): Promise<void> {
  const before = await getCoreValue(db, payload.organizationId, payload.valueId);
  if (!before) {
    throw new Error('Core value tidak ditemukan.');
  }

  const dependencies = await dbFirst<{ questions_count: number; challenges_count: number }>(
    db,
    `select
       (select count(*) from questions where organization_id = ? and core_value_id = ?) as questions_count,
       (select count(*) from challenge_sessions where organization_id = ? and core_value_id = ?) as challenges_count`,
    [payload.organizationId, payload.valueId, payload.organizationId, payload.valueId]
  );
  const questionsCount = Number(dependencies?.questions_count ?? 0);
  const challengesCount = Number(dependencies?.challenges_count ?? 0);

  if (questionsCount > 0 || challengesCount > 0) {
    const reasons: string[] = [];
    if (questionsCount > 0) reasons.push(`${questionsCount} question`);
    if (challengesCount > 0) reasons.push(`${challengesCount} riwayat challenge`);
    throw new Error(`Core value tidak dapat dihapus karena masih digunakan oleh ${reasons.join(' dan ')}. Nonaktifkan core value untuk mempertahankan data tersebut.`);
  }

  await dbRun(
    db,
    `delete from core_values
     where organization_id = ? and id = ?
       and not exists (
         select 1 from questions where organization_id = ? and core_value_id = ?
       )
       and not exists (
         select 1 from challenge_sessions where organization_id = ? and core_value_id = ?
       )`,
    [
      payload.organizationId,
      payload.valueId,
      payload.organizationId,
      payload.valueId,
      payload.organizationId,
      payload.valueId,
    ]
  );

  if (await getCoreValue(db, payload.organizationId, payload.valueId)) {
    throw new Error('Core value tidak dapat dihapus karena baru saja digunakan oleh data lain. Muat ulang halaman dan coba kembali.');
  }

  await writeAuditLog(db, {
    organizationId: payload.organizationId,
    actorUserId: payload.actorUserId,
    actorMemberId: payload.actorMemberId,
    action: 'core_value.deleted',
    entityType: 'core_value',
    entityId: payload.valueId,
    beforeValue: before,
  });
}

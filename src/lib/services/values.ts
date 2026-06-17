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
  if ((payload.isActive ?? 1) === 1) {
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
      payload.isActive ?? 1,
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

  if (before.is_active === 0 && payload.patch.isActive === 1) {
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
      stringifyJson(payload.patch.expectedBehaviors ?? parseJsonArray(before.expected_behaviors)),
      stringifyJson(payload.patch.antiPatterns ?? parseJsonArray(before.anti_patterns)),
      payload.patch.example ?? before.example,
      normalizeColor(payload.patch.color ?? before.color),
      payload.patch.iconName ?? before.icon_name,
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

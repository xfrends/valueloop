import { dbAll, dbFirst, dbRun } from '../db/client';
import { isoNow } from '../utils/date';
import { stringifyJson } from '../utils/json';
import type { NotificationType, NotificationRow, RealtimeNotification } from './types';
import type { OrganizationRealtime } from './realtime';

type AuditNotificationInput = {
  sourceEventId: string;
  organizationId: string;
  actorMemberId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  beforeValue?: unknown;
  afterValue?: unknown;
};

const adminActions = new Set(['member.invited', 'member.updated', 'member.deactivated', 'member.role_updated', 'team.created', 'team.updated', 'core_value.created', 'core_value.updated', 'core_value.deactivated', 'question.created', 'question.updated', 'question.deactivated', 'settings.updated']);
const actionAliases: Record<string, NotificationType> = {
  'organization.settings_updated': 'settings.updated',
  'member.role_changed': 'member.role_updated',
  'invitation.created': 'member.invited',
  'core_value.deleted': 'core_value.deactivated',
};

function copy(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function messageFor(action: string, afterValue: unknown): { title: string; message: string } {
  const value = copy(afterValue);
  const name = String(value.name ?? value.full_name ?? 'data organisasi');
  const messages: Record<string, [string, string]> = {
    'challenge.started': ['Challenge baru', 'Challenge baru telah dimulai.'],
    'challenge.rerolled': ['Challenge diacak ulang', 'Challenge telah mendapatkan pilihan baru.'],
    'challenge.answered': ['Jawaban challenge masuk', 'Jawaban challenge baru menunggu penilaian.'],
    'challenge.scored': ['Challenge dinilai', 'Challenge Anda telah mendapatkan penilaian.'],
    'member.invited': ['Undangan anggota', `Undangan anggota untuk ${name} telah dibuat.`],
    'member.updated': ['Profil anggota diperbarui', `${name} telah diperbarui.`],
    'member.deactivated': ['Anggota dinonaktifkan', `${name} telah dinonaktifkan.`],
    'member.role_updated': ['Peran anggota berubah', `Peran ${name} telah diperbarui.`],
  };
  const result = messages[action];
  return result ? { title: result[0], message: result[1] } : { title: 'Aktivitas organisasi', message: `${name} mengalami perubahan.` };
}

async function recipientIds(db: D1Database, event: AuditNotificationInput): Promise<string[]> {
  const active = await dbAll<{ id: string; role: string }>(db, `select id, role from organization_members where organization_id = ? and status = 'active'`, [event.organizationId]);
  if (event.action === 'challenge.scored') {
    const selected = String(copy(event.afterValue).selected_member_id ?? copy(event.beforeValue).selected_member_id ?? '');
    return active.filter(m => m.id === selected || ['owner', 'admin', 'facilitator'].includes(m.role)).map(m => m.id).filter(id => id !== event.actorMemberId || id === selected);
  }
  if (event.action === 'challenge.started' || event.action === 'challenge.rerolled') {
    const selected = String(copy(event.afterValue).selected_member_id ?? '');
    return active.filter(m => m.id === selected || ['owner', 'admin', 'facilitator'].includes(m.role)).map(m => m.id).filter(id => id !== event.actorMemberId || id === selected);
  }
  if (event.action === 'challenge.answered') {
    return active.filter(m => ['owner', 'admin', 'facilitator'].includes(m.role)).map(m => m.id).filter(id => id !== event.actorMemberId);
  }
  if (event.action === 'organization.created' || event.action === 'organization.updated' || event.action === 'organization.suspended' || event.action === 'billing.updated') {
    return active.filter(m => m.role === 'owner').map(m => m.id).filter(id => id !== event.actorMemberId);
  }
  if (adminActions.has(event.action)) {
    return active.filter(m => ['owner', 'admin'].includes(m.role)).map(m => m.id).filter(id => id !== event.actorMemberId);
  }
  return [];
}

export async function createNotificationsForAudit(db: D1Database, event: AuditNotificationInput, realtime?: DurableObjectNamespace<OrganizationRealtime>): Promise<void> {
  const normalizedAction = actionAliases[event.action] ?? event.action;
  const normalizedEvent = { ...event, action: normalizedAction };
  const type = normalizedAction as NotificationType;
  const recipients = await recipientIds(db, normalizedEvent);
  const { title, message } = messageFor(normalizedAction, event.afterValue);
  const createdAt = isoNow();
  for (const memberId of recipients) {
    const existing = await dbFirst<{ id: string }>(db, `select id from notifications where organization_id = ? and recipient_member_id = ? and source_event_id = ? limit 1`, [event.organizationId, memberId, event.sourceEventId]);
    if (existing) continue;
    const id = crypto.randomUUID();
    const payload = { action: normalizedAction, entityType: event.entityType, entityId: event.entityId };
    await dbRun(db, `insert into notifications (id, organization_id, recipient_member_id, type, title, message, entity_type, entity_id, payload, source_event_id, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, event.organizationId, memberId, type, title, message, event.entityType, event.entityId, stringifyJson(payload), event.sourceEventId, createdAt]);
    if (realtime) {
      const notification: RealtimeNotification = { id, organizationId: event.organizationId, recipientMemberId: memberId, notificationType: type, title, message, entityType: event.entityType, entityId: event.entityId, payload, createdAt };
      try { await realtime.getByName(event.organizationId).broadcast(notification); } catch { /* D1 remains authoritative. */ }
    }
  }
}

export async function listNotifications(db: D1Database, organizationId: string, memberId: string, options: { unread?: boolean; limit: number; offset: number }): Promise<NotificationRow[]> {
  return dbAll<NotificationRow>(db, `select * from notifications where organization_id = ? and recipient_member_id = ? ${options.unread ? 'and read_at is null' : ''} order by created_at desc limit ? offset ?`, [organizationId, memberId, options.limit, options.offset]);
}

export async function unreadNotificationCount(db: D1Database, organizationId: string, memberId: string): Promise<number> {
  const row = await dbFirst<{ count: number }>(db, `select count(*) as count from notifications where organization_id = ? and recipient_member_id = ? and read_at is null`, [organizationId, memberId]);
  return Number(row?.count ?? 0);
}

export async function markNotificationRead(db: D1Database, organizationId: string, memberId: string, notificationId: string): Promise<boolean> {
  const result = await dbRun(db, `update notifications set read_at = coalesce(read_at, ?) where id = ? and organization_id = ? and recipient_member_id = ?`, [isoNow(), notificationId, organizationId, memberId]);
  return result.meta.changes > 0;
}

export async function markAllNotificationsRead(db: D1Database, organizationId: string, memberId: string): Promise<void> {
  await dbRun(db, `update notifications set read_at = coalesce(read_at, ?) where organization_id = ? and recipient_member_id = ? and read_at is null`, [isoNow(), organizationId, memberId]);
}

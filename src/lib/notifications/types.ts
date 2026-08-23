export const NOTIFICATION_TYPES = [
  'organization.created', 'organization.updated', 'organization.suspended',
  'member.invited', 'member.updated', 'member.deactivated', 'member.role_updated',
  'team.created', 'team.updated', 'core_value.created', 'core_value.updated',
  'core_value.deactivated', 'question.created', 'question.updated', 'question.deactivated',
  'challenge.started', 'challenge.rerolled', 'challenge.answered', 'challenge.scored',
  'challenge.cancelled', 'settings.updated', 'billing.updated',
] as const;

export type NotificationType = typeof NOTIFICATION_TYPES[number];

export type NotificationRow = {
  id: string;
  organization_id: string;
  recipient_member_id: string;
  type: NotificationType;
  title: string;
  message: string;
  entity_type: string | null;
  entity_id: string | null;
  payload: string;
  source_event_id: string;
  read_at: string | null;
  created_at: string;
};

export type RealtimeNotification = {
  id: string;
  organizationId: string;
  recipientMemberId: string;
  notificationType: NotificationType;
  title: string;
  message: string;
  entityType: string;
  entityId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type RealtimeNotificationMessage = {
  type: 'notification.created';
  notification: RealtimeNotification;
};

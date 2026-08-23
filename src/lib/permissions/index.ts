export type PlatformRole = 'none' | 'platform_admin';
export type OrganizationRole = 'owner' | 'admin' | 'facilitator' | 'member' | 'viewer';

export type PermissionContext = {
  platformRole: PlatformRole;
  organizationRole: OrganizationRole | null;
};

export const PERMISSIONS = {
  DASHBOARD_VIEW: 'dashboard.view',
  CORE_VALUES_VIEW: 'core_values.view',
  CORE_VALUES_MANAGE: 'core_values.manage',
  QUESTIONS_VIEW: 'questions.view',
  QUESTIONS_MANAGE: 'questions.manage',
  MEMBERS_VIEW: 'members.view',
  MEMBERS_INVITE: 'members.invite',
  MEMBERS_MANAGE: 'members.manage',
  MEMBERS_MANAGE_ROLES: 'members.manage_roles',
  TEAMS_VIEW: 'teams.view',
  TEAMS_MANAGE: 'teams.manage',
  CHALLENGE_START: 'challenge.start',
  CHALLENGE_REROLL: 'challenge.reroll',
  CHALLENGE_ANSWER: 'challenge.answer',
  CHALLENGE_SCORE: 'challenge.score',
  CHALLENGE_EDIT_SCORED: 'challenge.edit_scored',
  CHALLENGE_CANCEL: 'challenge.cancel',
  HISTORY_VIEW_ALL: 'history.view_all',
  HISTORY_VIEW_OWN: 'history.view_own',
  LEADERBOARD_VIEW: 'leaderboard.view',
  INSIGHTS_VIEW: 'insights.view',
  REPORT_EXPORT: 'report.export',
  AUDIT_VIEW: 'audit.view',
  ORG_SETTINGS_MANAGE: 'org_settings.manage',
  BILLING_MANAGE: 'billing.manage',
  ORG_DELETE: 'organization.delete',
  CORE_VALUES_AI_GENERATE: 'core_values.ai_generate',
  AI_SETTINGS_MANAGE: 'ai_settings.manage',
} as const;

export type OrganizationPermission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

const ALL_PERMISSIONS = Object.values(PERMISSIONS) as OrganizationPermission[];
const ADMIN_EXCLUDED_PERMISSIONS = new Set<OrganizationPermission>([PERMISSIONS.BILLING_MANAGE, PERMISSIONS.ORG_DELETE]);

export const ROLE_PERMISSIONS: Record<OrganizationRole, readonly OrganizationPermission[]> = {
  owner: ALL_PERMISSIONS,
  admin: ALL_PERMISSIONS.filter((permission) => !ADMIN_EXCLUDED_PERMISSIONS.has(permission)),
  facilitator: [
    PERMISSIONS.DASHBOARD_VIEW, PERMISSIONS.CORE_VALUES_VIEW, PERMISSIONS.QUESTIONS_VIEW,
    PERMISSIONS.MEMBERS_VIEW, PERMISSIONS.CHALLENGE_START, PERMISSIONS.CHALLENGE_REROLL,
    PERMISSIONS.CHALLENGE_ANSWER, PERMISSIONS.CHALLENGE_SCORE, PERMISSIONS.HISTORY_VIEW_ALL,
    PERMISSIONS.HISTORY_VIEW_OWN, PERMISSIONS.LEADERBOARD_VIEW, PERMISSIONS.INSIGHTS_VIEW,
    PERMISSIONS.REPORT_EXPORT,
    PERMISSIONS.CORE_VALUES_AI_GENERATE,
  ],
  member: [
    PERMISSIONS.DASHBOARD_VIEW, PERMISSIONS.CORE_VALUES_VIEW, PERMISSIONS.HISTORY_VIEW_OWN,
    PERMISSIONS.LEADERBOARD_VIEW,
  ],
  viewer: [
    PERMISSIONS.DASHBOARD_VIEW, PERMISSIONS.CORE_VALUES_VIEW, PERMISSIONS.QUESTIONS_VIEW,
    PERMISSIONS.MEMBERS_VIEW, PERMISSIONS.HISTORY_VIEW_ALL, PERMISSIONS.HISTORY_VIEW_OWN,
    PERMISSIONS.LEADERBOARD_VIEW, PERMISSIONS.INSIGHTS_VIEW, PERMISSIONS.REPORT_EXPORT,
  ],
};

export function hasPermission(role: OrganizationRole | null | undefined, permission: OrganizationPermission): boolean {
  return Boolean(role && ROLE_PERMISSIONS[role].includes(permission));
}

const organizationRoleRank: Record<OrganizationRole, number> = {
  owner: 5,
  admin: 4,
  facilitator: 3,
  member: 2,
  viewer: 1,
};

export function hasOrganizationRole(role: OrganizationRole | null | undefined, allowed: OrganizationRole[]): boolean {
  if (!role) {
    return false;
  }

  return allowed.some((candidate) => organizationRoleRank[role] >= organizationRoleRank[candidate]);
}

export function canManageMembers(role: OrganizationRole | null | undefined): boolean {
  return hasPermission(role, PERMISSIONS.MEMBERS_MANAGE);
}

export function canManageValues(role: OrganizationRole | null | undefined): boolean {
  return hasPermission(role, PERMISSIONS.CORE_VALUES_MANAGE);
}

export function canRunChallenge(role: OrganizationRole | null | undefined): boolean {
  return hasPermission(role, PERMISSIONS.CHALLENGE_START);
}

export function canSubmitChallengeAnswer(role: OrganizationRole | null | undefined): boolean {
  return hasPermission(role, PERMISSIONS.CHALLENGE_ANSWER);
}

export function canRerollChallenge(role: OrganizationRole | null | undefined): boolean {
  return hasPermission(role, PERMISSIONS.CHALLENGE_REROLL);
}

export function canScoreChallenge(role: OrganizationRole | null | undefined): boolean {
  return hasPermission(role, PERMISSIONS.CHALLENGE_SCORE);
}

export function canViewOrg(role: OrganizationRole | null | undefined): boolean {
  return hasPermission(role, PERMISSIONS.CORE_VALUES_VIEW);
}

export function canViewAudit(role: OrganizationRole | null | undefined): boolean {
  return hasPermission(role, PERMISSIONS.AUDIT_VIEW);
}

export function canViewInsights(role: OrganizationRole | null | undefined): boolean {
  return hasPermission(role, PERMISSIONS.INSIGHTS_VIEW);
}

export function canViewSelfHistory(role: OrganizationRole | null | undefined): boolean {
  return hasPermission(role, PERMISSIONS.HISTORY_VIEW_OWN);
}

export function canManageOrganizationSettings(role: OrganizationRole | null | undefined): boolean {
  return hasPermission(role, PERMISSIONS.ORG_SETTINGS_MANAGE);
}

export function canManageBilling(role: OrganizationRole | null | undefined): boolean {
  return hasPermission(role, PERMISSIONS.BILLING_MANAGE);
}

export function canExportReports(role: OrganizationRole | null | undefined): boolean {
  return hasPermission(role, PERMISSIONS.REPORT_EXPORT);
}

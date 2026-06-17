export type PlatformRole = 'none' | 'platform_admin';
export type OrganizationRole = 'owner' | 'admin' | 'facilitator' | 'member' | 'viewer';

export type PermissionContext = {
  platformRole: PlatformRole;
  organizationRole: OrganizationRole | null;
};

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
  return hasOrganizationRole(role, ['admin', 'owner']);
}

export function canManageValues(role: OrganizationRole | null | undefined): boolean {
  return hasOrganizationRole(role, ['admin', 'owner']);
}

export function canRunChallenge(role: OrganizationRole | null | undefined): boolean {
  return hasOrganizationRole(role, ['facilitator', 'admin', 'owner']);
}

export function canScoreChallenge(role: OrganizationRole | null | undefined): boolean {
  return hasOrganizationRole(role, ['facilitator', 'admin', 'owner']);
}

export function canViewOrg(role: OrganizationRole | null | undefined): boolean {
  return hasOrganizationRole(role, ['viewer', 'member', 'facilitator', 'admin', 'owner']);
}

export function canViewAudit(role: OrganizationRole | null | undefined): boolean {
  return hasOrganizationRole(role, ['admin', 'owner']);
}

export function canViewInsights(role: OrganizationRole | null | undefined): boolean {
  return role === 'viewer' || hasOrganizationRole(role, ['facilitator', 'admin', 'owner']);
}

export function canViewSelfHistory(role: OrganizationRole | null | undefined): boolean {
  return hasOrganizationRole(role, ['member', 'facilitator', 'admin', 'owner']);
}

export function canManageOrganizationSettings(role: OrganizationRole | null | undefined): boolean {
  return hasOrganizationRole(role, ['admin', 'owner']);
}

export function canManageBilling(role: OrganizationRole | null | undefined): boolean {
  return role === 'owner';
}

export function canExportReports(role: OrganizationRole | null | undefined): boolean {
  return role === 'viewer' || hasOrganizationRole(role, ['facilitator', 'admin', 'owner']);
}

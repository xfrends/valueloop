import { describe, expect, it } from 'vitest';
import {
  canExportReports,
  canManageBilling,
  canManageMembers,
  canManageValues,
  canRerollChallenge,
  canRunChallenge,
  canScoreChallenge,
  canSubmitChallengeAnswer,
  canViewAudit,
  canViewInsights,
  canViewOrg,
  canViewSelfHistory,
  hasPermission,
  PERMISSIONS,
  ROLE_PERMISSIONS,
} from '../src/lib/permissions';

describe('permission helpers', () => {
  it('allows owner/admin to manage members and values', () => {
    expect(canManageMembers('owner')).toBe(true);
    expect(canManageMembers('admin')).toBe(true);
    expect(canManageMembers('facilitator')).toBe(false);
    expect(canManageValues('owner')).toBe(true);
    expect(canManageValues('admin')).toBe(true);
    expect(canManageValues('member')).toBe(false);
  });

  it('allows only owner/admin/facilitator to run and score challenges', () => {
    expect(canRunChallenge('owner')).toBe(true);
    expect(canRunChallenge('admin')).toBe(true);
    expect(canRunChallenge('facilitator')).toBe(true);
    expect(canRunChallenge('member')).toBe(false);
    expect(canRunChallenge('viewer')).toBe(false);
    expect(canRerollChallenge('owner')).toBe(true);
    expect(canRerollChallenge('facilitator')).toBe(true);
    expect(canRerollChallenge('viewer')).toBe(false);
    expect(canScoreChallenge('facilitator')).toBe(true);
    expect(canScoreChallenge('member')).toBe(false);
    expect(canSubmitChallengeAnswer('facilitator')).toBe(true);
    expect(canSubmitChallengeAnswer('member')).toBe(false);
  });

  it('matches read-only and operational view permissions from the MVP matrix', () => {
    expect(canViewOrg('viewer')).toBe(true);
    expect(canViewSelfHistory('member')).toBe(true);
    expect(canViewInsights('viewer')).toBe(true);
    expect(canViewInsights('member')).toBe(false);
    expect(canExportReports('viewer')).toBe(true);
    expect(canViewAudit('facilitator')).toBe(false);
    expect(canViewAudit('admin')).toBe(true);
    expect(canManageBilling('owner')).toBe(true);
    expect(canManageBilling('admin')).toBe(false);
  });

  it('exposes the RBAC matrix as the application source of truth', () => {
    expect(hasPermission('owner', PERMISSIONS.ORG_DELETE)).toBe(true);
    expect(hasPermission('admin', PERMISSIONS.MEMBERS_MANAGE_ROLES)).toBe(true);
    expect(hasPermission('admin', PERMISSIONS.BILLING_MANAGE)).toBe(false);
    expect(hasPermission('facilitator', PERMISSIONS.CHALLENGE_SCORE)).toBe(true);
    expect(hasPermission('member', PERMISSIONS.QUESTIONS_VIEW)).toBe(false);
    expect(hasPermission('viewer', PERMISSIONS.INSIGHTS_VIEW)).toBe(true);
    expect(ROLE_PERMISSIONS.owner.length).toBe(Object.keys(PERMISSIONS).length);
  });
});

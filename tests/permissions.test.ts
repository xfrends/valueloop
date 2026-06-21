import { describe, expect, it } from 'vitest';
import {
  canExportReports,
  canManageBilling,
  canManageMembers,
  canManageValues,
  canRunChallenge,
  canScoreChallenge,
  canViewAudit,
  canViewInsights,
  canViewOrg,
  canViewSelfHistory,
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
    expect(canScoreChallenge('facilitator')).toBe(true);
    expect(canScoreChallenge('member')).toBe(false);
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
});


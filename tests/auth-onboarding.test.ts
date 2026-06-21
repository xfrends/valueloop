import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TestD1 } from './helpers/d1';
import { createTestD1 } from './helpers/d1';
import { dbAll, dbFirst, dbRun } from '../src/lib/db/client';
import {
  createAuthSession,
  createOrganizationWithOwner,
  loginUser,
  logoutSession,
  markEmailVerified,
  signupUser,
} from '../src/lib/services/auth';
import { loadRequestContext } from '../src/lib/context/request';
import { SESSION_COOKIE_NAME } from '../src/lib/auth/constants';
import { changeOrganizationMemberRole, listUserOrganizations, switchOrganizationMembership } from '../src/lib/services/organization';
import { applyTemplateToOrganization } from '../src/lib/services/templates';
import { authSignupSchema } from '../src/lib/validations';

describe('auth and onboarding services', () => {
  let testD1: TestD1;

  beforeEach(async () => {
    testD1 = await createTestD1();
  });

  afterEach(async () => {
    await testD1?.dispose();
  });

  it('signs up, requires email verification before login, and creates/revokes a session', async () => {
    const user = await signupUser(testD1.db, {
      fullName: 'Rina Admin',
      email: 'Rina@Example.com',
      password: 'password-aman-123',
    });

    expect(user.email).toBe('rina@example.com');
    await expect(loginUser(testD1.db, { email: 'rina@example.com', password: 'password-aman-123' })).rejects.toThrow(
      'Email belum diverifikasi.'
    );

    await expect(
      signupUser(testD1.db, {
        fullName: 'Rina Duplicate',
        email: 'rina@example.com',
        password: 'password-aman-123',
      })
    ).rejects.toThrow('Email sudah terdaftar.');

    const verified = await markEmailVerified(testD1.db, user.id);
    expect(verified.email_verified_at).toBeTruthy();

    const loggedIn = await loginUser(testD1.db, { email: 'RINA@example.com', password: 'password-aman-123' });
    expect(loggedIn.id).toBe(user.id);

    const session = await createAuthSession(testD1.db, testD1.kv, user.id);
    const loaded = await loadRequestContext(testD1.db, new Map([[SESSION_COOKIE_NAME, session.token]]));
    expect(loaded.user?.id).toBe(user.id);
    expect(loaded.session?.token).toBe(session.token);

    await logoutSession(testD1.db, testD1.kv, session.token);
    const revoked = await loadRequestContext(testD1.db, new Map([[SESSION_COOKIE_NAME, session.token]]));
    expect(revoked.user).toBeNull();
  });

  it('creates an organization owner, subscription, and active switchable membership', async () => {
    const user = await signupUser(testD1.db, {
      fullName: 'Owner Satu',
      email: 'owner@alpha.test',
      password: 'password-aman-123',
    });
    await markEmailVerified(testD1.db, user.id);

    const organization = await createOrganizationWithOwner(testD1.db, {
      name: 'Alpha Team',
      slug: 'alpha-team',
      ownerUserId: user.id,
      ownerFullName: user.full_name,
    });

    const member = await dbFirst<{ role: string; status: string }>(
      testD1.db,
      `select role, status from organization_members where organization_id = ? and user_id = ?`,
      [organization.organizationId, user.id]
    );
    expect(member).toEqual({ role: 'owner', status: 'active' });

    const subscription = await dbFirst<{ status: string; plan_code: string }>(
      testD1.db,
      `select s.status, p.code as plan_code
       from subscriptions s
       join plans p on p.id = s.plan_id
       where s.organization_id = ?`,
      [organization.organizationId]
    );
    expect(subscription).toEqual({ status: 'trialing', plan_code: 'free' });

    const userOrganizations = await listUserOrganizations(testD1.db, user.id);
    expect(userOrganizations.map((row) => row.id)).toEqual([organization.organizationId]);

    const switched = await switchOrganizationMembership(testD1.db, { organizationId: organization.organizationId, userId: user.id });
    expect(switched).toEqual({ organizationId: organization.organizationId, role: 'owner' });
  });

  it('rejects duplicate organization slug with an Indonesian domain error', async () => {
    const first = await signupUser(testD1.db, {
      fullName: 'Owner Pertama',
      email: 'owner@alpha.test',
      password: 'password-aman-123',
    });
    await markEmailVerified(testD1.db, first.id);
    await createOrganizationWithOwner(testD1.db, {
      name: 'Alpha Team',
      slug: 'alpha-team',
      ownerUserId: first.id,
      ownerFullName: first.full_name,
    });

    const second = await signupUser(testD1.db, {
      fullName: 'Owner Kedua',
      email: 'owner@beta.test',
      password: 'password-aman-123',
    });
    await markEmailVerified(testD1.db, second.id);

    await expect(
      createOrganizationWithOwner(testD1.db, {
        name: 'Alpha Team Clone',
        slug: 'alpha-team',
        ownerUserId: second.id,
        ownerFullName: second.full_name,
      })
    ).rejects.toThrow('Slug organisasi sudah digunakan.');
  });

  it('allows one user to own multiple organizations', async () => {
    const user = await signupUser(testD1.db, {
      fullName: 'Owner Multi',
      email: 'owner@company.test',
      password: 'password-aman-123',
    });
    await markEmailVerified(testD1.db, user.id);

    const first = await createOrganizationWithOwner(testD1.db, {
      name: 'Company One',
      slug: 'company-one',
      ownerUserId: user.id,
      ownerFullName: user.full_name,
    });
    const second = await createOrganizationWithOwner(testD1.db, {
      name: 'Company Two',
      slug: 'company-two',
      ownerUserId: user.id,
      ownerFullName: user.full_name,
    });

    const userOrganizations = await listUserOrganizations(testD1.db, user.id);
    expect(userOrganizations.map((row) => row.id).sort()).toEqual([first.organizationId, second.organizationId].sort());
  });

  it('prevents a second owner inside the same organization', async () => {
    const owner = await signupUser(testD1.db, {
      fullName: 'Owner Utama',
      email: 'owner@single-org.test',
      password: 'password-aman-123',
    });
    await markEmailVerified(testD1.db, owner.id);
    const organization = await createOrganizationWithOwner(testD1.db, {
      name: 'Single Org',
      slug: 'single-org',
      ownerUserId: owner.id,
      ownerFullName: owner.full_name,
    });

    const secondUser = await signupUser(testD1.db, {
      fullName: 'Anggota',
      email: 'member@single-org.test',
      password: 'password-aman-123',
    });
    await markEmailVerified(testD1.db, secondUser.id);

    await dbRun(
      testD1.db,
      `insert into organization_members (id, organization_id, user_id, role, status, joined_at, created_at, updated_at)
       values (?, ?, ?, 'member', 'active', ?, ?, ?)`,
      [crypto.randomUUID(), organization.organizationId, secondUser.id, new Date().toISOString(), new Date().toISOString(), new Date().toISOString()]
    );

    const secondMember = await dbFirst<{ id: string }>(
      testD1.db,
      `select id from organization_members where organization_id = ? and user_id = ? limit 1`,
      [organization.organizationId, secondUser.id]
    );

    await expect(
      changeOrganizationMemberRole(testD1.db, {
        organizationId: organization.organizationId,
        memberId: secondMember?.id ?? '',
        role: 'owner',
        actorUserId: owner.id,
        actorMemberId: null,
      })
    ).rejects.toThrow('Setiap organisasi hanya boleh memiliki satu owner aktif.');
  });

  it('requires terms acceptance for signup', async () => {
    const result = authSignupSchema.safeParse({
      fullName: 'Rina Admin',
      email: 'rina@example.com',
      password: 'password-aman-123',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === 'termsAccepted' && issue.message === 'Anda harus menyetujui Syarat & Ketentuan dan Kebijakan Privasi.')).toBe(true);
    }
  });

  it('imports template values and questions into the organization tenant only', async () => {
    const user = await signupUser(testD1.db, {
      fullName: 'Owner Template',
      email: 'owner@template.test',
      password: 'password-aman-123',
    });
    await markEmailVerified(testD1.db, user.id);
    const organization = await createOrganizationWithOwner(testD1.db, {
      name: 'Template Org',
      slug: 'template-org',
      ownerUserId: user.id,
      ownerFullName: user.full_name,
    });
    const ownerMembership = await dbFirst<{ id: string }>(
      testD1.db,
      `select id from organization_members where organization_id = ? and user_id = ?`,
      [organization.organizationId, user.id]
    );

    await applyTemplateToOrganization(testD1.db, {
      organizationId: organization.organizationId,
      actorUserId: user.id,
      actorMemberId: ownerMembership?.id ?? null,
      templateCode: 'good-values',
    });

    const values = await dbAll<{ id: string; organization_id: string }>(
      testD1.db,
      `select id, organization_id from core_values where organization_id = ?`,
      [organization.organizationId]
    );
    const questions = await dbAll<{ id: string; organization_id: string; core_value_id: string }>(
      testD1.db,
      `select id, organization_id, core_value_id from questions where organization_id = ?`,
      [organization.organizationId]
    );

    expect(values.length).toBeGreaterThan(0);
    expect(questions.length).toBeGreaterThan(0);
    expect(values.every((row) => row.organization_id === organization.organizationId)).toBe(true);
    expect(questions.every((row) => row.organization_id === organization.organizationId)).toBe(true);
  });

  it('does not switch to inactive or unrelated organization memberships', async () => {
    const user = await signupUser(testD1.db, {
      fullName: 'Switch User',
      email: 'switch@alpha.test',
      password: 'password-aman-123',
    });
    await markEmailVerified(testD1.db, user.id);
    const organization = await createOrganizationWithOwner(testD1.db, {
      name: 'Switch Org',
      slug: 'switch-org',
      ownerUserId: user.id,
      ownerFullName: user.full_name,
    });
    await dbRun(
      testD1.db,
      `update organization_members set status = 'inactive' where organization_id = ? and user_id = ?`,
      [organization.organizationId, user.id]
    );

    const inactiveSwitch = await switchOrganizationMembership(testD1.db, { organizationId: organization.organizationId, userId: user.id });
    expect(inactiveSwitch).toBeNull();

    const missingSwitch = await switchOrganizationMembership(testD1.db, { organizationId: 'org-missing', userId: user.id });
    expect(missingSwitch).toBeNull();
  });
});

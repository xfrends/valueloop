import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TestD1 } from './helpers/d1';
import { createTestD1 } from './helpers/d1';
import { dbAll, dbFirst, dbRun } from '../src/lib/db/client';
import {
  createAuthSession,
  changeUserPassword,
  createOrganizationWithOwner,
  getUserProfile,
  loginUser,
  logoutSession,
  markEmailVerified,
  signupUser,
  updateUserProfile,
} from '../src/lib/services/auth';
import { loadRequestContext } from '../src/lib/context/request';
import { SESSION_COOKIE_NAME } from '../src/lib/auth/constants';
import { changeOrganizationMemberRole, listUserOrganizations, switchOrganizationMembership } from '../src/lib/services/organization';
import { applyTemplateToOrganization } from '../src/lib/services/templates';
import { createCoreValue, setCoreValueStatus } from '../src/lib/services/values';
import { createQuestion } from '../src/lib/services/questions';
import { getOrganizationReadiness, listPlanCatalog } from '../src/lib/services/shared';
import { authSignupSchema, organizationCreateSchema, valueSchema } from '../src/lib/validations';
import { parseTextList } from '../src/lib/utils/json';

describe('auth and onboarding services', () => {
  let testD1: TestD1;

  beforeEach(async () => {
    testD1 = await createTestD1();
  });

  afterEach(async () => {
    await testD1?.dispose();
  });

  it('keeps all plans visible while only Free is available', async () => {
    const plans = await listPlanCatalog(testD1.db);
    expect(plans.map((plan) => plan.code)).toEqual(['free', 'pro']);
    expect(plans.find((plan) => plan.code === 'free')?.available).toBe(true);
    expect(plans.find((plan) => plan.code === 'pro')?.available).toBe(false);
  });

  it('uses the default locale when the onboarding form does not submit one', () => {
    const parsed = organizationCreateSchema.parse({
      name: 'Organisasi Baru',
      timezone: 'Asia/Jakarta',
      templateId: '',
    });

    expect(parsed.defaultLocale).toBe('id');
  });

  it('uses safe defaults for omitted core value fields and parses textarea lists', () => {
    const parsed = valueSchema.parse({
      name: 'Kolaborasi',
      shortDescription: 'Bekerja bersama',
      description: '',
      example: '',
      color: '',
      iconName: '',
      sortOrder: '0',
      isActive: '',
      expectedBehaviors: 'Mendengar anggota tim\n- Membantu saat dibutuhkan',
      antiPatterns: '',
    });

    expect(parsed).toMatchObject({ color: '#2563EB', iconName: 'star', isActive: 0 });
    expect(parseTextList(parsed.expectedBehaviors)).toEqual(['Mendengar anggota tim', 'Membantu saat dibutuhkan']);
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

  it('updates user profile securely and changes password while revoking other sessions', async () => {
    const user = await signupUser(testD1.db, {
      fullName: 'Profil Lama',
      email: 'profil-lama@example.com',
      password: 'password-lama-123',
    });
    await markEmailVerified(testD1.db, user.id);

    await updateUserProfile(testD1.db, {
      userId: user.id,
      fullName: 'Profil Baru',
      email: 'profil-lama@example.com',
    });
    let profile = await getUserProfile(testD1.db, user.id);
    expect(profile?.full_name).toBe('Profil Baru');
    expect(profile?.email_verified_at).toBeTruthy();
    expect(profile?.has_password).toBe(true);

    await expect(updateUserProfile(testD1.db, {
      userId: user.id,
      fullName: 'Profil Baru',
      email: 'profil-baru@example.com',
      currentPassword: 'password-salah',
    })).rejects.toThrow('Kata sandi saat ini salah.');

    const updated = await updateUserProfile(testD1.db, {
      userId: user.id,
      fullName: 'Profil Baru',
      email: 'profil-baru@example.com',
      currentPassword: 'password-lama-123',
    });
    expect(updated.emailChanged).toBe(true);
    expect(updated.profile.email).toBe('profil-baru@example.com');
    expect(updated.profile.email_verified_at).toBeNull();
    await markEmailVerified(testD1.db, user.id);

    const currentSession = await createAuthSession(testD1.db, testD1.kv, user.id);
    const otherSession = await createAuthSession(testD1.db, testD1.kv, user.id);
    const currentContext = await loadRequestContext(testD1.db, new Map([[SESSION_COOKIE_NAME, currentSession.token]]));
    await changeUserPassword(testD1.db, {
      userId: user.id,
      currentSessionId: currentContext.session?.id as string,
      currentPassword: 'password-lama-123',
      newPassword: 'password-baru-456',
    });

    await expect(loginUser(testD1.db, { email: 'profil-baru@example.com', password: 'password-lama-123' })).rejects.toThrow(
      'Email atau kata sandi salah.'
    );
    await expect(loginUser(testD1.db, { email: 'profil-baru@example.com', password: 'password-baru-456' })).resolves.toMatchObject({ id: user.id });
    await expect(loadRequestContext(testD1.db, new Map([[SESSION_COOKIE_NAME, currentSession.token]]))).resolves.toMatchObject({ user: { id: user.id } });
    await expect(loadRequestContext(testD1.db, new Map([[SESSION_COOKIE_NAME, otherSession.token]]))).resolves.toMatchObject({ user: null });
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

  it('reports tenant-scoped dependencies needed by challenge and analytics pages', async () => {
    const user = await signupUser(testD1.db, {
      fullName: 'Owner Readiness',
      email: 'owner@readiness.test',
      password: 'password-aman-123',
    });
    await markEmailVerified(testD1.db, user.id);
    const organization = await createOrganizationWithOwner(testD1.db, {
      name: 'Readiness Org',
      ownerUserId: user.id,
      ownerFullName: user.full_name,
    });

    let readiness = await getOrganizationReadiness(testD1.db, organization.organizationId);
    expect(readiness).toMatchObject({
      activeMembers: 1,
      activeValues: 0,
      activeQuestions: 0,
      activeValuesWithoutQuestions: 0,
      totalChallenges: 0,
      scoredChallenges: 0,
      pendingInvitations: 0,
      subscriptionStatus: 'trialing',
    });
    expect(readiness.maxMembers).toBeGreaterThan(0);
    expect(readiness.maxActiveValues).toBeGreaterThan(0);
    expect(readiness.maxChallengesPerMonth).toBeGreaterThan(0);

    const value = await createCoreValue(testD1.db, {
      organizationId: organization.organizationId,
      actorUserId: user.id,
      actorMemberId: null,
      name: 'Kolaborasi',
      shortDescription: 'Bekerja bersama',
      description: 'Membangun hasil terbaik melalui kerja sama yang sehat.',
      expectedBehaviors: ['Mendengar perspektif anggota tim'],
      antiPatterns: ['Mengabaikan masukan tim'],
      example: 'Member membantu tim lain menyelesaikan hambatan bersama.',
    });
    readiness = await getOrganizationReadiness(testD1.db, organization.organizationId);
    expect(readiness).toMatchObject({ activeValues: 0, activeQuestions: 0, activeValuesWithoutQuestions: 0 });

    await createQuestion(testD1.db, {
      organizationId: organization.organizationId,
      actorUserId: user.id,
      actorMemberId: null,
      coreValueId: value.id,
      questionText: 'Bagaimana Anda berkolaborasi hari ini?',
      difficulty: 'easy',
    });
    readiness = await getOrganizationReadiness(testD1.db, organization.organizationId);
    expect(readiness).toMatchObject({ activeValues: 0, activeQuestions: 1, activeValuesWithoutQuestions: 0 });

    await setCoreValueStatus(testD1.db, {
      organizationId: organization.organizationId,
      valueId: value.id,
      actorUserId: user.id,
      actorMemberId: null,
      isActive: 1,
    });
    readiness = await getOrganizationReadiness(testD1.db, organization.organizationId);
    expect(readiness).toMatchObject({ activeValues: 1, activeQuestions: 1, activeValuesWithoutQuestions: 0 });
  });

  it('adds the owner user code when an automatically generated organization slug is already used', async () => {
    const first = await signupUser(testD1.db, {
      fullName: 'Owner Pertama',
      email: 'owner@alpha.test',
      password: 'password-aman-123',
    });
    await markEmailVerified(testD1.db, first.id);
    const firstOrganization = await createOrganizationWithOwner(testD1.db, {
      name: 'Alpha Team',
      ownerUserId: first.id,
      ownerFullName: first.full_name,
    });

    const second = await signupUser(testD1.db, {
      fullName: 'Owner Kedua',
      email: 'owner@beta.test',
      password: 'password-aman-123',
    });
    await markEmailVerified(testD1.db, second.id);

    const secondOrganization = await createOrganizationWithOwner(testD1.db, {
      name: 'Alpha Team',
      ownerUserId: second.id,
      ownerFullName: second.full_name,
    });

    const ownerCode = second.id.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
    expect(firstOrganization.organizationSlug).toBe('alpha-team');
    expect(secondOrganization.organizationSlug).toBe(`alpha-team-${ownerCode}`);
  });

  it('adds a numeric sequence if the same owner creates the same organization name again', async () => {
    const owner = await signupUser(testD1.db, {
      fullName: 'Owner Berulang',
      email: 'owner@repeat.test',
      password: 'password-aman-123',
    });
    await markEmailVerified(testD1.db, owner.id);

    const first = await createOrganizationWithOwner(testD1.db, {
      name: 'Repeat Company',
      ownerUserId: owner.id,
      ownerFullName: owner.full_name,
    });
    const second = await createOrganizationWithOwner(testD1.db, {
      name: 'Repeat Company',
      ownerUserId: owner.id,
      ownerFullName: owner.full_name,
    });
    const third = await createOrganizationWithOwner(testD1.db, {
      name: 'Repeat Company',
      ownerUserId: owner.id,
      ownerFullName: owner.full_name,
    });

    const ownerCode = owner.id.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
    expect(first.organizationSlug).toBe('repeat-company');
    expect(second.organizationSlug).toBe(`repeat-company-${ownerCode}`);
    expect(third.organizationSlug).toBe(`repeat-company-${ownerCode}-2`);
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

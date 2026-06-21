import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TestD1 } from './helpers/d1';
import { createTestD1 } from './helpers/d1';
import { dbFirst } from '../src/lib/db/client';
import { createCoreValue, getCoreValue, listCoreValues, updateCoreValue } from '../src/lib/services/values';
import { createQuestion, listQuestions, updateQuestion } from '../src/lib/services/questions';
import { addMemberToTeam, createTeam, listTeams, removeMemberFromTeam } from '../src/lib/services/members';
import { createOwnedOrganization } from './helpers/seed';

describe('core operational CRUD services', () => {
  let testD1: TestD1;

  beforeEach(async () => {
    testD1 = await createTestD1();
  });

  afterEach(async () => {
    await testD1?.dispose();
  });

  it('keeps core values scoped to the current organization', async () => {
    const alpha = await createOwnedOrganization(testD1.db, {
      ownerName: 'Alpha Owner',
      ownerEmail: 'owner@alpha-values.test',
      organizationName: 'Alpha Values',
      organizationSlug: 'alpha-values',
    });
    const beta = await createOwnedOrganization(testD1.db, {
      ownerName: 'Beta Owner',
      ownerEmail: 'owner@beta-values.test',
      organizationName: 'Beta Values',
      organizationSlug: 'beta-values',
    });

    const alphaValue = await createCoreValue(testD1.db, {
      organizationId: alpha.organization.organizationId,
      actorUserId: alpha.owner.id,
      actorMemberId: alpha.membershipId,
      name: 'Ownership',
      shortDescription: 'Ambil tanggung jawab.',
      expectedBehaviors: ['Tuntas'],
      antiPatterns: ['Menyalahkan'],
    });
    await createCoreValue(testD1.db, {
      organizationId: beta.organization.organizationId,
      actorUserId: beta.owner.id,
      actorMemberId: beta.membershipId,
      name: 'Service',
      shortDescription: 'Melayani dengan jelas.',
    });

    const alphaValues = await listCoreValues(testD1.db, alpha.organization.organizationId);
    expect(alphaValues.map((value) => value.id)).toEqual([alphaValue.id]);
    expect(await getCoreValue(testD1.db, beta.organization.organizationId, alphaValue.id)).toBeNull();

    await expect(
      updateCoreValue(testD1.db, {
        organizationId: beta.organization.organizationId,
        valueId: alphaValue.id,
        actorUserId: beta.owner.id,
        actorMemberId: beta.membershipId,
        patch: { name: 'Hijack' },
      })
    ).rejects.toThrow('Core value tidak ditemukan.');
  });

  it('rejects questions that point to another organization core value', async () => {
    const alpha = await createOwnedOrganization(testD1.db, {
      ownerName: 'Alpha Owner',
      ownerEmail: 'owner@alpha-questions.test',
      organizationName: 'Alpha Questions',
      organizationSlug: 'alpha-questions',
    });
    const beta = await createOwnedOrganization(testD1.db, {
      ownerName: 'Beta Owner',
      ownerEmail: 'owner@beta-questions.test',
      organizationName: 'Beta Questions',
      organizationSlug: 'beta-questions',
    });

    const alphaValue = await createCoreValue(testD1.db, {
      organizationId: alpha.organization.organizationId,
      actorUserId: alpha.owner.id,
      actorMemberId: alpha.membershipId,
      name: 'Ownership',
      shortDescription: 'Ambil tanggung jawab.',
    });
    const betaValue = await createCoreValue(testD1.db, {
      organizationId: beta.organization.organizationId,
      actorUserId: beta.owner.id,
      actorMemberId: beta.membershipId,
      name: 'Service',
      shortDescription: 'Melayani dengan jelas.',
    });

    const alphaQuestion = await createQuestion(testD1.db, {
      organizationId: alpha.organization.organizationId,
      actorUserId: alpha.owner.id,
      actorMemberId: alpha.membershipId,
      coreValueId: alphaValue.id,
      questionText: 'Apa contoh ownership minggu ini?',
      difficulty: 'easy',
    });

    await expect(
      createQuestion(testD1.db, {
        organizationId: alpha.organization.organizationId,
        actorUserId: alpha.owner.id,
        actorMemberId: alpha.membershipId,
        coreValueId: betaValue.id,
        questionText: 'Pertanyaan lintas tenant',
        difficulty: 'easy',
      })
    ).rejects.toThrow('Core value tidak ditemukan.');

    await expect(
      updateQuestion(testD1.db, {
        organizationId: alpha.organization.organizationId,
        questionId: alphaQuestion.id,
        actorUserId: alpha.owner.id,
        actorMemberId: alpha.membershipId,
        patch: { coreValueId: betaValue.id },
      })
    ).rejects.toThrow('Core value tidak ditemukan.');

    const alphaQuestions = await listQuestions(testD1.db, alpha.organization.organizationId);
    expect(alphaQuestions.map((question) => question.id)).toEqual([alphaQuestion.id]);
  });

  it('keeps team membership assignments inside one organization', async () => {
    const alpha = await createOwnedOrganization(testD1.db, {
      ownerName: 'Alpha Owner',
      ownerEmail: 'owner@alpha-teams.test',
      organizationName: 'Alpha Teams',
      organizationSlug: 'alpha-teams',
    });
    const beta = await createOwnedOrganization(testD1.db, {
      ownerName: 'Beta Owner',
      ownerEmail: 'owner@beta-teams.test',
      organizationName: 'Beta Teams',
      organizationSlug: 'beta-teams',
    });

    const alphaTeam = await createTeam(testD1.db, {
      organizationId: alpha.organization.organizationId,
      actorUserId: alpha.owner.id,
      actorMemberId: alpha.membershipId,
      name: 'Culture Squad',
    });

    await expect(
      addMemberToTeam(testD1.db, {
        organizationId: alpha.organization.organizationId,
        teamId: alphaTeam.id,
        organizationMemberId: beta.membershipId as string,
        actorUserId: alpha.owner.id,
        actorMemberId: alpha.membershipId,
      })
    ).rejects.toThrow('Anggota tidak ditemukan.');

    await addMemberToTeam(testD1.db, {
      organizationId: alpha.organization.organizationId,
      teamId: alphaTeam.id,
      organizationMemberId: alpha.membershipId as string,
      actorUserId: alpha.owner.id,
      actorMemberId: alpha.membershipId,
    });

    const teamMember = await dbFirst<{ organization_id: string; team_id: string; organization_member_id: string }>(
      testD1.db,
      `select organization_id, team_id, organization_member_id from team_members where team_id = ?`,
      [alphaTeam.id]
    );
    expect(teamMember).toEqual({
      organization_id: alpha.organization.organizationId,
      team_id: alphaTeam.id,
      organization_member_id: alpha.membershipId,
    });

    await removeMemberFromTeam(testD1.db, {
      organizationId: alpha.organization.organizationId,
      teamId: alphaTeam.id,
      organizationMemberId: alpha.membershipId as string,
      actorUserId: alpha.owner.id,
      actorMemberId: alpha.membershipId,
    });

    const remaining = await listTeams(testD1.db, alpha.organization.organizationId);
    expect(remaining[0].member_count).toBe(0);
  });
});

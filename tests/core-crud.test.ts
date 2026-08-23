import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TestD1 } from './helpers/d1';
import { createTestD1 } from './helpers/d1';
import { dbFirst, dbRun } from '../src/lib/db/client';
import { createCoreValue, deleteCoreValue, getCoreValue, listCoreValues, setCoreValueStatus, updateCoreValue } from '../src/lib/services/values';
import { createQuestion, getQuestion, listQuestions, listQuestionsForCoreValue, updateQuestion } from '../src/lib/services/questions';
import { addMemberToTeam, createTeam, getTeam, listTeamMemberAssignments, listTeams, removeMemberFromTeam } from '../src/lib/services/members';
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
    expect(
      (await listQuestionsForCoreValue(testD1.db, alpha.organization.organizationId, alphaValue.id)).map((question) => question.id)
    ).toEqual([alphaQuestion.id]);
    expect(
      await listQuestionsForCoreValue(testD1.db, beta.organization.organizationId, alphaValue.id)
    ).toEqual([]);
    expect(
      await getQuestion(
        testD1.db,
        alpha.organization.organizationId,
        alphaValue.id,
        alphaQuestion.id
      )
    ).toMatchObject({ id: alphaQuestion.id, core_value_id: alphaValue.id });
    expect(
      await getQuestion(
        testD1.db,
        beta.organization.organizationId,
        alphaValue.id,
        alphaQuestion.id
      )
    ).toBeNull();
    expect(
      await getQuestion(
        testD1.db,
        alpha.organization.organizationId,
        betaValue.id,
        alphaQuestion.id
      )
    ).toBeNull();
  });

  it('deactivates values safely and only deletes values without dependencies', async () => {
    const alpha = await createOwnedOrganization(testD1.db, {
      ownerName: 'Alpha Owner',
      ownerEmail: 'owner@alpha-value-lifecycle.test',
      organizationName: 'Alpha Lifecycle',
      organizationSlug: 'alpha-lifecycle',
    });
    const beta = await createOwnedOrganization(testD1.db, {
      ownerName: 'Beta Owner',
      ownerEmail: 'owner@beta-value-lifecycle.test',
      organizationName: 'Beta Lifecycle',
      organizationSlug: 'beta-lifecycle',
    });
    const value = await createCoreValue(testD1.db, {
      organizationId: alpha.organization.organizationId,
      actorUserId: alpha.owner.id,
      actorMemberId: alpha.membershipId,
      name: 'Integrity',
      shortDescription: 'Bertindak konsisten.',
      description: 'Menjaga keselarasan antara ucapan, keputusan, dan tindakan.',
      expectedBehaviors: ['Menyampaikan fakta dengan jujur'],
      antiPatterns: ['Menyembunyikan masalah'],
      example: 'Member menyampaikan risiko proyek sejak awal.',
      isActive: 1,
    });
    expect(value.is_active).toBe(0);
    await expect(
      setCoreValueStatus(testD1.db, {
        organizationId: alpha.organization.organizationId,
        valueId: value.id,
        actorUserId: alpha.owner.id,
        actorMemberId: alpha.membershipId,
        isActive: 1,
      })
    ).rejects.toThrow('minimal satu question aktif');
    const question = await createQuestion(testD1.db, {
      organizationId: alpha.organization.organizationId,
      actorUserId: alpha.owner.id,
      actorMemberId: alpha.membershipId,
      coreValueId: value.id,
      questionText: 'Kapan kamu mempertahankan integritas?',
      difficulty: 'medium',
    });

    const active = await setCoreValueStatus(testD1.db, {
      organizationId: alpha.organization.organizationId,
      valueId: value.id,
      actorUserId: alpha.owner.id,
      actorMemberId: alpha.membershipId,
      isActive: 1,
    });
    expect(active.is_active).toBe(1);

    const inactive = await setCoreValueStatus(testD1.db, {
      organizationId: alpha.organization.organizationId,
      valueId: value.id,
      actorUserId: alpha.owner.id,
      actorMemberId: alpha.membershipId,
      isActive: 0,
    });
    expect(inactive.is_active).toBe(0);
    expect(await getQuestion(testD1.db, alpha.organization.organizationId, value.id, question.id)).not.toBeNull();

    await expect(
      deleteCoreValue(testD1.db, {
        organizationId: alpha.organization.organizationId,
        valueId: value.id,
        actorUserId: alpha.owner.id,
        actorMemberId: alpha.membershipId,
      })
    ).rejects.toThrow('1 question');
    await expect(
      deleteCoreValue(testD1.db, {
        organizationId: beta.organization.organizationId,
        valueId: value.id,
        actorUserId: beta.owner.id,
        actorMemberId: beta.membershipId,
      })
    ).rejects.toThrow('Core value tidak ditemukan.');

    const incomplete = await createCoreValue(testD1.db, {
      organizationId: alpha.organization.organizationId,
      actorUserId: alpha.owner.id,
      actorMemberId: alpha.membershipId,
      name: 'Incomplete',
      shortDescription: 'Masih berupa draft.',
    });
    await createQuestion(testD1.db, {
      organizationId: alpha.organization.organizationId,
      actorUserId: alpha.owner.id,
      actorMemberId: alpha.membershipId,
      coreValueId: incomplete.id,
      questionText: 'Apa contoh penerapannya?',
      difficulty: 'easy',
    });
    await expect(
      setCoreValueStatus(testD1.db, {
        organizationId: alpha.organization.organizationId,
        valueId: incomplete.id,
        actorUserId: alpha.owner.id,
        actorMemberId: alpha.membershipId,
        isActive: 1,
      })
    ).rejects.toThrow('deskripsi lengkap');

    const disposable = await createCoreValue(testD1.db, {
      organizationId: alpha.organization.organizationId,
      actorUserId: alpha.owner.id,
      actorMemberId: alpha.membershipId,
      name: 'Disposable',
      shortDescription: 'Belum digunakan.',
      isActive: 0,
    });
    await deleteCoreValue(testD1.db, {
      organizationId: alpha.organization.organizationId,
      valueId: disposable.id,
      actorUserId: alpha.owner.id,
      actorMemberId: alpha.membershipId,
    });
    expect(await getCoreValue(testD1.db, alpha.organization.organizationId, disposable.id)).toBeNull();

    const auditActions = await dbFirst<{ count: number }>(
      testD1.db,
      `select count(*) as count from audit_logs where organization_id = ? and action in ('core_value.deactivated', 'core_value.deleted')`,
      [alpha.organization.organizationId]
    );
    expect(Number(auditActions?.count ?? 0)).toBe(2);
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

    const assignments = await listTeamMemberAssignments(testD1.db, alpha.organization.organizationId);
    expect(assignments).toHaveLength(1);
    expect(assignments[0]).toMatchObject({
      team_id: alphaTeam.id,
      team_name: 'Culture Squad',
      organization_member_id: alpha.membershipId,
      member_name: 'Alpha Owner',
    });
    expect(await listTeamMemberAssignments(testD1.db, alpha.organization.organizationId, alphaTeam.id)).toHaveLength(1);
    expect(await listTeamMemberAssignments(testD1.db, beta.organization.organizationId)).toHaveLength(0);
    expect(await getTeam(testD1.db, alpha.organization.organizationId, alphaTeam.id)).toMatchObject({
      id: alphaTeam.id,
      member_count: 1,
    });
    expect(await getTeam(testD1.db, beta.organization.organizationId, alphaTeam.id)).toBeNull();

    await dbRun(
      testD1.db,
      `update organization_members set status = 'inactive' where id = ? and organization_id = ?`,
      [alpha.membershipId, alpha.organization.organizationId]
    );

    await expect(
      addMemberToTeam(testD1.db, {
        organizationId: alpha.organization.organizationId,
        teamId: alphaTeam.id,
        organizationMemberId: alpha.membershipId as string,
        actorUserId: alpha.owner.id,
        actorMemberId: alpha.membershipId,
      })
    ).rejects.toThrow('Anggota tidak ditemukan.');

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

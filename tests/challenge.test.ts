import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TestD1 } from './helpers/d1';
import { createTestD1 } from './helpers/d1';
import { dbAll, dbFirst, dbRun } from '../src/lib/db/client';
import { startChallenge, submitAnswer, submitScore, rerollChallenge, listChallengeSessions } from '../src/lib/services/challenge';
import { upsertOrganizationSettings } from '../src/lib/services/shared';

const now = '2026-01-01T00:00:00.000Z';

async function seedOrganization(
  db: D1Database,
  suffix: string,
  options: {
    activeMembers?: number;
    inactiveMembers?: number;
    activeValues?: number;
    inactiveValues?: number;
    activeQuestionsPerValue?: number;
    inactiveQuestionsPerValue?: number;
  } = {}
) {
  const organizationId = `org-${suffix}`;
  await dbRun(
    db,
    `insert into organizations (id, name, slug, created_at, updated_at) values (?, ?, ?, ?, ?)`,
    [organizationId, `Org ${suffix}`, `org-${suffix}`, now, now]
  );

  const memberIds: string[] = [];
  const inactiveMemberIds: string[] = [];
  const activeMembers = options.activeMembers ?? 2;
  const inactiveMembers = options.inactiveMembers ?? 1;

  for (let index = 1; index <= activeMembers + inactiveMembers; index += 1) {
    const active = index <= activeMembers;
    const userId = `user-${suffix}-${index}`;
    const memberId = `member-${suffix}-${index}`;
    await dbRun(
      db,
      `insert into users (id, full_name, email, password_hash, email_verified_at, created_at, updated_at)
       values (?, ?, ?, 'hash', ?, ?, ?)`,
      [userId, `User ${suffix} ${index}`, `${suffix}-${index}@example.com`, now, now, now]
    );
    await dbRun(
      db,
      `insert into organization_members (id, organization_id, user_id, role, status, joined_at, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?)`,
      [memberId, organizationId, userId, index === 1 ? 'owner' : 'member', active ? 'active' : 'inactive', now, now, now]
    );
    if (active) {
      memberIds.push(memberId);
    } else {
      inactiveMemberIds.push(memberId);
    }
  }

  const valueIds: string[] = [];
  const inactiveValueIds: string[] = [];
  const activeValues = options.activeValues ?? 2;
  const inactiveValues = options.inactiveValues ?? 1;
  const activeQuestionsPerValue = options.activeQuestionsPerValue ?? 1;
  const inactiveQuestionsPerValue = options.inactiveQuestionsPerValue ?? 1;

  for (let index = 1; index <= activeValues + inactiveValues; index += 1) {
    const active = index <= activeValues;
    const valueId = `value-${suffix}-${index}`;
    await dbRun(
      db,
      `insert into core_values
       (id, organization_id, name, short_description, expected_behaviors, anti_patterns, sort_order, is_active, created_at, updated_at)
       values (?, ?, ?, ?, '[]', '[]', ?, ?, ?, ?)`,
      [valueId, organizationId, `Value ${suffix} ${index}`, `Value desc ${index}`, index, active ? 1 : 0, now, now]
    );

    if (active) {
      valueIds.push(valueId);
    } else {
      inactiveValueIds.push(valueId);
    }

    for (let qIndex = 1; qIndex <= activeQuestionsPerValue + inactiveQuestionsPerValue; qIndex += 1) {
      const questionActive = qIndex <= activeQuestionsPerValue;
      await dbRun(
        db,
        `insert into questions
         (id, organization_id, core_value_id, question_text, difficulty, is_active, created_at, updated_at)
         values (?, ?, ?, ?, 'easy', ?, ?, ?)`,
        [
          `question-${suffix}-${index}-${qIndex}`,
          organizationId,
          valueId,
          `Question ${suffix} ${index}.${qIndex}`,
          questionActive ? 1 : 0,
          now,
          now,
        ]
      );
    }
  }

  return { organizationId, memberIds, inactiveMemberIds, valueIds, inactiveValueIds };
}

describe('challenge service', () => {
  let testD1: TestD1;

  beforeEach(async () => {
    testD1 = await createTestD1();
  });

  afterEach(async () => {
    await testD1?.dispose();
  });

  it('starts a persisted challenge using only active tenant data', async () => {
    const seeded = await seedOrganization(testD1.db, 'alpha');

    const session = await startChallenge(testD1.db, {
      organizationId: seeded.organizationId,
      actorUserId: 'user-alpha-1',
      actorMemberId: 'member-alpha-1',
    });

    expect(seeded.memberIds).toContain(session.selected_member_id);
    expect(seeded.inactiveMemberIds).not.toContain(session.selected_member_id);
    expect(seeded.valueIds).toContain(session.core_value_id);
    expect(seeded.inactiveValueIds).not.toContain(session.core_value_id);

    const selectedQuestion = await dbFirst<{ is_active: number; organization_id: string }>(
      testD1.db,
      `select is_active, organization_id from questions where id = ?`,
      [session.question_id]
    );
    expect(selectedQuestion).toMatchObject({ is_active: 1, organization_id: seeded.organizationId });

    const stored = await dbFirst<{ id: string; selected_member_id: string; core_value_id: string; question_id: string }>(
      testD1.db,
      `select id, selected_member_id, core_value_id, question_id from challenge_sessions where id = ? and organization_id = ?`,
      [session.id, seeded.organizationId]
    );
    expect(stored).toEqual({
      id: session.id,
      selected_member_id: session.selected_member_id,
      core_value_id: session.core_value_id,
      question_id: session.question_id,
    });

    const secondCall = await startChallenge(testD1.db, {
      organizationId: seeded.organizationId,
      actorUserId: 'user-alpha-1',
      actorMemberId: 'member-alpha-1',
    });
    expect(secondCall.id).toBe(session.id);
  });

  it('keeps challenge listing scoped to the requested organization', async () => {
    const alpha = await seedOrganization(testD1.db, 'alpha');
    const beta = await seedOrganization(testD1.db, 'beta');

    const alphaSession = await startChallenge(testD1.db, {
      organizationId: alpha.organizationId,
      actorUserId: 'user-alpha-1',
      actorMemberId: 'member-alpha-1',
    });
    const betaSession = await startChallenge(testD1.db, {
      organizationId: beta.organizationId,
      actorUserId: 'user-beta-1',
      actorMemberId: 'member-beta-1',
    });

    const alphaRows = await listChallengeSessions(testD1.db, alpha.organizationId);
    expect(alphaRows.map((row) => row.id)).toContain(alphaSession.id);
    expect(alphaRows.map((row) => row.id)).not.toContain(betaSession.id);
    expect(alphaRows.every((row) => row.organization_id === alpha.organizationId)).toBe(true);
  });

  it('rejects reroll after answer and after scoring', async () => {
    const seeded = await seedOrganization(testD1.db, 'alpha');
    const answeredSession = await startChallenge(testD1.db, {
      organizationId: seeded.organizationId,
      actorUserId: 'user-alpha-1',
      actorMemberId: 'member-alpha-1',
    });
    await submitAnswer(testD1.db, {
      organizationId: seeded.organizationId,
      sessionId: answeredSession.id,
      actorUserId: 'user-alpha-1',
      actorMemberId: 'member-alpha-1',
      answerText: 'Saya mengambil ownership dengan membuat follow-up yang jelas.',
    });

    await expect(
      rerollChallenge(testD1.db, {
        organizationId: seeded.organizationId,
        sessionId: answeredSession.id,
        actorUserId: 'user-alpha-1',
        actorMemberId: 'member-alpha-1',
      })
    ).rejects.toThrow('Challenge yang sudah dijawab tidak dapat di-reroll.');

    const evaluatorMemberId = seeded.memberIds.find((memberId) => memberId !== answeredSession.selected_member_id) ?? null;
    await submitScore(testD1.db, {
      organizationId: seeded.organizationId,
      sessionId: answeredSession.id,
      actorUserId: null,
      actorMemberId: evaluatorMemberId,
      score: 8,
      allowSelfScoring: false,
    });

    await expect(
      rerollChallenge(testD1.db, {
        organizationId: seeded.organizationId,
        sessionId: answeredSession.id,
        actorUserId: 'user-alpha-2',
        actorMemberId: 'member-alpha-2',
      })
    ).rejects.toThrow('Challenge yang sudah dinilai tidak dapat di-reroll.');
  });

  it('enforces answer-before-score, score range, and self-scoring setting', async () => {
    const seeded = await seedOrganization(testD1.db, 'alpha');
    const session = await startChallenge(testD1.db, {
      organizationId: seeded.organizationId,
      actorUserId: 'user-alpha-1',
      actorMemberId: 'member-alpha-1',
    });

    await expect(
      submitScore(testD1.db, {
        organizationId: seeded.organizationId,
        sessionId: session.id,
        actorUserId: 'user-alpha-2',
        actorMemberId: 'member-alpha-2',
        score: 7,
        allowSelfScoring: false,
      })
    ).rejects.toThrow('Challenge harus memiliki jawaban sebelum dinilai.');

    const answered = await submitAnswer(testD1.db, {
      organizationId: seeded.organizationId,
      sessionId: session.id,
      actorUserId: 'user-alpha-1',
      actorMemberId: 'member-alpha-1',
      answerText: 'Contoh konkret dengan dampak yang jelas.',
    });

    await expect(
      submitScore(testD1.db, {
        organizationId: seeded.organizationId,
        sessionId: session.id,
        actorUserId: null,
        actorMemberId: answered.selected_member_id,
        score: 7,
        allowSelfScoring: false,
      })
    ).rejects.toThrow('Self-scoring tidak diizinkan untuk organisasi ini.');

    await expect(
      submitScore(testD1.db, {
        organizationId: seeded.organizationId,
        sessionId: session.id,
        actorUserId: 'user-alpha-2',
        actorMemberId: 'member-alpha-2',
        score: 11,
        allowSelfScoring: true,
      })
    ).rejects.toThrow('Skor harus berada di antara 0 dan 10.');

    const scored = await submitScore(testD1.db, {
      organizationId: seeded.organizationId,
      sessionId: session.id,
      actorUserId: null,
      actorMemberId: answered.selected_member_id,
      score: 9,
      allowSelfScoring: true,
    });

    expect(scored.status).toBe('scored');
    expect(scored.score).toBe(9);
  });

  it('honors allowMultipleChallengesPerDay when enabled', async () => {
    const seeded = await seedOrganization(testD1.db, 'alpha', { activeMembers: 3, activeValues: 1 });
    await upsertOrganizationSettings(testD1.db, seeded.organizationId, {
      challengeFrequency: 'daily',
      questionCooldownDays: 14,
      allowMultipleChallengesPerDay: true,
      allowSelfScoring: false,
      defaultScoreRubric: [
        { min: 0, max: 2, label: 'Perlu banyak perbaikan' },
        { min: 3, max: 4, label: 'Masih kurang' },
        { min: 5, max: 6, label: 'Cukup' },
        { min: 7, max: 8, label: 'Baik' },
        { min: 9, max: 10, label: 'Sangat baik' },
      ],
    });

    const first = await startChallenge(testD1.db, {
      organizationId: seeded.organizationId,
      actorUserId: 'user-alpha-1',
      actorMemberId: 'member-alpha-1',
    });
    const second = await startChallenge(testD1.db, {
      organizationId: seeded.organizationId,
      actorUserId: 'user-alpha-1',
      actorMemberId: 'member-alpha-1',
    });

    expect(second.id).not.toBe(first.id);
    expect(second.sequence_no).toBe(first.sequence_no + 1);

    const rows = await dbAll<{ id: string }>(
      testD1.db,
      `select id from challenge_sessions where organization_id = ?`,
      [seeded.organizationId]
    );
    expect(rows).toHaveLength(2);
  });
});

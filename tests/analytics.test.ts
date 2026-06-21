import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TestD1 } from './helpers/d1';
import { createTestD1 } from './helpers/d1';
import { createOwnedOrganization } from './helpers/seed';
import { createCoreValue } from '../src/lib/services/values';
import { createQuestion } from '../src/lib/services/questions';
import { addMemberToTeam, createTeam } from '../src/lib/services/members';
import { startChallenge, submitAnswer, submitScore } from '../src/lib/services/challenge';
import { getDashboardSummary, getHistorySummary, getInsightsSummary, getLeaderboardRows } from '../src/lib/services/analytics';

async function seedScoredChallenge(
  db: D1Database,
  payload: {
    suffix: string;
    score: number;
  }
) {
  const organization = await createOwnedOrganization(db, {
    ownerName: `${payload.suffix} Owner`,
    ownerEmail: `owner@${payload.suffix}.analytics.test`,
    organizationName: `${payload.suffix} Analytics`,
    organizationSlug: `${payload.suffix}-analytics`,
  });

  const value = await createCoreValue(db, {
    organizationId: organization.organization.organizationId,
    actorUserId: organization.owner.id,
    actorMemberId: organization.membershipId,
    name: 'Ownership',
    shortDescription: 'Ambil tanggung jawab sampai tuntas.',
  });
  await createQuestion(db, {
    organizationId: organization.organization.organizationId,
    actorUserId: organization.owner.id,
    actorMemberId: organization.membershipId,
    coreValueId: value.id,
    questionText: 'Apa contoh ownership paling konkret minggu ini?',
    difficulty: 'easy',
  });
  const team = await createTeam(db, {
    organizationId: organization.organization.organizationId,
    actorUserId: organization.owner.id,
    actorMemberId: organization.membershipId,
    name: 'Culture Team',
  });
  await addMemberToTeam(db, {
    organizationId: organization.organization.organizationId,
    teamId: team.id,
    organizationMemberId: organization.membershipId as string,
    actorUserId: organization.owner.id,
    actorMemberId: organization.membershipId,
  });

  const session = await startChallenge(db, {
    organizationId: organization.organization.organizationId,
    actorUserId: organization.owner.id,
    actorMemberId: organization.membershipId,
  });
  await submitAnswer(db, {
    organizationId: organization.organization.organizationId,
    sessionId: session.id,
    actorUserId: organization.owner.id,
    actorMemberId: organization.membershipId,
    answerText: 'Saya membuat follow-up jelas, menutup risiko, dan mengabari tim.',
  });
  const scored = await submitScore(db, {
    organizationId: organization.organization.organizationId,
    sessionId: session.id,
    actorUserId: organization.owner.id,
    actorMemberId: organization.membershipId,
    score: payload.score,
    evaluatorNote: 'Jawaban konkret dan bisa diterapkan.',
    allowSelfScoring: true,
  });

  return { ...organization, value, team, session: scored };
}

describe('analytics services', () => {
  let testD1: TestD1;

  beforeEach(async () => {
    testD1 = await createTestD1();
  });

  afterEach(async () => {
    await testD1?.dispose();
  });

  it('summarizes scored challenge data without leaking another tenant', async () => {
    const alpha = await seedScoredChallenge(testD1.db, { suffix: 'alpha', score: 8 });
    const beta = await seedScoredChallenge(testD1.db, { suffix: 'beta', score: 5 });

    const leaderboard = await getLeaderboardRows(testD1.db, alpha.organization.organizationId, { includeInactive: true });
    expect(leaderboard).toHaveLength(1);
    expect(leaderboard[0]).toMatchObject({
      organization_id: alpha.organization.organizationId,
      organization_member_id: alpha.membershipId,
      total_points: 8,
      total_answered: 1,
      average_score: 8,
      highest_score: 8,
    });
    expect(leaderboard.map((row) => row.organization_member_id)).not.toContain(beta.membershipId);

    const history = await getHistorySummary(testD1.db, alpha.organization.organizationId);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      id: alpha.session.id,
      status: 'scored',
      score: 8,
      value_name: 'Ownership',
    });

    const dashboard = await getDashboardSummary(testD1.db, alpha.organization.organizationId);
    expect(dashboard.stats).toMatchObject({
      active_members: 1,
      challenges_this_month: 1,
      average_score_this_month: 8,
      answered_this_month: 1,
      today_sessions: 1,
    });
    expect(dashboard.leaderboard).toHaveLength(1);
    expect(dashboard.leaderboard[0].organization_id).toBe(alpha.organization.organizationId);

    const insights = await getInsightsSummary(testD1.db, alpha.organization.organizationId);
    expect(insights.monthStats).toMatchObject({
      activeMembers: 1,
      selectedMembers: 1,
      totalChallenges: 1,
      scoredChallenges: 1,
      averageScore: 8,
      participationRate: 100,
    });
    expect(insights.valueScores).toEqual([
      {
        value_name: 'Ownership',
        total_asked: 1,
        average_score: 8,
      },
    ]);
    expect(insights.teamScores).toEqual([
      {
        team_name: 'Culture Team',
        total_answered: 1,
        average_score: 8,
      },
    ]);
  });
});


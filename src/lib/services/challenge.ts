import { dbAll, dbFirst, dbRun } from '../db/client';
import { randomId } from '../utils/crypto';
import { formatOrgDate, isoNow } from '../utils/date';
import { getOrganizationPlanSummary, getOrganizationSettings, writeAuditLog } from './shared';
import type { OrganizationRealtime } from '../notifications/realtime';

export type ChallengeSessionRow = {
  id: string;
  organization_id: string;
  session_date: string;
  sequence_no: number;
  round_no: number;
  selected_member_id: string;
  core_value_id: string;
  question_id: string;
  answer_text: string | null;
  answered_at: string | null;
  score: number | null;
  evaluator_member_id: string | null;
  evaluator_note: string | null;
  status: 'open' | 'answered' | 'scored' | 'cancelled';
  reroll_count: number;
  created_by_member_id: string | null;
  created_at: string;
  updated_at: string;
};

export async function getOpenChallengeForDate(db: D1Database, organizationId: string, sessionDate: string): Promise<ChallengeSessionRow | null> {
  return dbFirst<ChallengeSessionRow>(
    db,
    `select * from challenge_sessions
     where organization_id = ? and session_date = ? and status in ('open', 'answered', 'scored')
     order by sequence_no asc
     limit 1`,
    [organizationId, sessionDate]
  );
}

export async function getLatestChallenge(db: D1Database, organizationId: string): Promise<ChallengeSessionRow | null> {
  return dbFirst<ChallengeSessionRow>(
    db,
    `select * from challenge_sessions where organization_id = ? order by session_date desc, sequence_no desc limit 1`,
    [organizationId]
  );
}

export async function listChallengeSessions(
  db: D1Database,
  organizationId: string,
  filters: {
    limit?: number;
    offset?: number;
    status?: string;
    memberId?: string;
    valueId?: string;
    fromDate?: string;
    toDate?: string;
    teamId?: string;
    query?: string;
  } = {}
): Promise<Array<ChallengeSessionRow & { member_name: string; member_team: string | null; value_name: string; question_text: string; evaluator_name: string | null }>> {
  const conditions = [`cs.organization_id = ?`];
  const params: unknown[] = [organizationId];

  if (filters.status) {
    conditions.push(`cs.status = ?`);
    params.push(filters.status);
  }
  if (filters.memberId) {
    conditions.push(`cs.selected_member_id = ?`);
    params.push(filters.memberId);
  }
  if (filters.valueId) {
    conditions.push(`cs.core_value_id = ?`);
    params.push(filters.valueId);
  }
  if (filters.fromDate) {
    conditions.push(`cs.session_date >= ?`);
    params.push(filters.fromDate);
  }
  if (filters.toDate) {
    conditions.push(`cs.session_date <= ?`);
    params.push(filters.toDate);
  }
  if (filters.query) {
    conditions.push(`(u.full_name like ? or cv.name like ? or q.question_text like ?)`);
    const like = `%${filters.query}%`;
    params.push(like, like, like);
  }
  if (filters.teamId) {
    conditions.push(`exists (
      select 1 from team_members tm
      where tm.organization_member_id = cs.selected_member_id
        and tm.team_id = ?
        and tm.organization_id = cs.organization_id
    )`);
    params.push(filters.teamId);
  }

  const limit = filters.limit ?? 25;
  const offset = filters.offset ?? 0;
  params.push(limit, offset);

  return dbAll(
    db,
    `select cs.*,
            u.full_name as member_name,
            (
              select group_concat(t.name, ', ')
              from team_members tm
              join teams t on t.id = tm.team_id
              where tm.organization_member_id = cs.selected_member_id and tm.organization_id = cs.organization_id
            ) as member_team,
            cv.name as value_name,
            q.question_text as question_text,
            eu.full_name as evaluator_name
     from challenge_sessions cs
     join organization_members om on om.id = cs.selected_member_id
     join users u on u.id = om.user_id
     join core_values cv on cv.id = cs.core_value_id
     join questions q on q.id = cs.question_id
     left join organization_members eom on eom.id = cs.evaluator_member_id
     left join users eu on eu.id = eom.user_id
     where ${conditions.join(' and ')}
     order by cs.session_date desc, cs.sequence_no desc
     limit ? offset ?`,
    params
  );
}

export async function startChallenge(
  db: D1Database,
  payload: { organizationId: string; actorUserId: string | null; actorMemberId: string | null; realtime?: DurableObjectNamespace<OrganizationRealtime> }
): Promise<ChallengeSessionRow> {
  const org = await dbFirst<{ timezone: string }>(db, `select timezone from organizations where id = ?`, [payload.organizationId]);
  if (!org) {
    throw new Error('Organisasi tidak ditemukan.');
  }

  const settings = await getOrganizationSettings(db, payload.organizationId);
  const sessionDate = formatOrgDate(new Date(), org.timezone);
  const existing = await getOpenChallengeForDate(db, payload.organizationId, sessionDate);
  if (existing && !settings.allowMultipleChallengesPerDay) {
    return existing;
  }

  const plan = await getOrganizationPlanSummary(db, payload.organizationId);
  if (plan.subscription_status && !['trialing', 'active'].includes(plan.subscription_status)) {
    throw new Error('Subscription organisasi tidak aktif.');
  }

  const monthlyLimit = Number(plan.limits.maxChallengesPerMonth ?? 0);
  if (monthlyLimit > 0) {
    const monthStart = `${sessionDate.slice(0, 7)}-01`;
    const monthlyUsage = await dbFirst<{ count: number }>(
      db,
      `select count(*) as count
       from challenge_sessions
       where organization_id = ?
         and session_date >= ?
         and status != 'cancelled'`,
      [payload.organizationId, monthStart]
    );
    if (Number(monthlyUsage?.count ?? 0) >= monthlyLimit) {
      throw new Error('Limit challenge bulanan untuk plan organisasi sudah tercapai.');
    }
  }

  const activeMembers = await dbAll<{ id: string }>(
    db,
    `select id from organization_members where organization_id = ? and status = 'active' order by created_at asc`,
    [payload.organizationId]
  );
  const activeValues = await dbAll<{ id: string }>(
    db,
    `select id from core_values where organization_id = ? and is_active = 1 order by sort_order asc, created_at asc`,
    [payload.organizationId]
  );

  if (!activeMembers.length) {
    throw new Error('Belum ada anggota aktif untuk dipilih.');
  }
  if (!activeValues.length) {
    throw new Error('Belum ada core value aktif untuk dipilih.');
  }

  const latest = await getLatestChallenge(db, payload.organizationId);
  const currentRound = latest?.round_no ?? 1;
  const usedMemberIds = new Set(
    (
      await dbAll<{ selected_member_id: string }>(
        db,
        `select selected_member_id from challenge_sessions where organization_id = ? and round_no = ?`,
        [payload.organizationId, currentRound]
      )
    ).map((row) => row.selected_member_id)
  );

  let candidateMembers = activeMembers.filter((member) => !usedMemberIds.has(member.id));
  let nextRound = currentRound;
  if (!candidateMembers.length) {
    candidateMembers = activeMembers;
    nextRound = currentRound + 1;
  }

  const selectedMemberId = candidateMembers[Math.floor(Math.random() * candidateMembers.length)].id;
  const selectedValueId = activeValues[Math.floor(Math.random() * activeValues.length)].id;

  const cooldownDays = Number(settings.questionCooldownDays ?? 14);
  const cutoffDate = new Date();
  cutoffDate.setUTCDate(cutoffDate.getUTCDate() - cooldownDays);
  const cutoffIso = cutoffDate.toISOString().slice(0, 10);

  let questions = await dbAll<{ id: string }>(
    db,
    `select id
     from questions
     where organization_id = ?
       and core_value_id = ?
       and is_active = 1
       and id not in (
         select question_id
         from challenge_sessions
         where organization_id = ?
           and session_date >= ?
       )
     order by random()`,
    [payload.organizationId, selectedValueId, payload.organizationId, cutoffIso]
  );

  if (!questions.length) {
    questions = await dbAll<{ id: string }>(
      db,
      `select id from questions where organization_id = ? and core_value_id = ? and is_active = 1 order by random()`,
      [payload.organizationId, selectedValueId]
    );
  }

  if (!questions.length) {
    throw new Error('Belum ada pertanyaan aktif untuk core value yang dipilih.');
  }

  const questionId = questions[0].id;
  const sequenceNo = (latest?.session_date === sessionDate ? latest.sequence_no + 1 : 1);

  const session: ChallengeSessionRow = {
    id: randomId(),
    organization_id: payload.organizationId,
    session_date: sessionDate,
    sequence_no: sequenceNo,
    round_no: nextRound,
    selected_member_id: selectedMemberId,
    core_value_id: selectedValueId,
    question_id: questionId,
    answer_text: null,
    answered_at: null,
    score: null,
    evaluator_member_id: null,
    evaluator_note: null,
    status: 'open',
    reroll_count: 0,
    created_by_member_id: payload.actorMemberId,
    created_at: isoNow(),
    updated_at: isoNow(),
  };

  await dbRun(
    db,
    `insert into challenge_sessions
     (id, organization_id, session_date, sequence_no, round_no, selected_member_id, core_value_id, question_id, status, reroll_count, created_by_member_id, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      session.id,
      session.organization_id,
      session.session_date,
      session.sequence_no,
      session.round_no,
      session.selected_member_id,
      session.core_value_id,
      session.question_id,
      session.status,
      session.reroll_count,
      session.created_by_member_id,
      session.created_at,
      session.updated_at,
    ]
  );

  await writeAuditLog(db, {
    organizationId: payload.organizationId,
    actorUserId: payload.actorUserId,
    actorMemberId: payload.actorMemberId,
    action: 'challenge.started',
    entityType: 'challenge_session',
    entityId: session.id,
    afterValue: session,
    realtime: payload.realtime,
  });

  return session;
}

export async function rerollChallenge(
  db: D1Database,
  payload: {
    organizationId: string;
    sessionId: string;
    actorUserId: string | null;
    actorMemberId: string | null;
    reason?: string;
    realtime?: DurableObjectNamespace<OrganizationRealtime>;
  }
): Promise<ChallengeSessionRow> {
  const before = await dbFirst<ChallengeSessionRow>(
    db,
    `select * from challenge_sessions where id = ? and organization_id = ? limit 1`,
    [payload.sessionId, payload.organizationId]
  );
  if (!before) {
    throw new Error('Challenge tidak ditemukan.');
  }
  if (before.status === 'scored') {
    throw new Error('Challenge yang sudah dinilai tidak dapat di-reroll.');
  }
  if (before.answer_text) {
    throw new Error('Challenge yang sudah dijawab tidak dapat di-reroll.');
  }

  const settings = await getOrganizationSettings(db, payload.organizationId);
  const activeMembers = await dbAll<{ id: string }>(
    db,
    `select id from organization_members where organization_id = ? and status = 'active' order by created_at asc`,
    [payload.organizationId]
  );
  const activeValues = await dbAll<{ id: string }>(
    db,
    `select id from core_values where organization_id = ? and is_active = 1 order by sort_order asc, created_at asc`,
    [payload.organizationId]
  );

  if (!activeMembers.length || !activeValues.length) {
    throw new Error('Data aktif belum lengkap untuk reroll challenge.');
  }

  const currentRound = before.round_no;
  const usedMemberIds = new Set(
    (
      await dbAll<{ selected_member_id: string }>(
        db,
        `select selected_member_id from challenge_sessions where organization_id = ? and round_no = ? and id != ?`,
        [payload.organizationId, currentRound, payload.sessionId]
      )
    ).map((row) => row.selected_member_id)
  );
  let candidateMembers = activeMembers.filter((member) => !usedMemberIds.has(member.id) && member.id !== before.selected_member_id);
  if (!candidateMembers.length) {
    candidateMembers = activeMembers.filter((member) => member.id !== before.selected_member_id);
  }
  if (!candidateMembers.length) {
    candidateMembers = activeMembers;
  }

  const selectedMemberId = candidateMembers[Math.floor(Math.random() * candidateMembers.length)].id;
  const selectedValueId = activeValues[Math.floor(Math.random() * activeValues.length)].id;

  const cooldownDays = Number(settings.questionCooldownDays ?? 14);
  const cutoffDate = new Date();
  cutoffDate.setUTCDate(cutoffDate.getUTCDate() - cooldownDays);
  const cutoffIso = cutoffDate.toISOString().slice(0, 10);
  let questions = await dbAll<{ id: string }>(
    db,
    `select id
     from questions
     where organization_id = ?
       and core_value_id = ?
       and is_active = 1
       and id not in (
         select question_id
         from challenge_sessions
         where organization_id = ?
           and session_date >= ?
       )
     order by random()`,
    [payload.organizationId, selectedValueId, payload.organizationId, cutoffIso]
  );
  if (!questions.length) {
    questions = await dbAll<{ id: string }>(
      db,
      `select id from questions where organization_id = ? and core_value_id = ? and is_active = 1 order by random()`,
      [payload.organizationId, selectedValueId]
    );
  }
  if (!questions.length) {
    throw new Error('Belum ada pertanyaan aktif untuk reroll challenge.');
  }

  const questionId = questions[0].id;

  const updated = await dbFirst<ChallengeSessionRow>(
    db,
    `update challenge_sessions
     set reroll_count = reroll_count + 1,
         updated_at = ?,
         selected_member_id = ?,
         core_value_id = ?,
         question_id = ?,
         round_no = ?
     where id = ? and organization_id = ?
     returning *`,
    [isoNow(), selectedMemberId, selectedValueId, questionId, currentRound, payload.sessionId, payload.organizationId]
  );

  await writeAuditLog(db, {
    organizationId: payload.organizationId,
    actorUserId: payload.actorUserId,
    actorMemberId: payload.actorMemberId,
    action: 'challenge.rerolled',
    entityType: 'challenge_session',
    entityId: payload.sessionId,
    beforeValue: before,
    afterValue: {
      ...before,
      reroll_count: before.reroll_count + 1,
      selected_member_id: selectedMemberId,
      core_value_id: selectedValueId,
      question_id: questionId,
      reason: payload.reason || null,
    },
    realtime: payload.realtime,
  });

  return updated as ChallengeSessionRow;
}

export async function submitAnswer(
  db: D1Database,
  payload: {
    organizationId: string;
    sessionId: string;
    actorUserId: string | null;
    actorMemberId: string | null;
    answerText: string;
    realtime?: DurableObjectNamespace<OrganizationRealtime>;
  }
): Promise<ChallengeSessionRow> {
  const before = await dbFirst<ChallengeSessionRow>(
    db,
    `select * from challenge_sessions where id = ? and organization_id = ? limit 1`,
    [payload.sessionId, payload.organizationId]
  );
  if (!before) {
    throw new Error('Challenge tidak ditemukan.');
  }
  if (before.status !== 'open') {
    throw new Error('Jawaban hanya bisa dikirim untuk challenge yang masih terbuka.');
  }

  const after = await dbFirst<ChallengeSessionRow>(
    db,
    `update challenge_sessions
     set answer_text = ?, answered_at = ?, status = 'answered', updated_at = ?
     where id = ? and organization_id = ? and status = 'open'
     returning *`,
    [payload.answerText.trim(), isoNow(), isoNow(), payload.sessionId, payload.organizationId]
  );
  if (!after) {
    throw new Error('Jawaban hanya bisa dikirim untuk challenge yang masih terbuka.');
  }

  await writeAuditLog(db, {
    organizationId: payload.organizationId,
    actorUserId: payload.actorUserId,
    actorMemberId: payload.actorMemberId,
    action: 'challenge.answered',
    entityType: 'challenge_session',
    entityId: payload.sessionId,
    beforeValue: before,
    afterValue: after,
    realtime: payload.realtime,
  });

  return after as ChallengeSessionRow;
}

export async function submitScore(
  db: D1Database,
  payload: {
    organizationId: string;
    sessionId: string;
    actorUserId: string | null;
    actorMemberId: string | null;
    score: number;
    evaluatorNote?: string;
    allowSelfScoring: boolean;
    realtime?: DurableObjectNamespace<OrganizationRealtime>;
  }
): Promise<ChallengeSessionRow> {
  if (!Number.isInteger(payload.score) || payload.score < 0 || payload.score > 10) {
    throw new Error('Skor harus berada di antara 0 dan 10.');
  }

  const before = await dbFirst<ChallengeSessionRow>(
    db,
    `select * from challenge_sessions where id = ? and organization_id = ? limit 1`,
    [payload.sessionId, payload.organizationId]
  );
  if (!before) {
    throw new Error('Challenge tidak ditemukan.');
  }
  if (before.status === 'scored') {
    throw new Error('Challenge yang sudah dinilai tidak dapat diubah.');
  }
  if (before.status !== 'answered') {
    throw new Error('Challenge harus memiliki jawaban sebelum dinilai.');
  }
  if (!payload.allowSelfScoring && payload.actorMemberId && payload.actorMemberId === before.selected_member_id) {
    throw new Error('Self-scoring tidak diizinkan untuk organisasi ini.');
  }

  const after = await dbFirst<ChallengeSessionRow>(
    db,
    `update challenge_sessions
     set score = ?, evaluator_note = ?, evaluator_member_id = ?, status = 'scored', updated_at = ?
     where id = ? and organization_id = ?
     returning *`,
    [payload.score, payload.evaluatorNote || '', payload.actorMemberId, isoNow(), payload.sessionId, payload.organizationId]
  );

  await writeAuditLog(db, {
    organizationId: payload.organizationId,
    actorUserId: payload.actorUserId,
    actorMemberId: payload.actorMemberId,
    action: 'challenge.scored',
    entityType: 'challenge_session',
    entityId: payload.sessionId,
    beforeValue: before,
    afterValue: after,
    realtime: payload.realtime,
  });

  return after as ChallengeSessionRow;
}

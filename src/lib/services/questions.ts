import { dbAll, dbFirst, dbRun } from '../db/client';
import { isoNow } from '../utils/date';
import { randomId } from '../utils/crypto';
import { writeAuditLog } from './shared';

export type QuestionRow = {
  id: string;
  organization_id: string;
  core_value_id: string;
  question_text: string;
  difficulty: string;
  suggested_rubric_note: string | null;
  is_active: number;
  created_by_member_id: string | null;
  created_at: string;
  updated_at: string;
};

export async function getQuestion(
  db: D1Database,
  organizationId: string,
  coreValueId: string,
  questionId: string
): Promise<QuestionRow | null> {
  return dbFirst<QuestionRow>(
    db,
    `select * from questions where id = ? and organization_id = ? and core_value_id = ? limit 1`,
    [questionId, organizationId, coreValueId]
  );
}

export async function listQuestions(db: D1Database, organizationId: string): Promise<Array<QuestionRow & { core_value_name: string; core_value_active: number }>> {
  return dbAll(
    db,
    `select q.*, cv.name as core_value_name, cv.is_active as core_value_active
     from questions q
     join core_values cv on cv.id = q.core_value_id
     where q.organization_id = ?
     order by q.is_active desc, cv.sort_order asc, q.created_at desc`,
    [organizationId]
  );
}

export async function listQuestionsForCoreValue(
  db: D1Database,
  organizationId: string,
  coreValueId: string
): Promise<QuestionRow[]> {
  return dbAll<QuestionRow>(
    db,
    `select * from questions
     where organization_id = ? and core_value_id = ?
     order by is_active desc, created_at desc`,
    [organizationId, coreValueId]
  );
}

export async function createQuestion(
  db: D1Database,
  payload: {
    organizationId: string;
    actorUserId: string | null;
    actorMemberId: string | null;
    coreValueId: string;
    questionText: string;
    difficulty: 'easy' | 'medium' | 'hard';
    suggestedRubricNote?: string;
    isActive?: number;
  }
): Promise<QuestionRow> {
  const coreValue = await dbFirst<{ id: string }>(
    db,
    `select id from core_values where id = ? and organization_id = ? limit 1`,
    [payload.coreValueId, payload.organizationId]
  );
  if (!coreValue) {
    throw new Error('Core value tidak ditemukan.');
  }

  const id = randomId();
  await dbRun(
    db,
    `insert into questions
     (id, organization_id, core_value_id, question_text, difficulty, suggested_rubric_note, is_active, created_by_member_id, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      payload.organizationId,
      payload.coreValueId,
      payload.questionText,
      payload.difficulty,
      payload.suggestedRubricNote || '',
      payload.isActive ?? 1,
      payload.actorMemberId,
      isoNow(),
      isoNow(),
    ]
  );

  const created = await dbFirst<QuestionRow>(db, `select * from questions where id = ?`, [id]);
  await writeAuditLog(db, {
    organizationId: payload.organizationId,
    actorUserId: payload.actorUserId,
    actorMemberId: payload.actorMemberId,
    action: 'question.created',
    entityType: 'question',
    entityId: id,
    afterValue: created,
  });

  return created as QuestionRow;
}

export async function updateQuestion(
  db: D1Database,
  payload: {
    organizationId: string;
    questionId: string;
    actorUserId: string | null;
    actorMemberId: string | null;
    patch: Partial<{
      coreValueId: string;
      questionText: string;
      difficulty: 'easy' | 'medium' | 'hard';
      suggestedRubricNote: string;
      isActive: number;
    }>;
  }
): Promise<QuestionRow> {
  const before = await dbFirst<QuestionRow>(
    db,
    `select * from questions where id = ? and organization_id = ? limit 1`,
    [payload.questionId, payload.organizationId]
  );
  if (!before) {
    throw new Error('Pertanyaan tidak ditemukan.');
  }

  if (payload.patch.coreValueId) {
    const coreValue = await dbFirst<{ id: string }>(
      db,
      `select id from core_values where id = ? and organization_id = ? limit 1`,
      [payload.patch.coreValueId, payload.organizationId]
    );
    if (!coreValue) {
      throw new Error('Core value tidak ditemukan.');
    }
  }

  await dbRun(
    db,
    `update questions
     set core_value_id = ?,
         question_text = ?,
         difficulty = ?,
         suggested_rubric_note = ?,
         is_active = ?,
         updated_at = ?
     where id = ? and organization_id = ?`,
    [
      payload.patch.coreValueId ?? before.core_value_id,
      payload.patch.questionText ?? before.question_text,
      payload.patch.difficulty ?? before.difficulty,
      payload.patch.suggestedRubricNote ?? before.suggested_rubric_note,
      payload.patch.isActive ?? before.is_active,
      isoNow(),
      payload.questionId,
      payload.organizationId,
    ]
  );

  const after = await dbFirst<QuestionRow>(db, `select * from questions where id = ?`, [payload.questionId]);
  await writeAuditLog(db, {
    organizationId: payload.organizationId,
    actorUserId: payload.actorUserId,
    actorMemberId: payload.actorMemberId,
    action: 'question.updated',
    entityType: 'question',
    entityId: payload.questionId,
    beforeValue: before,
    afterValue: after,
  });

  return after as QuestionRow;
}

import { dbAll } from '../db/client';
import { createCoreValue } from './values';
import { createQuestion } from './questions';

export type ValueTemplate = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: number;
};

export type TemplateValueItem = {
  id: string;
  template_id: string;
  name: string;
  short_description: string;
  description: string | null;
  expected_behaviors: string;
  anti_patterns: string;
  example: string | null;
  color: string;
  icon_name: string;
  sort_order: number;
};

export type TemplateQuestionItem = {
  id: string;
  value_template_item_id: string;
  question_text: string;
  difficulty: string;
  suggested_rubric_note: string | null;
};

export async function listValueTemplates(db: D1Database): Promise<ValueTemplate[]> {
  return dbAll<ValueTemplate>(db, `select * from value_templates where is_active = 1 order by name asc`);
}

export async function getTemplateBundle(db: D1Database, templateId: string) {
  const values = await dbAll<TemplateValueItem>(db, `select * from value_template_items where template_id = ? order by sort_order asc`, [templateId]);
  const questions = await dbAll<TemplateQuestionItem>(
    db,
    `select * from question_template_items where value_template_item_id in (select id from value_template_items where template_id = ?)`,
    [templateId]
  );

  return { values, questions };
}

export async function applyTemplateToOrganization(
  db: D1Database,
  payload: {
    organizationId: string;
    actorUserId: string | null;
    actorMemberId: string | null;
    templateCode: string;
  }
): Promise<void> {
  const template = await dbAll<{ id: string }>(db, `select id from value_templates where code = ? and is_active = 1 limit 1`, [payload.templateCode]);
  const templateId = template[0]?.id;
  if (!templateId) {
    return;
  }

  const bundle = await getTemplateBundle(db, templateId);
  for (const value of bundle.values) {
    const createdValue = await createCoreValue(db, {
      organizationId: payload.organizationId,
      actorUserId: payload.actorUserId,
      actorMemberId: payload.actorMemberId,
      name: value.name,
      shortDescription: value.short_description,
      description: value.description || '',
      example: value.example || '',
      color: value.color,
      iconName: value.icon_name,
      sortOrder: value.sort_order,
      expectedBehaviors: JSON.parse(value.expected_behaviors || '[]'),
      antiPatterns: JSON.parse(value.anti_patterns || '[]'),
    });

    const questionItems = bundle.questions.filter((question) => question.value_template_item_id === value.id);
    for (const question of questionItems) {
      await createQuestion(db, {
        organizationId: payload.organizationId,
        actorUserId: payload.actorUserId,
        actorMemberId: payload.actorMemberId,
        coreValueId: createdValue.id,
        questionText: question.question_text,
        difficulty: question.difficulty as 'easy' | 'medium' | 'hard',
        suggestedRubricNote: question.suggested_rubric_note || '',
      });
    }
  }
}

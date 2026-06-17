import type { APIRoute } from 'astro';
import { getCloudflareRuntime } from '../../../../lib/cloudflare/bindings';
import { questionSchema } from '../../../../lib/validations';
import { createQuestion } from '../../../../lib/services/questions';
import { json } from '../../../../lib/http/response';
import { readFormDataValue, readJsonBody } from '../../../../lib/http/forms';
import { canManageValues } from '../../../../lib/permissions';

export const POST: APIRoute = async ({ request, locals }) => {
  const runtime = getCloudflareRuntime(locals);
  if (!runtime?.env?.DB) {
    return new Response('Konfigurasi runtime tidak tersedia.', { status: 500 });
  }

  if (!locals.organization || !locals.membership) {
    return new Response('Organisasi tidak tersedia.', { status: 403 });
  }
  if (!canManageValues(locals.membership.role)) {
    return new Response('Anda tidak memiliki izin untuk aksi ini.', { status: 403 });
  }

  const contentType = request.headers.get('content-type') || '';
  const input =
    contentType.includes('application/json')
      ? await readJsonBody(request)
      : {
          coreValueId: await readFormDataValue(request, 'coreValueId'),
          questionText: await readFormDataValue(request, 'questionText'),
          difficulty: await readFormDataValue(request, 'difficulty'),
          suggestedRubricNote: await readFormDataValue(request, 'suggestedRubricNote'),
          isActive: await readFormDataValue(request, 'isActive'),
        };

  const parsed = questionSchema.parse(input);
  const created = await createQuestion(runtime.env.DB, {
    organizationId: locals.organization.id,
    actorUserId: locals.user?.id ?? null,
    actorMemberId: locals.membership?.id ?? null,
    coreValueId: parsed.coreValueId,
    questionText: parsed.questionText,
    difficulty: parsed.difficulty,
    suggestedRubricNote: parsed.suggestedRubricNote,
    isActive: parsed.isActive,
  });

  if (contentType.includes('application/json')) {
    return json({ ok: true, questionId: created.id }, { status: 201 });
  }

  return new Response(null, { status: 302, headers: { Location: `/settings/values/${parsed.coreValueId}` } });
};

import type { APIRoute } from 'astro';
import { getCloudflareRuntime } from '../../../../lib/cloudflare/bindings';
import { questionSchema } from '../../../../lib/validations';
import { updateQuestion } from '../../../../lib/services/questions';
import { json } from '../../../../lib/http/response';
import { readFormDataValue, readJsonBody } from '../../../../lib/http/forms';
import { canManageValues } from '../../../../lib/permissions';
import { zodFieldErrors } from '../../../../lib/utils/form-errors';

export const POST: APIRoute = async ({ params, request, locals }) => {
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

  const coreValueId = String((input as Record<string, unknown>).coreValueId || '');
  const questionId = params.id || '';
  const parsed = questionSchema.safeParse(input);
  if (!parsed.success) {
    const message = 'Periksa kembali data question yang Anda masukkan.';
    const fieldErrors = zodFieldErrors(parsed.error);
    if (contentType.includes('application/json')) return json({ ok: false, message, fieldErrors }, { status: 400 });
    const url = new URL(`/settings/values/${coreValueId}/questions/${questionId}/edit`, request.url);
    url.searchParams.set('error', message);
    url.searchParams.set('fieldErrors', JSON.stringify(fieldErrors));
    return new Response(null, { status: 302, headers: { Location: url.pathname + url.search } });
  }

  let updated;
  try {
    updated = await updateQuestion(runtime.env.DB, {
      organizationId: locals.organization.id,
      questionId,
      actorUserId: locals.user?.id ?? null,
      actorMemberId: locals.membership?.id ?? null,
      patch: {
        coreValueId: parsed.data.coreValueId,
        questionText: parsed.data.questionText,
        difficulty: parsed.data.difficulty,
        suggestedRubricNote: parsed.data.suggestedRubricNote,
        isActive: parsed.data.isActive,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Question gagal diperbarui.';
    if (contentType.includes('application/json')) return json({ ok: false, message }, { status: 400 });
    return new Response(null, { status: 302, headers: { Location: `/settings/values/${coreValueId}/questions/${questionId}/edit?error=${encodeURIComponent(message)}` } });
  }

  if (contentType.includes('application/json')) {
    return json({ ok: true, questionId: updated.id });
  }

  return new Response(null, { status: 302, headers: { Location: `/settings/values/${parsed.data.coreValueId}/questions?success=${encodeURIComponent('Question berhasil diperbarui.')}` } });
};

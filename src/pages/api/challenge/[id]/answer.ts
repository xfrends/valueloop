import type { APIRoute } from 'astro';
import { getCloudflareRuntime } from '../../../../lib/cloudflare/bindings';
import { challengeAnswerSchema } from '../../../../lib/validations';
import { submitAnswer } from '../../../../lib/services/challenge';
import { json } from '../../../../lib/http/response';
import { readFormDataValue, readJsonBody } from '../../../../lib/http/forms';
import { canRunChallenge } from '../../../../lib/permissions';

export const POST: APIRoute = async ({ params, request, locals }) => {
  const runtime = getCloudflareRuntime(locals);
  if (!runtime?.env?.DB) {
    return new Response('Konfigurasi runtime tidak tersedia.', { status: 500 });
  }

  if (!locals.organization || !locals.membership) {
    return new Response('Organisasi tidak tersedia.', { status: 403 });
  }
  if (!canRunChallenge(locals.membership.role)) {
    return new Response('Anda tidak memiliki izin untuk aksi ini.', { status: 403 });
  }

  const contentType = request.headers.get('content-type') || '';
  const input =
    contentType.includes('application/json')
      ? await readJsonBody(request)
      : {
          answerText: await readFormDataValue(request, 'answerText'),
        };

  const parsed = challengeAnswerSchema.parse(input);
  const session = await submitAnswer(runtime.env.DB, {
    organizationId: locals.organization.id,
    sessionId: params.id || '',
    actorUserId: locals.user?.id ?? null,
    actorMemberId: locals.membership?.id ?? null,
    answerText: parsed.answerText,
  });

  if (contentType.includes('application/json')) {
    return json({ ok: true, session });
  }

  return new Response(null, { status: 302, headers: { Location: '/challenge' } });
};

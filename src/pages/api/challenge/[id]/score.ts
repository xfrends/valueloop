import type { APIRoute } from 'astro';
import { getCloudflareRuntime } from '../../../../lib/cloudflare/bindings';
import { challengeScoreSchema } from '../../../../lib/validations';
import { submitScore } from '../../../../lib/services/challenge';
import { json } from '../../../../lib/http/response';
import { readFormDataValue, readJsonBody } from '../../../../lib/http/forms';
import { getOrganizationSettings } from '../../../../lib/services/shared';
import { canScoreChallenge } from '../../../../lib/permissions';

export const POST: APIRoute = async ({ params, request, locals }) => {
  const runtime = getCloudflareRuntime(locals);
  if (!runtime?.env?.DB) {
    return json({ ok: false, message: 'Konfigurasi runtime tidak tersedia.' }, { status: 500 });
  }

  if (!locals.organization || !locals.membership) {
    return new Response('Organisasi tidak tersedia.', { status: 403 });
  }
  if (!canScoreChallenge(locals.membership.role)) {
    return new Response('Anda tidak memiliki izin untuk aksi ini.', { status: 403 });
  }

  const contentType = request.headers.get('content-type') || '';
  const input =
    contentType.includes('application/json')
      ? await readJsonBody(request)
      : {
          score: await readFormDataValue(request, 'score'),
          evaluatorNote: await readFormDataValue(request, 'evaluatorNote'),
        };

  const parsed = challengeScoreSchema.parse(input);
  const settings = await getOrganizationSettings(runtime.env.DB, locals.organization.id);
  const session = await submitScore(runtime.env.DB, {
    organizationId: locals.organization.id,
    sessionId: params.id || '',
    actorUserId: locals.user?.id ?? null,
    actorMemberId: locals.membership?.id ?? null,
    score: parsed.score,
    evaluatorNote: parsed.evaluatorNote,
    allowSelfScoring: Boolean(settings.allowSelfScoring),
  });

  if (contentType.includes('application/json')) {
    return json({ ok: true, session });
  }

  return new Response(null, { status: 302, headers: { Location: '/challenge' } });
};

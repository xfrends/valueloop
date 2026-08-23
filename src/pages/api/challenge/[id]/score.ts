import type { APIRoute } from 'astro';
import { getCloudflareRuntime } from '../../../../lib/cloudflare/bindings';
import { challengeScoreSchema } from '../../../../lib/validations';
import { submitScore } from '../../../../lib/services/challenge';
import { json } from '../../../../lib/http/response';
import { readFormDataValue, readJsonBody } from '../../../../lib/http/forms';
import { getOrganizationSettings } from '../../../../lib/services/shared';
import { canScoreChallenge } from '../../../../lib/permissions';
import { zodFieldErrors } from '../../../../lib/utils/form-errors';

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

  const parsed = challengeScoreSchema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message || 'Skor wajib dipilih dari 0 sampai 10.';
    if (contentType.includes('application/json')) {
      return json({ ok: false, message, fieldErrors: zodFieldErrors(parsed.error) }, { status: 400 });
    }
    return new Response(null, { status: 302, headers: { Location: `/challenge?error=${encodeURIComponent(message)}` } });
  }
  const settings = await getOrganizationSettings(runtime.env.DB, locals.organization.id);
  let session;
  try {
    session = await submitScore(runtime.env.DB, {
      organizationId: locals.organization.id,
      sessionId: params.id || '',
      actorUserId: locals.user?.id ?? null,
      actorMemberId: locals.membership?.id ?? null,
      realtime: runtime.env.ORGANIZATION_REALTIME,
      score: parsed.data.score,
      evaluatorNote: parsed.data.evaluatorNote,
      allowSelfScoring: Boolean(settings.allowSelfScoring),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Penilaian challenge gagal dikirim.';
    if (contentType.includes('application/json')) return json({ ok: false, message }, { status: 409 });
    return new Response(null, { status: 302, headers: { Location: `/challenge?error=${encodeURIComponent(message)}` } });
  }

  if (contentType.includes('application/json')) {
    return json({ ok: true, session });
  }

  return new Response(null, { status: 302, headers: { Location: '/challenge' } });
};

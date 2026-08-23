import type { APIRoute } from 'astro';
import { getCloudflareRuntime } from '../../../../lib/cloudflare/bindings';
import { challengeAnswerSchema } from '../../../../lib/validations';
import { submitAnswer } from '../../../../lib/services/challenge';
import { json } from '../../../../lib/http/response';
import { readFormDataValue, readJsonBody } from '../../../../lib/http/forms';
import { canRunChallenge } from '../../../../lib/permissions';
import { zodFieldErrors } from '../../../../lib/utils/form-errors';

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

  const parsed = challengeAnswerSchema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message || 'Jawaban wajib diisi minimal 3 karakter.';
    if (contentType.includes('application/json')) {
      return json({ ok: false, message, fieldErrors: zodFieldErrors(parsed.error) }, { status: 400 });
    }
    return new Response(null, { status: 302, headers: { Location: `/challenge?error=${encodeURIComponent(message)}` } });
  }

  let session;
  try {
    session = await submitAnswer(runtime.env.DB, {
      organizationId: locals.organization.id,
      sessionId: params.id || '',
      actorUserId: locals.user?.id ?? null,
      actorMemberId: locals.membership?.id ?? null,
      realtime: runtime.env.ORGANIZATION_REALTIME,
      answerText: parsed.data.answerText,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Jawaban challenge gagal dikirim.';
    if (contentType.includes('application/json')) return json({ ok: false, message }, { status: 409 });
    return new Response(null, { status: 302, headers: { Location: `/challenge?error=${encodeURIComponent(message)}` } });
  }

  if (contentType.includes('application/json')) {
    return json({ ok: true, session });
  }

  return new Response(null, { status: 302, headers: { Location: '/challenge' } });
};

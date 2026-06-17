import type { APIRoute } from 'astro';
import { getCloudflareRuntime } from '../../../../lib/cloudflare/bindings';
import { json } from '../../../../lib/http/response';
import { rerollChallenge } from '../../../../lib/services/challenge';
import { readJsonBody } from '../../../../lib/http/forms';

export const POST: APIRoute = async ({ params, request, locals }) => {
  const runtime = getCloudflareRuntime(locals);
  if (!runtime?.env?.DB) {
    return json({ ok: false, message: 'Konfigurasi runtime tidak tersedia.' }, { status: 500 });
  }

  if (!locals.organization || !locals.membership) {
    return new Response('Organisasi tidak tersedia.', { status: 403 });
  }

  if (!['owner', 'admin', 'facilitator'].includes(locals.membership.role)) {
    return new Response('Anda tidak memiliki izin untuk aksi ini.', { status: 403 });
  }
  const contentType = request.headers.get('content-type') || '';
  const body: { reason?: string } = contentType.includes('application/json') ? await readJsonBody<{ reason?: string }>(request) : {};
  const session = await rerollChallenge(runtime.env.DB, {
    organizationId: locals.organization.id,
    sessionId: params.id || '',
    actorUserId: locals.user?.id ?? null,
    actorMemberId: locals.membership?.id ?? null,
    reason: body.reason,
  });

  if (contentType.includes('application/json')) {
    return json({ ok: true, session });
  }

  return new Response(null, { status: 302, headers: { Location: '/challenge' } });
};

import type { APIRoute } from 'astro';
import { getCloudflareRuntime } from '../../../lib/cloudflare/bindings';
import { startChallenge } from '../../../lib/services/challenge';

export const POST: APIRoute = async ({ locals }) => {
  const runtime = getCloudflareRuntime(locals);
  if (!runtime?.env?.DB) {
    return new Response('Konfigurasi runtime tidak tersedia.', { status: 500 });
  }

  if (!locals.organization || !locals.membership) {
    return new Response('Organisasi tidak tersedia.', { status: 403 });
  }

  if (!['owner', 'admin', 'facilitator'].includes(locals.membership.role)) {
    return new Response('Anda tidak memiliki izin untuk aksi ini.', { status: 403 });
  }
  try {
    await startChallenge(runtime.env.DB, {
      organizationId: locals.organization.id,
      actorUserId: locals.user?.id ?? null,
      actorMemberId: locals.membership?.id ?? null,
      realtime: runtime.env.ORGANIZATION_REALTIME,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Challenge gagal dimulai.';
    return new Response(null, { status: 302, headers: { Location: `/challenge?error=${encodeURIComponent(message)}` } });
  }

  return new Response(null, {
    status: 302,
    headers: { Location: '/challenge', 'Content-Type': 'text/plain; charset=utf-8' },
  });
};

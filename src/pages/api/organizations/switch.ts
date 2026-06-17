import type { APIRoute } from 'astro';
import { getCloudflareRuntime } from '../../../lib/cloudflare/bindings';
import { currentOrgCookie } from '../../../lib/auth/cookies';
import { switchOrganizationMembership } from '../../../lib/services/organization';
import { json } from '../../../lib/http/response';
import { readFormDataValue, readJsonBody } from '../../../lib/http/forms';

export const POST: APIRoute = async ({ request, locals }) => {
  const runtime = getCloudflareRuntime(locals);
  if (!runtime?.env?.DB) {
    return new Response('Konfigurasi runtime tidak tersedia.', { status: 500 });
  }

  if (!locals.user) {
    return new Response('Tidak diautentikasi.', { status: 401 });
  }

  const contentType = request.headers.get('content-type') || '';
  const input =
    contentType.includes('application/json')
      ? await readJsonBody(request)
      : {
          organizationId: await readFormDataValue(request, 'organizationId'),
        };

  const organizationId = String((input as { organizationId?: string }).organizationId || '').trim();
  const membership = await switchOrganizationMembership(runtime.env.DB, { organizationId, userId: locals.user.id });
  if (!membership) {
    return new Response('Anda tidak memiliki akses ke organisasi ini.', { status: 403 });
  }

  const headers = new Headers({ Location: '/dashboard' });
  headers.append('Set-Cookie', currentOrgCookie(membership.organizationId));

  if (contentType.includes('application/json')) {
    return json({ ok: true, redirectTo: '/dashboard' }, { headers });
  }

  return new Response(null, { status: 302, headers });
};

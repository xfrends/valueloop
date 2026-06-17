import type { APIRoute } from 'astro';
import { getCloudflareRuntime } from '../../../lib/cloudflare/bindings';
import { clearCurrentOrgCookie, clearSessionCookie } from '../../../lib/auth/cookies';
import { logoutSession } from '../../../lib/services/auth';
import { parseCookieHeader } from '../../../lib/http/cookies';

export const POST: APIRoute = async ({ request, locals }) => {
  const runtime = getCloudflareRuntime(locals);
  const cookies = parseCookieHeader(request.headers.get('cookie'));
  const token = cookies.get('valueloop_session');
  if (token && runtime?.env?.DB && runtime.env.KV) {
    await logoutSession(runtime.env.DB, runtime.env.KV, token);
  }

  const headers = new Headers({ Location: '/login' });
  headers.append('Set-Cookie', clearSessionCookie());
  headers.append('Set-Cookie', clearCurrentOrgCookie());

  return new Response(null, { status: 302, headers });
};

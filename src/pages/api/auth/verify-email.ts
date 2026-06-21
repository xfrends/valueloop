import type { APIRoute } from 'astro';
import { getCloudflareRuntime } from '../../../lib/cloudflare/bindings';
import { verifyEmailOtp } from '../../../lib/auth/email-verification';
import { markEmailVerified, createAuthSession } from '../../../lib/services/auth';
import { listUserOrganizations } from '../../../lib/services/organization';
import { clearCurrentOrgCookie, currentOrgCookie, sessionCookie } from '../../../lib/auth/cookies';
import { json } from '../../../lib/http/response';
import { readFormDataValue, readJsonBody } from '../../../lib/http/forms';

export const POST: APIRoute = async ({ request, locals }) => {
  const runtime = getCloudflareRuntime(locals);
  if (!runtime?.env?.DB || !runtime.env.KV) {
    return json({ ok: false, message: 'Konfigurasi runtime tidak tersedia.' }, { status: 500 });
  }

  const contentType = request.headers.get('content-type') || '';
  const input = contentType.includes('application/json')
    ? await readJsonBody<{ email?: string; otp?: string }>(request)
    : {
        email: await readFormDataValue(request, 'email'),
        otp: await readFormDataValue(request, 'otp'),
      };

  const email = String(input.email || '').trim().toLowerCase();
  const otp = String(input.otp || '').trim();
  const verified = await verifyEmailOtp(runtime.env.KV, { email, otp });
  if (!verified.ok) {
    if (contentType.includes('application/json')) {
      return json({ ok: false, message: verified.message }, { status: 400 });
    }
    const url = new URL('/verify-email', request.url);
    url.searchParams.set('email', email);
    url.searchParams.set('error', verified.message);
    return new Response(null, { status: 302, headers: { Location: url.pathname + url.search } });
  }

  const user = await markEmailVerified(runtime.env.DB, verified.userId);
  const session = await createAuthSession(runtime.env.DB, runtime.env.KV, user.id);
  const orgs = await listUserOrganizations(runtime.env.DB, user.id);
  const target = '/dashboard';

  const headers = new Headers({ Location: target });
  headers.append('Set-Cookie', sessionCookie(session.token, session.expiresAt));
  if (orgs[0]) {
    headers.append('Set-Cookie', currentOrgCookie(orgs[0].id));
  } else {
    headers.append('Set-Cookie', clearCurrentOrgCookie());
  }

  if (contentType.includes('application/json')) {
    return json({ ok: true, redirectTo: target }, { headers });
  }

  return new Response(null, { status: 302, headers });
};

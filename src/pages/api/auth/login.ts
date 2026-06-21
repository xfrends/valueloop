import type { APIRoute } from 'astro';
import { getCloudflareRuntime } from '../../../lib/cloudflare/bindings';
import { authLoginSchema } from '../../../lib/validations';
import { loginUser, createAuthSession } from '../../../lib/services/auth';
import { hasAnyUsers } from '../../../lib/services/bootstrap';
import { json } from '../../../lib/http/response';
import { SESSION_TTL_ONE_DAY_SECONDS, SESSION_TTL_SECONDS } from '../../../lib/auth/constants';
import { clearCurrentOrgCookie, currentOrgCookie, sessionCookie } from '../../../lib/auth/cookies';
import { readFormDataValue, readJsonBody } from '../../../lib/http/forms';
import { listUserOrganizations } from '../../../lib/services/organization';
import { zodFieldErrors } from '../../../lib/utils/form-errors';

export const POST: APIRoute = async ({ request, locals }) => {
  const runtime = getCloudflareRuntime(locals);
  if (!runtime?.env?.DB || !runtime.env.KV) {
    return json({ ok: false, message: 'Konfigurasi runtime tidak tersedia.' }, { status: 500 });
  }

  if (!(await hasAnyUsers(runtime.env.DB))) {
    return json({ ok: false, message: 'Instalasi belum disiapkan. Jalankan `npm run setup` terlebih dahulu.' }, { status: 403 });
  }

  const contentType = request.headers.get('content-type') || '';
  const input =
    contentType.includes('application/json')
      ? await readJsonBody(request)
      : {
          email: await readFormDataValue(request, 'email'),
          password: await readFormDataValue(request, 'password'),
          rememberMe: await readFormDataValue(request, 'rememberMe'),
        };

  const parsed = authLoginSchema.safeParse(input);
  if (!parsed.success) {
    const message = 'Email dan kata sandi wajib diisi dengan benar.';
    const fieldErrors = zodFieldErrors(parsed.error);
    if (contentType.includes('application/json')) {
      return json({ ok: false, message, fieldErrors }, { status: 400 });
    }
    const redirect = new URL('/login', request.url);
    redirect.searchParams.set('error', message);
    redirect.searchParams.set('fieldErrors', JSON.stringify(fieldErrors));
    redirect.searchParams.set('email', String(input.email || ''));
    if (String(input.rememberMe || '') === 'on') {
      redirect.searchParams.set('rememberMe', '1');
    }
    return new Response(null, { status: 302, headers: { Location: redirect.pathname + redirect.search } });
  }

  let user;
  try {
    user = await loginUser(runtime.env.DB, parsed.data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Email atau kata sandi salah.';
    if (contentType.includes('application/json')) {
      return json({ ok: false, message }, { status: 400 });
    }
    const redirect = new URL('/login', request.url);
    redirect.searchParams.set('error', message);
    redirect.searchParams.set('email', parsed.data.email);
    if (parsed.data.rememberMe) {
      redirect.searchParams.set('rememberMe', '1');
    }
    return new Response(null, { status: 302, headers: { Location: redirect.pathname + redirect.search } });
  }
  const sessionTtlSeconds = parsed.data.rememberMe ? SESSION_TTL_SECONDS : SESSION_TTL_ONE_DAY_SECONDS;
  const session = await createAuthSession(runtime.env.DB, runtime.env.KV, user.id, sessionTtlSeconds);
  const orgs = await listUserOrganizations(runtime.env.DB, user.id);
  const target = '/dashboard';

  const headers = new Headers();
  headers.append('Set-Cookie', sessionCookie(session.token, session.expiresAt));
  if (orgs[0]) {
    headers.append('Set-Cookie', currentOrgCookie(orgs[0].id));
  } else {
    headers.append('Set-Cookie', clearCurrentOrgCookie());
  }
  headers.append('Location', target);

  if (contentType.includes('application/json')) {
    return json({ ok: true, redirectTo: target }, { headers });
  }

  return new Response(null, { status: 303, headers });
};

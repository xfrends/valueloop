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
  const contentType = request.headers.get('content-type') || '';
  const redirectWithError = (params: {
    message: string;
    alert: 'validation' | 'credentials' | 'email_unverified' | 'system';
    email?: string;
    rememberMe?: boolean;
    fieldErrors?: Record<string, string>;
    status?: number;
  }) => {
    if (contentType.includes('application/json')) {
      return json(
        { ok: false, message: params.message, alert: params.alert, fieldErrors: params.fieldErrors },
        { status: params.status || 400 }
      );
    }

    const redirect = new URL('/login', request.url);
    redirect.searchParams.set('error', params.message);
    redirect.searchParams.set('alert', params.alert);
    if (params.fieldErrors && Object.keys(params.fieldErrors).length > 0) {
      redirect.searchParams.set('fieldErrors', JSON.stringify(params.fieldErrors));
    }
    if (params.email !== undefined) {
      redirect.searchParams.set('email', params.email);
    }
    if (params.rememberMe) {
      redirect.searchParams.set('rememberMe', '1');
    }
    return new Response(null, { status: 302, headers: { Location: redirect.pathname + redirect.search } });
  };

  const runtime = getCloudflareRuntime(locals);
  if (!runtime?.env?.DB || !runtime.env.KV) {
    return redirectWithError({
      message: 'Layanan login sedang tidak tersedia karena konfigurasi runtime belum lengkap.',
      alert: 'system',
      status: 500,
    });
  }

  if (!(await hasAnyUsers(runtime.env.DB))) {
    return redirectWithError({
      message: 'Instalasi belum disiapkan. Jalankan `npm run setup` terlebih dahulu.',
      alert: 'system',
      status: 403,
    });
  }

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
    const fieldErrors = zodFieldErrors(parsed.error);
    return redirectWithError({
      message: 'Periksa kembali data login yang Anda masukkan.',
      alert: 'validation',
      fieldErrors,
      email: String(input.email || ''),
      rememberMe: String(input.rememberMe || '') === 'on',
    });
  }

  let user;
  try {
    user = await loginUser(runtime.env.DB, parsed.data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Email atau kata sandi salah.';
    const errorCode = (error as { code?: unknown } | null)?.code;
    const emailUnverified = errorCode === 'email_unverified';
    return redirectWithError({
      message,
      alert: emailUnverified ? 'email_unverified' : 'credentials',
      fieldErrors: emailUnverified ? undefined : { password: 'Email atau kata sandi tidak cocok.' },
      email: parsed.data.email,
      rememberMe: parsed.data.rememberMe,
    });
  }

  let session;
  let orgs;
  try {
    const sessionTtlSeconds = parsed.data.rememberMe ? SESSION_TTL_SECONDS : SESSION_TTL_ONE_DAY_SECONDS;
    session = await createAuthSession(runtime.env.DB, runtime.env.KV, user.id, sessionTtlSeconds);
    orgs = await listUserOrganizations(runtime.env.DB, user.id);
  } catch (error) {
    console.error('[ValueLoop] Gagal membuat sesi login', {
      userId: user.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return redirectWithError({
      message: 'Login berhasil diverifikasi, tetapi sesi tidak dapat dibuat. Silakan coba lagi.',
      alert: 'system',
      email: parsed.data.email,
      rememberMe: parsed.data.rememberMe,
      status: 500,
    });
  }
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

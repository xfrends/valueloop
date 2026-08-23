import type { APIRoute } from 'astro';
import { getCloudflareRuntime } from '../../../lib/cloudflare/bindings';
import { clearCurrentOrgCookie, clearSessionCookie } from '../../../lib/auth/cookies';
import { createEmailVerificationOtp } from '../../../lib/auth/email-verification';
import { logoutSession, updateUserProfile } from '../../../lib/services/auth';
import { userProfileSchema } from '../../../lib/validations';
import { readFormDataValue, readJsonBody } from '../../../lib/http/forms';
import { json } from '../../../lib/http/response';
import { zodFieldErrors } from '../../../lib/utils/form-errors';

export const POST: APIRoute = async ({ request, locals }) => {
  const runtime = getCloudflareRuntime(locals);
  if (!runtime?.env?.DB || !runtime.env.KV) {
    return json({ ok: false, message: 'Konfigurasi runtime tidak tersedia.' }, { status: 500 });
  }
  if (!locals.user || !locals.session) {
    return json({ ok: false, message: 'Anda harus masuk untuk mengubah profil.' }, { status: 401 });
  }

  const contentType = request.headers.get('content-type') || '';
  const input = contentType.includes('application/json')
    ? await readJsonBody(request)
    : {
        fullName: await readFormDataValue(request, 'fullName'),
        email: await readFormDataValue(request, 'email'),
        currentPassword: await readFormDataValue(request, 'currentPassword'),
      };
  const parsed = userProfileSchema.safeParse(input);
  if (!parsed.success) {
    const message = 'Periksa kembali data profil yang Anda masukkan.';
    const fieldErrors = zodFieldErrors(parsed.error);
    if (contentType.includes('application/json')) {
      return json({ ok: false, message, fieldErrors }, { status: 400 });
    }
    const url = new URL('/profile', request.url);
    url.searchParams.set('form', 'profile');
    url.searchParams.set('error', message);
    url.searchParams.set('fieldErrors', JSON.stringify(fieldErrors));
    return new Response(null, { status: 302, headers: { Location: url.pathname + url.search } });
  }

  let result;
  try {
    result = await updateUserProfile(runtime.env.DB, {
      userId: locals.user.id,
      ...parsed.data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Profil gagal diperbarui.';
    const fieldErrors = message.includes('Kata sandi') ? { currentPassword: message } : message.includes('Email') ? { email: message } : undefined;
    if (contentType.includes('application/json')) {
      return json({ ok: false, message, fieldErrors }, { status: 400 });
    }
    const url = new URL('/profile', request.url);
    url.searchParams.set('form', 'profile');
    url.searchParams.set('error', message);
    if (fieldErrors) url.searchParams.set('fieldErrors', JSON.stringify(fieldErrors));
    return new Response(null, { status: 302, headers: { Location: url.pathname + url.search } });
  }

  if (result.emailChanged) {
    const verifyUrl = new URL('/verify-email', request.url);
    verifyUrl.searchParams.set('email', result.profile.email);
    try {
      const delivery = await createEmailVerificationOtp(runtime.env.KV, {
        userId: result.profile.id,
        email: result.profile.email,
        smtp: {
          host: runtime.env.SMTP_HOST,
          port: runtime.env.SMTP_PORT,
          username: runtime.env.SMTP_USERNAME,
          password: runtime.env.SMTP_PASSWORD,
          from: runtime.env.SMTP_FROM || runtime.env.AUTH_EMAIL_FROM,
          secure: runtime.env.SMTP_SECURE,
        },
      });
      if (delivery.devOtp) verifyUrl.searchParams.set('devOtp', delivery.devOtp);
    } catch {
      verifyUrl.searchParams.set('error', 'Kode OTP belum dapat dikirim. Silakan gunakan tombol kirim ulang kode.');
    }

    await logoutSession(runtime.env.DB, runtime.env.KV, locals.session.token);
    const headers = new Headers({ Location: verifyUrl.pathname + verifyUrl.search });
    headers.append('Set-Cookie', clearSessionCookie());
    headers.append('Set-Cookie', clearCurrentOrgCookie());
    if (contentType.includes('application/json')) {
      return json({ ok: true, emailVerificationRequired: true, redirectTo: verifyUrl.pathname + verifyUrl.search }, { headers });
    }
    return new Response(null, { status: 302, headers });
  }

  const message = 'Data profil berhasil diperbarui.';
  if (contentType.includes('application/json')) return json({ ok: true, message });
  return new Response(null, { status: 302, headers: { Location: `/profile?success=${encodeURIComponent(message)}` } });
};

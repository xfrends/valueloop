import type { APIRoute } from 'astro';
import { getCloudflareRuntime } from '../../../lib/cloudflare/bindings';
import { authSignupSchema } from '../../../lib/validations';
import { signupUser } from '../../../lib/services/auth';
import { hasAnyUsers } from '../../../lib/services/bootstrap';
import { json } from '../../../lib/http/response';
import { readFormDataValue, readJsonBody } from '../../../lib/http/forms';
import { createEmailVerificationOtp } from '../../../lib/auth/email-verification';
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
          fullName: await readFormDataValue(request, 'fullName'),
          email: await readFormDataValue(request, 'email'),
          password: await readFormDataValue(request, 'password'),
          termsAccepted: await readFormDataValue(request, 'termsAccepted'),
        };

  const parsed = authSignupSchema.safeParse(input);
  if (!parsed.success) {
    const message = 'Nama, email, kata sandi, dan persetujuan syarat wajib diisi dengan benar. Kata sandi minimal 8 karakter.';
    const fieldErrors = zodFieldErrors(parsed.error);
    if (contentType.includes('application/json')) {
      return json({ ok: false, message, fieldErrors }, { status: 400 });
    }
    const redirect = new URL('/signup', request.url);
    redirect.searchParams.set('error', message);
    redirect.searchParams.set('fieldErrors', JSON.stringify(fieldErrors));
    redirect.searchParams.set('fullName', String(input.fullName || ''));
    redirect.searchParams.set('email', String(input.email || ''));
    return new Response(null, { status: 302, headers: { Location: redirect.pathname + redirect.search } });
  }

  let user;
  try {
    user = await signupUser(runtime.env.DB, parsed.data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Pendaftaran gagal.';
    if (contentType.includes('application/json')) {
      return json({ ok: false, message }, { status: 400 });
    }
    return new Response(null, { status: 302, headers: { Location: `/signup?error=${encodeURIComponent(message)}` } });
  }

  const verifyUrl = new URL('/verify-email', request.url);
  verifyUrl.searchParams.set('email', user.email);

  try {
    const delivery = await createEmailVerificationOtp(runtime.env.KV, {
      userId: user.id,
      email: user.email,
      smtp: {
        host: runtime.env.SMTP_HOST,
        port: runtime.env.SMTP_PORT,
        username: runtime.env.SMTP_USERNAME,
        password: runtime.env.SMTP_PASSWORD,
        from: runtime.env.SMTP_FROM || runtime.env.AUTH_EMAIL_FROM,
        secure: runtime.env.SMTP_SECURE,
      },
    });

    if (delivery.devOtp) {
      verifyUrl.searchParams.set('devOtp', delivery.devOtp);
    }
  } catch (error) {
    console.error('[ValueLoop] Gagal mengirim OTP verifikasi email', {
      userId: user.id,
      email: user.email,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const headers = new Headers({ Location: verifyUrl.pathname + verifyUrl.search });

  if (contentType.includes('application/json')) {
    return json({ ok: true, redirectTo: verifyUrl.pathname + verifyUrl.search }, { headers });
  }

  return new Response(null, { status: 302, headers });
};

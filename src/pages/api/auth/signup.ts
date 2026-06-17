import type { APIRoute } from 'astro';
import { getCloudflareRuntime } from '../../../lib/cloudflare/bindings';
import { authSignupSchema } from '../../../lib/validations';
import { signupUser } from '../../../lib/services/auth';
import { hasAnyUsers } from '../../../lib/services/bootstrap';
import { json } from '../../../lib/http/response';
import { readFormDataValue, readJsonBody } from '../../../lib/http/forms';
import { createEmailVerificationOtp } from '../../../lib/auth/email-verification';

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
        };

  const parsed = authSignupSchema.safeParse(input);
  if (!parsed.success) {
    const message = 'Nama, email, dan kata sandi wajib diisi dengan benar. Kata sandi minimal 8 karakter.';
    if (contentType.includes('application/json')) {
      return json({ ok: false, message }, { status: 400 });
    }
    return new Response(null, { status: 302, headers: { Location: `/signup?error=${encodeURIComponent(message)}` } });
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

  const verifyUrl = new URL('/verify-email', request.url);
  verifyUrl.searchParams.set('email', user.email);
  if (delivery.devOtp) {
    verifyUrl.searchParams.set('devOtp', delivery.devOtp);
  }

  const headers = new Headers({ Location: verifyUrl.pathname + verifyUrl.search });

  if (contentType.includes('application/json')) {
    return json({ ok: true, redirectTo: verifyUrl.pathname + verifyUrl.search, devOtp: delivery.devOtp }, { headers });
  }

  return new Response(null, { status: 302, headers });
};

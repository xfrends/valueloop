import type { APIRoute } from 'astro';
import { getCloudflareRuntime } from '../../../lib/cloudflare/bindings';
import { createEmailVerificationOtp } from '../../../lib/auth/email-verification';
import { findUserByEmail } from '../../../lib/services/auth';
import { json } from '../../../lib/http/response';
import { readFormDataValue, readJsonBody } from '../../../lib/http/forms';

export const POST: APIRoute = async ({ request, locals }) => {
  const runtime = getCloudflareRuntime(locals);
  if (!runtime?.env?.DB || !runtime.env.KV) {
    return json({ ok: false, message: 'Konfigurasi runtime tidak tersedia.' }, { status: 500 });
  }

  const contentType = request.headers.get('content-type') || '';
  const input = contentType.includes('application/json')
    ? await readJsonBody<{ email?: string }>(request)
    : { email: await readFormDataValue(request, 'email') };

  const email = String(input.email || '').trim().toLowerCase();
  const user = await findUserByEmail(runtime.env.DB, email);
  if (!user) {
    return new Response('User tidak ditemukan.', { status: 404 });
  }
  if (user.email_verified_at) {
    return new Response('Email sudah terverifikasi.', { status: 400 });
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

  if (contentType.includes('application/json')) {
    return json({ ok: true, devOtp: delivery.devOtp });
  }

  const url = new URL('/verify-email', request.url);
  url.searchParams.set('email', user.email);
  if (delivery.devOtp) {
    url.searchParams.set('devOtp', delivery.devOtp);
  }
  return new Response(null, { status: 302, headers: { Location: url.pathname + url.search } });
};

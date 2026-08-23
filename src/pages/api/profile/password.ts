import type { APIRoute } from 'astro';
import { getCloudflareRuntime } from '../../../lib/cloudflare/bindings';
import { changeUserPassword } from '../../../lib/services/auth';
import { passwordChangeSchema } from '../../../lib/validations';
import { readFormDataValue, readJsonBody } from '../../../lib/http/forms';
import { json } from '../../../lib/http/response';
import { zodFieldErrors } from '../../../lib/utils/form-errors';

export const POST: APIRoute = async ({ request, locals }) => {
  const runtime = getCloudflareRuntime(locals);
  if (!runtime?.env?.DB) {
    return json({ ok: false, message: 'Konfigurasi runtime tidak tersedia.' }, { status: 500 });
  }
  if (!locals.user || !locals.session) {
    return json({ ok: false, message: 'Anda harus masuk untuk mengubah kata sandi.' }, { status: 401 });
  }

  const contentType = request.headers.get('content-type') || '';
  const input = contentType.includes('application/json')
    ? await readJsonBody(request)
    : {
        currentPassword: await readFormDataValue(request, 'currentPassword'),
        newPassword: await readFormDataValue(request, 'newPassword'),
        confirmPassword: await readFormDataValue(request, 'confirmPassword'),
      };
  const parsed = passwordChangeSchema.safeParse(input);
  if (!parsed.success) {
    const message = 'Periksa kembali data kata sandi yang Anda masukkan.';
    const fieldErrors = zodFieldErrors(parsed.error);
    if (contentType.includes('application/json')) {
      return json({ ok: false, message, fieldErrors }, { status: 400 });
    }
    const url = new URL('/profile', request.url);
    url.searchParams.set('form', 'password');
    url.searchParams.set('error', message);
    url.searchParams.set('fieldErrors', JSON.stringify(fieldErrors));
    return new Response(null, { status: 302, headers: { Location: url.pathname + url.search } });
  }

  try {
    await changeUserPassword(runtime.env.DB, {
      userId: locals.user.id,
      currentSessionId: locals.session.id,
      currentPassword: parsed.data.currentPassword,
      newPassword: parsed.data.newPassword,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kata sandi gagal diubah.';
    const field = message.includes('saat ini') ? 'currentPassword' : 'newPassword';
    if (contentType.includes('application/json')) {
      return json({ ok: false, message, fieldErrors: { [field]: message } }, { status: 400 });
    }
    const url = new URL('/profile', request.url);
    url.searchParams.set('form', 'password');
    url.searchParams.set('error', message);
    url.searchParams.set('fieldErrors', JSON.stringify({ [field]: message }));
    return new Response(null, { status: 302, headers: { Location: url.pathname + url.search } });
  }

  const message = 'Kata sandi berhasil diperbarui. Sesi lain telah dikeluarkan.';
  if (contentType.includes('application/json')) return json({ ok: true, message });
  return new Response(null, { status: 302, headers: { Location: `/profile?success=${encodeURIComponent(message)}` } });
};

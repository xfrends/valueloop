import type { APIRoute } from 'astro';
import { getCloudflareRuntime } from '../../../../lib/cloudflare/bindings';
import { acceptInvitation } from '../../../../lib/services/members';
import { dbFirst } from '../../../../lib/db/client';
import { currentOrgCookie } from '../../../../lib/auth/cookies';

export const POST: APIRoute = async ({ params, locals }) => {
  const runtime = getCloudflareRuntime(locals);
  if (!runtime?.env?.DB) {
    return new Response('Konfigurasi runtime tidak tersedia.', { status: 500 });
  }

  if (!locals.user) {
    return new Response('Tidak diautentikasi.', { status: 401 });
  }

  const user = await dbFirst<{ id: string; email: string }>(runtime.env.DB, `select id, email from users where id = ?`, [locals.user.id]);
  if (!user) {
    return new Response('Pengguna tidak ditemukan.', { status: 404 });
  }

  let result;
  try {
    result = await acceptInvitation(runtime.env.DB, {
      inviteToken: params.token || '',
      userId: user.id,
      userEmail: user.email,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Undangan gagal diterima.';
    return new Response(null, { status: 302, headers: { Location: `/login?error=${encodeURIComponent(message)}` } });
  }

  const headers = new Headers({ Location: '/dashboard' });
  headers.append('Set-Cookie', currentOrgCookie(result.organizationId));
  return new Response(null, { status: 302, headers });
};

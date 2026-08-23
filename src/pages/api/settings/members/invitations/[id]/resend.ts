import type { APIRoute } from 'astro';
import { getCloudflareRuntime } from '../../../../../../lib/cloudflare/bindings';
import { json } from '../../../../../../lib/http/response';
import { resendInvitation } from '../../../../../../lib/services/members';
import { canManageMembers } from '../../../../../../lib/permissions';

export const POST: APIRoute = async ({ params, request, locals }) => {
  const runtime = getCloudflareRuntime(locals);
  if (!runtime?.env?.DB) return json({ ok: false, message: 'Konfigurasi runtime tidak tersedia.' }, { status: 500 });
  if (!locals.organization || !locals.membership) return json({ ok: false, message: 'Organisasi tidak tersedia.' }, { status: 403 });
  if (!canManageMembers(locals.membership.role)) return json({ ok: false, message: 'Anda tidak memiliki izin untuk aksi ini.' }, { status: 403 });

  try {
    const result = await resendInvitation(runtime.env.DB, {
      organizationId: locals.organization.id,
      invitationId: params.id || '',
      actorUserId: locals.user?.id ?? null,
      actorMemberId: locals.membership.id,
    });
    if (!(request.headers.get('content-type') || '').includes('application/json')) {
      return new Response(null, { status: 302, headers: { Location: '/settings/members?success=Undangan berhasil dikirim ulang.' } });
    }
    return json({ ok: true, invitation: result.invitation, inviteToken: result.inviteToken });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Undangan gagal dikirim ulang.';
    if (!(request.headers.get('content-type') || '').includes('application/json')) {
      return new Response(null, { status: 302, headers: { Location: `/settings/members?error=${encodeURIComponent(message)}` } });
    }
    return json({ ok: false, message }, { status: 400 });
  }
};

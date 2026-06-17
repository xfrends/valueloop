import type { APIRoute } from 'astro';
import { getCloudflareRuntime } from '../../../../lib/cloudflare/bindings';
import { memberInviteSchema } from '../../../../lib/validations';
import { createInvitation } from '../../../../lib/services/members';
import { json } from '../../../../lib/http/response';
import { readFormDataValue, readJsonBody } from '../../../../lib/http/forms';
import { canManageMembers } from '../../../../lib/permissions';

export const POST: APIRoute = async ({ request, locals }) => {
  const runtime = getCloudflareRuntime(locals);
  if (!runtime?.env?.DB) {
    return new Response('Konfigurasi runtime tidak tersedia.', { status: 500 });
  }

  if (!locals.organization || !locals.membership) {
    return new Response('Organisasi tidak tersedia.', { status: 403 });
  }
  if (!canManageMembers(locals.membership.role)) {
    return new Response('Anda tidak memiliki izin untuk aksi ini.', { status: 403 });
  }

  const contentType = request.headers.get('content-type') || '';
  const input =
    contentType.includes('application/json')
      ? await readJsonBody(request)
      : {
          email: await readFormDataValue(request, 'email'),
          role: await readFormDataValue(request, 'role'),
        };

  const parsed = memberInviteSchema.safeParse(input);
  if (!parsed.success) {
    const message = 'Email dan role undangan tidak valid.';
    if (contentType.includes('application/json')) {
      return json({ ok: false, message }, { status: 400 });
    }
    return new Response(null, { status: 302, headers: { Location: `/settings/members?error=${encodeURIComponent(message)}` } });
  }

  if (parsed.data.role === 'owner' && locals.membership.role !== 'owner') {
    return new Response('Hanya owner yang dapat mengundang owner baru.', { status: 403 });
  }

  let result;
  try {
    result = await createInvitation(runtime.env.DB, {
      organizationId: locals.organization.id,
      email: parsed.data.email,
      role: parsed.data.role,
      invitedByMemberId: locals.membership.id,
      actorUserId: locals.user?.id ?? null,
      actorMemberId: locals.membership.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Undangan gagal dibuat.';
    if (contentType.includes('application/json')) {
      return json({ ok: false, message }, { status: 400 });
    }
    return new Response(null, { status: 302, headers: { Location: `/settings/members?error=${encodeURIComponent(message)}` } });
  }

  if (contentType.includes('application/json')) {
    return json({ ok: true, invitationId: result.invitation.id, inviteToken: result.inviteToken }, { status: 201 });
  }

  return new Response(null, { status: 302, headers: { Location: '/settings/members' } });
};

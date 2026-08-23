import type { APIRoute } from 'astro';
import { getCloudflareRuntime } from '../../../../../lib/cloudflare/bindings';
import { memberInviteSchema } from '../../../../../lib/validations';
import { changeOrganizationMemberRole } from '../../../../../lib/services/organization';
import { json } from '../../../../../lib/http/response';
import { readFormDataValue, readJsonBody } from '../../../../../lib/http/forms';
import { canManageMembers } from '../../../../../lib/permissions';

export const POST: APIRoute = async ({ params, request, locals }) => {
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
  const redirectPath = new URL(request.url).searchParams.get('source') === 'roles' ? '/settings/roles' : '/settings/members';
  const input =
    contentType.includes('application/json')
      ? await readJsonBody(request)
      : {
          role: await readFormDataValue(request, 'role'),
        };

  const parsed = memberInviteSchema.pick({ role: true }).safeParse(input);
  if (!parsed.success) {
    const message = 'Role anggota tidak valid.';
    if (contentType.includes('application/json')) {
      return json({ ok: false, message }, { status: 400 });
    }
    return new Response(null, { status: 302, headers: { Location: `${redirectPath}?error=${encodeURIComponent(message)}` } });
  }

  try {
    await changeOrganizationMemberRole(runtime.env.DB, {
      organizationId: locals.organization.id,
      memberId: params.id || '',
      role: parsed.data.role,
      actorUserId: locals.user?.id ?? null,
      actorMemberId: locals.membership.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Role anggota gagal diubah.';
    if (contentType.includes('application/json')) {
      return json({ ok: false, message }, { status: 400 });
    }
    return new Response(null, { status: 302, headers: { Location: `${redirectPath}?error=${encodeURIComponent(message)}` } });
  }

  if (contentType.includes('application/json')) {
    return json({ ok: true });
  }

  return new Response(null, { status: 302, headers: { Location: `${redirectPath}?success=${encodeURIComponent('Role anggota berhasil diperbarui.')}` } });
};

import type { APIRoute } from 'astro';
import { getCloudflareRuntime } from '../../../../../lib/cloudflare/bindings';
import { teamMemberSchema } from '../../../../../lib/validations';
import { addMemberToTeam, removeMemberFromTeam } from '../../../../../lib/services/members';
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
  const input =
    contentType.includes('application/json')
      ? await readJsonBody(request)
      : {
          organizationMemberId: await readFormDataValue(request, 'organizationMemberId'),
        };

  const parsed = teamMemberSchema.parse(input);
  await addMemberToTeam(runtime.env.DB, {
    organizationId: locals.organization.id,
    teamId: params.id || '',
    organizationMemberId: parsed.organizationMemberId,
    actorUserId: locals.user?.id ?? null,
    actorMemberId: locals.membership.id,
  });

  if (contentType.includes('application/json')) {
    return json({ ok: true });
  }

  return new Response(null, { status: 302, headers: { Location: '/settings/teams' } });
};

export const DELETE: APIRoute = async ({ params, request, locals }) => {
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
          organizationMemberId: await readFormDataValue(request, 'organizationMemberId'),
        };

  const parsed = teamMemberSchema.parse(input);
  await removeMemberFromTeam(runtime.env.DB, {
    organizationId: locals.organization.id,
    teamId: params.id || '',
    organizationMemberId: parsed.organizationMemberId,
    actorUserId: locals.user?.id ?? null,
    actorMemberId: locals.membership.id,
  });

  if (contentType.includes('application/json')) {
    return json({ ok: true });
  }

  return new Response(null, { status: 302, headers: { Location: '/settings/teams' } });
};

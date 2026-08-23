import type { APIRoute } from 'astro';
import { getCloudflareRuntime } from '../../../../lib/cloudflare/bindings';
import { teamSchema } from '../../../../lib/validations';
import { updateTeam } from '../../../../lib/services/members';
import { json } from '../../../../lib/http/response';
import { readFormDataValue, readJsonBody } from '../../../../lib/http/forms';
import { hasPermission, PERMISSIONS } from '../../../../lib/permissions';

export const POST: APIRoute = async ({ params, request, locals }) => {
  const runtime = getCloudflareRuntime(locals);
  if (!runtime?.env?.DB) {
    return new Response('Konfigurasi runtime tidak tersedia.', { status: 500 });
  }

  if (!locals.organization || !locals.membership) {
    return new Response('Organisasi tidak tersedia.', { status: 403 });
  }
  if (!hasPermission(locals.membership.role, PERMISSIONS.TEAMS_MANAGE)) {
    return new Response('Anda tidak memiliki izin untuk aksi ini.', { status: 403 });
  }

  const contentType = request.headers.get('content-type') || '';
  const input =
    contentType.includes('application/json')
      ? await readJsonBody(request)
      : {
          name: await readFormDataValue(request, 'name'),
          description: await readFormDataValue(request, 'description'),
          isActive: await readFormDataValue(request, 'isActive'),
        };

  const teamId = params.id || '';
  const parsed = teamSchema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message || 'Data tim tidak valid.';
    if (contentType.includes('application/json')) return json({ ok: false, message }, { status: 400 });
    return new Response(null, { status: 302, headers: { Location: `/settings/teams/${teamId}?error=${encodeURIComponent(message)}` } });
  }

  let team;
  try {
    team = await updateTeam(runtime.env.DB, {
      organizationId: locals.organization.id,
      teamId,
      actorUserId: locals.user?.id ?? null,
      actorMemberId: locals.membership.id,
      patch: {
        name: parsed.data.name,
        description: parsed.data.description,
        isActive: parsed.data.isActive,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Tim gagal diperbarui.';
    if (contentType.includes('application/json')) return json({ ok: false, message }, { status: 400 });
    return new Response(null, { status: 302, headers: { Location: `/settings/teams/${teamId}?error=${encodeURIComponent(message)}` } });
  }

  if (contentType.includes('application/json')) {
    return json({ ok: true, teamId: team.id });
  }

  return new Response(null, { status: 302, headers: { Location: `/settings/teams/${team.id}?success=${encodeURIComponent('Tim berhasil diperbarui.')}` } });
};

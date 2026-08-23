import type { APIRoute } from 'astro';
import { getCloudflareRuntime } from '../../../../../lib/cloudflare/bindings';
import { teamMemberSchema } from '../../../../../lib/validations';
import { addMemberToTeam, removeMemberFromTeam } from '../../../../../lib/services/members';
import { json } from '../../../../../lib/http/response';
import { readFormDataValue, readJsonBody } from '../../../../../lib/http/forms';
import { hasPermission, PERMISSIONS } from '../../../../../lib/permissions';

function redirectWithMessage(teamId: string, kind: 'success' | 'error', message: string): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: `/settings/teams/${teamId}?${kind}=${encodeURIComponent(message)}` },
  });
}

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
      ? await readJsonBody<Record<string, unknown>>(request)
      : {
          organizationMemberId: await readFormDataValue(request, 'organizationMemberId'),
          intent: await readFormDataValue(request, 'intent'),
        };

  const parsed = teamMemberSchema.safeParse(input);
  if (!parsed.success) {
    const message = 'Anggota wajib dipilih.';
    if (contentType.includes('application/json')) return json({ ok: false, message }, { status: 400 });
    return redirectWithMessage(params.id || '', 'error', message);
  }

  const intent = input.intent === 'remove' ? 'remove' : 'add';
  try {
    const mutation = intent === 'remove' ? removeMemberFromTeam : addMemberToTeam;
    await mutation(runtime.env.DB, {
      organizationId: locals.organization.id,
      teamId: params.id || '',
      organizationMemberId: parsed.data.organizationMemberId,
      actorUserId: locals.user?.id ?? null,
      actorMemberId: locals.membership.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Relasi anggota dan tim gagal diperbarui.';
    if (contentType.includes('application/json')) return json({ ok: false, message }, { status: 400 });
    return redirectWithMessage(params.id || '', 'error', message);
  }

  if (contentType.includes('application/json')) {
    return json({ ok: true });
  }

  return redirectWithMessage(params.id || '', 'success', intent === 'remove' ? 'Anggota berhasil dikeluarkan dari tim.' : 'Anggota berhasil ditambahkan ke tim.');
};

export const DELETE: APIRoute = async ({ params, request, locals }) => {
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
          organizationMemberId: await readFormDataValue(request, 'organizationMemberId'),
        };

  const parsed = teamMemberSchema.safeParse(input);
  if (!parsed.success) return json({ ok: false, message: 'Anggota wajib dipilih.' }, { status: 400 });

  try {
    await removeMemberFromTeam(runtime.env.DB, {
      organizationId: locals.organization.id,
      teamId: params.id || '',
      organizationMemberId: parsed.data.organizationMemberId,
      actorUserId: locals.user?.id ?? null,
      actorMemberId: locals.membership.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Anggota gagal dikeluarkan dari tim.';
    return json({ ok: false, message }, { status: 400 });
  }

  if (contentType.includes('application/json')) {
    return json({ ok: true });
  }

  return new Response(null, { status: 302, headers: { Location: `/settings/teams/${params.id || ''}` } });
};

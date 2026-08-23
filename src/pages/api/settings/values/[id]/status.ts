import type { APIRoute } from 'astro';
import { getCloudflareRuntime } from '../../../../../lib/cloudflare/bindings';
import { readFormDataValue, readJsonBody } from '../../../../../lib/http/forms';
import { json } from '../../../../../lib/http/response';
import { canManageValues } from '../../../../../lib/permissions';
import { setCoreValueStatus } from '../../../../../lib/services/values';

export const POST: APIRoute = async ({ params, request, locals }) => {
  const runtime = getCloudflareRuntime(locals);
  if (!runtime?.env?.DB) return new Response('Konfigurasi runtime tidak tersedia.', { status: 500 });
  if (!locals.organization || !locals.membership) return new Response('Organisasi tidak tersedia.', { status: 403 });
  if (!canManageValues(locals.membership.role)) return new Response('Anda tidak memiliki izin untuk aksi ini.', { status: 403 });

  const valueId = params.id || '';
  const contentType = request.headers.get('content-type') || '';
  const input = contentType.includes('application/json')
    ? await readJsonBody<Record<string, unknown>>(request)
    : {
        isActive: await readFormDataValue(request, 'isActive'),
        source: await readFormDataValue(request, 'source'),
      };
  const isActive = Number(input.isActive);
  const source = input.source === 'edit' ? 'edit' : 'list';

  if (![0, 1].includes(isActive)) {
    const message = 'Status core value tidak valid.';
    if (contentType.includes('application/json')) return json({ ok: false, message }, { status: 400 });
    const destination = source === 'edit' ? `/settings/values/${valueId}/edit` : '/settings/values';
    return new Response(null, { status: 302, headers: { Location: `${destination}?error=${encodeURIComponent(message)}` } });
  }

  try {
    const value = await setCoreValueStatus(runtime.env.DB, {
      organizationId: locals.organization.id,
      valueId,
      actorUserId: locals.user?.id ?? null,
      actorMemberId: locals.membership.id,
      isActive,
    });
    if (contentType.includes('application/json')) return json({ ok: true, valueId: value.id, isActive: value.is_active });

    const success = isActive === 1 ? 'Core value berhasil diaktifkan.' : 'Core value berhasil dinonaktifkan.';
    const destination = source === 'edit' ? `/settings/values/${valueId}/edit` : '/settings/values';
    return new Response(null, { status: 302, headers: { Location: `${destination}?success=${encodeURIComponent(success)}` } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Status core value gagal diperbarui.';
    if (contentType.includes('application/json')) return json({ ok: false, message }, { status: 400 });
    const destination = source === 'edit' ? `/settings/values/${valueId}/edit` : '/settings/values';
    return new Response(null, { status: 302, headers: { Location: `${destination}?error=${encodeURIComponent(message)}` } });
  }
};

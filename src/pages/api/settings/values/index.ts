import type { APIRoute } from 'astro';
import { getCloudflareRuntime } from '../../../../lib/cloudflare/bindings';
import { valueSchema } from '../../../../lib/validations';
import { createCoreValue } from '../../../../lib/services/values';
import { json } from '../../../../lib/http/response';
import { readFormDataValue, readJsonBody } from '../../../../lib/http/forms';
import { parseTextList } from '../../../../lib/utils/json';
import { canManageValues } from '../../../../lib/permissions';
import { zodFieldErrors } from '../../../../lib/utils/form-errors';

export const POST: APIRoute = async ({ request, locals }) => {
  const runtime = getCloudflareRuntime(locals);
  if (!runtime?.env?.DB) {
    return new Response('Konfigurasi runtime tidak tersedia.', { status: 500 });
  }

  if (!locals.organization || !locals.membership) {
    return new Response('Organisasi tidak tersedia.', { status: 403 });
  }
  if (!canManageValues(locals.membership.role)) {
    return new Response('Anda tidak memiliki izin untuk aksi ini.', { status: 403 });
  }

  const contentType = request.headers.get('content-type') || '';
  const input =
    contentType.includes('application/json')
      ? await readJsonBody(request)
      : {
          name: await readFormDataValue(request, 'name'),
          shortDescription: await readFormDataValue(request, 'shortDescription'),
          description: await readFormDataValue(request, 'description'),
          example: await readFormDataValue(request, 'example'),
          color: await readFormDataValue(request, 'color'),
          iconName: await readFormDataValue(request, 'iconName'),
          sortOrder: await readFormDataValue(request, 'sortOrder'),
          isActive: await readFormDataValue(request, 'isActive'),
          expectedBehaviors: await readFormDataValue(request, 'expectedBehaviors'),
          antiPatterns: await readFormDataValue(request, 'antiPatterns'),
        };

  const parsed = valueSchema.safeParse(input);
  if (!parsed.success) {
    const message = 'Periksa kembali data core value yang Anda masukkan.';
    const fieldErrors = zodFieldErrors(parsed.error);
    if (contentType.includes('application/json')) {
      return json({ ok: false, message, fieldErrors }, { status: 400 });
    }
    const url = new URL('/settings/values/new', request.url);
    url.searchParams.set('error', message);
    url.searchParams.set('fieldErrors', JSON.stringify(fieldErrors));
    url.searchParams.set('name', String(input.name || ''));
    url.searchParams.set('shortDescription', String(input.shortDescription || ''));
    return new Response(null, { status: 302, headers: { Location: url.pathname + url.search } });
  }

  let created;
  try {
    created = await createCoreValue(runtime.env.DB, {
      organizationId: locals.organization.id,
      actorUserId: locals.user?.id ?? null,
      actorMemberId: locals.membership?.id ?? null,
      name: parsed.data.name,
      shortDescription: parsed.data.shortDescription,
      description: parsed.data.description,
      example: parsed.data.example,
      color: parsed.data.color,
      iconName: parsed.data.iconName,
      sortOrder: parsed.data.sortOrder,
      isActive: parsed.data.isActive,
      expectedBehaviors: parseTextList(parsed.data.expectedBehaviors),
      antiPatterns: parseTextList(parsed.data.antiPatterns),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Core value gagal dibuat.';
    if (contentType.includes('application/json')) {
      return json({ ok: false, message }, { status: 400 });
    }
    return new Response(null, { status: 302, headers: { Location: `/settings/values/new?error=${encodeURIComponent(message)}` } });
  }

  if (contentType.includes('application/json')) {
    return json({ ok: true, valueId: created.id }, { status: 201 });
  }

  return new Response(null, { status: 302, headers: { Location: `/settings/values?success=${encodeURIComponent('Core value berhasil dibuat sebagai inactive. Lengkapi seluruh field dan tambahkan minimal satu question aktif sebelum mengaktifkannya.')}` } });
};

import type { APIRoute } from 'astro';
import { getCloudflareRuntime } from '../../../../lib/cloudflare/bindings';
import { valueSchema } from '../../../../lib/validations';
import { updateCoreValue } from '../../../../lib/services/values';
import { json } from '../../../../lib/http/response';
import { readFormDataValue, readJsonBody } from '../../../../lib/http/forms';
import { parseJsonArray } from '../../../../lib/utils/json';
import { canManageValues } from '../../../../lib/permissions';

export const POST: APIRoute = async ({ params, request, locals }) => {
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

  const valueId = params.id || '';
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

  const parsed = valueSchema.parse(input);
  const updated = await updateCoreValue(runtime.env.DB, {
    organizationId: locals.organization.id,
    valueId,
    actorUserId: locals.user?.id ?? null,
    actorMemberId: locals.membership?.id ?? null,
    patch: {
      name: parsed.name,
      shortDescription: parsed.shortDescription,
      description: parsed.description,
      example: parsed.example,
      color: parsed.color,
      iconName: parsed.iconName,
      sortOrder: parsed.sortOrder,
      isActive: parsed.isActive,
      expectedBehaviors: parseJsonArray(parsed.expectedBehaviors) as string[],
      antiPatterns: parseJsonArray(parsed.antiPatterns) as string[],
    },
  });

  if (contentType.includes('application/json')) {
    return json({ ok: true, valueId: updated.id });
  }

  return new Response(null, { status: 302, headers: { Location: `/settings/values/${valueId}` } });
};

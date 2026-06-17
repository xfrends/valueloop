import type { APIRoute } from 'astro';
import { getCloudflareRuntime } from '../../../lib/cloudflare/bindings';
import { readFormDataValue, readJsonBody } from '../../../lib/http/forms';
import { json } from '../../../lib/http/response';
import { canManageOrganizationSettings } from '../../../lib/permissions';
import { updateOrganization, updateOrganizationSettings } from '../../../lib/services/organization';
import { getOrganizationSettings } from '../../../lib/services/shared';
import { organizationSettingsSchema } from '../../../lib/validations';

export const POST: APIRoute = async ({ request, locals }) => {
  const runtime = getCloudflareRuntime(locals);
  if (!runtime?.env?.DB) {
    return new Response('Konfigurasi runtime tidak tersedia.', { status: 500 });
  }

  if (!locals.organization || !locals.membership) {
    return new Response('Organisasi tidak tersedia.', { status: 403 });
  }

  if (!canManageOrganizationSettings(locals.membership.role)) {
    return new Response('Anda tidak memiliki izin untuk aksi ini.', { status: 403 });
  }

  const contentType = request.headers.get('content-type') || '';
  const input = contentType.includes('application/json')
    ? await readJsonBody(request)
    : {
        name: await readFormDataValue(request, 'name'),
        slug: await readFormDataValue(request, 'slug'),
        timezone: await readFormDataValue(request, 'timezone'),
        defaultLocale: await readFormDataValue(request, 'defaultLocale'),
        challengeFrequency: await readFormDataValue(request, 'challengeFrequency'),
        questionCooldownDays: await readFormDataValue(request, 'questionCooldownDays'),
        allowMultipleChallengesPerDay: await readFormDataValue(request, 'allowMultipleChallengesPerDay'),
        allowSelfScoring: await readFormDataValue(request, 'allowSelfScoring'),
      };

  const parsed = organizationSettingsSchema.parse(input);
  const previousSettings = await getOrganizationSettings(runtime.env.DB, locals.organization.id);

  await updateOrganization(runtime.env.DB, {
    organizationId: locals.organization.id,
    actorUserId: locals.user?.id ?? null,
    actorMemberId: locals.membership.id,
    name: parsed.name,
    slug: parsed.slug,
    timezone: parsed.timezone,
    defaultLocale: parsed.defaultLocale,
  });

  await updateOrganizationSettings(runtime.env.DB, {
    organizationId: locals.organization.id,
    actorUserId: locals.user?.id ?? null,
    actorMemberId: locals.membership.id,
    settings: {
      ...previousSettings,
      challengeFrequency: parsed.challengeFrequency,
      questionCooldownDays: parsed.questionCooldownDays,
      allowMultipleChallengesPerDay: parsed.allowMultipleChallengesPerDay === 1,
      allowSelfScoring: parsed.allowSelfScoring === 1,
    },
  });

  if (contentType.includes('application/json')) {
    return json({ ok: true });
  }

  return new Response(null, { status: 302, headers: { Location: '/settings' } });
};

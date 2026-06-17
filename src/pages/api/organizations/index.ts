import type { APIRoute } from 'astro';
import { getCloudflareRuntime } from '../../../lib/cloudflare/bindings';
import { organizationCreateSchema } from '../../../lib/validations';
import { createOrganizationWithOwner } from '../../../lib/services/auth';
import { applyTemplateToOrganization } from '../../../lib/services/templates';
import { currentOrgCookie } from '../../../lib/auth/cookies';
import { json } from '../../../lib/http/response';
import { readFormDataValue, readJsonBody } from '../../../lib/http/forms';
import { dbFirst } from '../../../lib/db/client';

export const POST: APIRoute = async ({ request, locals }) => {
  const runtime = getCloudflareRuntime(locals);
  if (!runtime?.env?.DB) {
    return new Response('Konfigurasi runtime tidak tersedia.', { status: 500 });
  }

  if (!locals.user) {
    return new Response('Tidak diautentikasi.', { status: 401 });
  }

  const contentType = request.headers.get('content-type') || '';
  const input =
    contentType.includes('application/json')
      ? await readJsonBody(request)
      : {
          name: await readFormDataValue(request, 'name'),
          slug: await readFormDataValue(request, 'slug'),
          timezone: await readFormDataValue(request, 'timezone'),
          defaultLocale: await readFormDataValue(request, 'defaultLocale'),
          templateId: await readFormDataValue(request, 'templateId'),
        };

  const parsed = organizationCreateSchema.safeParse(input);
  if (!parsed.success) {
    const message = 'Data organisasi tidak valid.';
    if (contentType.includes('application/json')) {
      return json({ ok: false, message }, { status: 400 });
    }
    return new Response(null, { status: 302, headers: { Location: `/onboarding?error=${encodeURIComponent(message)}` } });
  }

  let organization;
  try {
    organization = await createOrganizationWithOwner(runtime.env.DB, {
      name: parsed.data.name,
      slug: parsed.data.slug,
      timezone: parsed.data.timezone,
      defaultLocale: parsed.data.defaultLocale,
      ownerUserId: locals.user.id,
      ownerFullName: locals.user.full_name,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Organisasi gagal dibuat.';
    if (contentType.includes('application/json')) {
      return json({ ok: false, message }, { status: 400 });
    }
    return new Response(null, { status: 302, headers: { Location: `/onboarding?error=${encodeURIComponent(message)}` } });
  }
  const ownerMembership = await dbFirst<{ id: string }>(
    runtime.env.DB,
    `select id from organization_members where organization_id = ? and user_id = ? limit 1`,
    [organization.organizationId, locals.user.id]
  );

  if (parsed.data.templateId) {
    const template = await runtime.env.DB.prepare(`select code from value_templates where id = ? and is_active = 1`).bind(parsed.data.templateId).first<{ code: string }>();
    if (template?.code) {
      await applyTemplateToOrganization(runtime.env.DB, {
        organizationId: organization.organizationId,
        actorUserId: locals.user.id,
        actorMemberId: ownerMembership?.id ?? null,
        templateCode: template.code,
      });
    }
  }

  const headers = new Headers({ Location: '/dashboard' });
  headers.append('Set-Cookie', currentOrgCookie(organization.organizationId));

  if (contentType.includes('application/json')) {
    return json({ ok: true, organizationId: organization.organizationId, redirectTo: '/dashboard' }, { headers });
  }

  return new Response(null, { status: 302, headers });
};

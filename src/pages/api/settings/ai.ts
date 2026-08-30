import type { APIRoute } from 'astro';
import { getCloudflareRuntime } from '../../../lib/cloudflare/bindings';
import { readJsonBody } from '../../../lib/http/forms';
import { json } from '../../../lib/http/response';
import { hasPermission, PERMISSIONS } from '../../../lib/permissions';
import { getOrganizationAiSettings, upsertOrganizationAiSettings } from '../../../lib/services/ai-settings';
import { aiSettingsSchema } from '../../../lib/validations';
import { zodFieldErrors } from '../../../lib/utils/form-errors';

export const GET: APIRoute = async ({ locals }) => {
  const runtime = getCloudflareRuntime(locals);
  if (!runtime?.env.DB || !locals.organization || !locals.membership) return json({ ok: false, message: 'Organisasi tidak tersedia.' }, { status: 403 });
  const settings = await getOrganizationAiSettings(runtime.env.DB, locals.organization.id);
  return json({ ok: true, settings });
};

export const PUT: APIRoute = async ({ request, locals }) => {
  const runtime = getCloudflareRuntime(locals);
  if (!runtime?.env.DB || !locals.organization || !locals.membership) return json({ ok: false, message: 'Organisasi tidak tersedia.' }, { status: 403 });
  if (!hasPermission(locals.membership.role, PERMISSIONS.AI_SETTINGS_MANAGE)) return json({ ok: false, message: 'Anda tidak memiliki izin untuk mengatur AI.' }, { status: 403 });
  const parsed = aiSettingsSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return json({ ok: false, message: 'Periksa kembali konfigurasi AI yang Anda masukkan.', fieldErrors: zodFieldErrors(parsed.error) }, { status: 400 });
  try {
    await upsertOrganizationAiSettings(runtime.env.DB, { organizationId: locals.organization.id, actorUserId: locals.user?.id ?? null, actorMemberId: locals.membership.id, provider: parsed.data.provider, protocol: parsed.data.protocol, baseUrl: parsed.data.baseUrl, model: parsed.data.model, apiToken: parsed.data.apiToken, isEnabled: parsed.data.isEnabled, sessionSecret: runtime.env.SESSION_SECRET });
    return json({ ok: true, settings: await getOrganizationAiSettings(runtime.env.DB, locals.organization.id) });
  } catch (error) {
    return json({ ok: false, message: error instanceof Error ? error.message : 'Konfigurasi AI gagal disimpan.' }, { status: 400 });
  }
};

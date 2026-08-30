import type { APIRoute } from 'astro';
import { getCloudflareRuntime } from '../../../../lib/cloudflare/bindings';
import { verifyTurnstileToken } from '../../../../lib/cloudflare/turnstile';
import { json } from '../../../../lib/http/response';
import { hasPermission, PERMISSIONS } from '../../../../lib/permissions';
import { getOrganizationAiProviderConfig, auditAiEvent } from '../../../../lib/services/ai-settings';
import { generateCoreValueDraft } from '../../../../lib/ai/core-value-generator';
import { AiProviderError } from '../../../../lib/ai/types';

export const POST: APIRoute = async ({ request, locals }) => {
  const runtime = getCloudflareRuntime(locals);
  if (!runtime?.env.DB || !locals.organization || !locals.membership) return json({ ok: false, message: 'Organisasi tidak tersedia.' }, { status: 403 });
  if (!hasPermission(locals.membership.role, PERMISSIONS.AI_SETTINGS_MANAGE)) return json({ ok: false, message: 'Anda tidak memiliki izin untuk menguji koneksi AI.' }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { turnstileToken?: unknown };
  const allowedHostnames = (runtime.env.TURNSTILE_HOSTNAMES || new URL(request.url).hostname).split(',').map((hostname) => hostname.trim()).filter(Boolean);
  const turnstileValid = await verifyTurnstileToken(request, body.turnstileToken, runtime.env.TURNSTILE_SECRET_KEY, 'ai_connection_test', allowedHostnames);
  if (!turnstileValid) return json({ ok: false, message: 'Verifikasi keamanan gagal. Silakan selesaikan Turnstile lalu coba lagi.' }, { status: 403 });
  const config = await getOrganizationAiProviderConfig(runtime.env.DB, locals.organization.id, runtime.env.SESSION_SECRET);
  if (!config) return json({ ok: false, message: 'Konfigurasi AI belum aktif atau token belum tersedia.' }, { status: 400 });
  try {
    await generateCoreValueDraft(config, { basicInformation: 'Organisasi membutuhkan budaya kerja yang jelas.', organizationName: locals.organization.name, locale: locals.organization.default_locale }, Number(runtime.env.AI_GENERATION_TIMEOUT_MS || 30000));
    await auditAiEvent(runtime.env.DB, { organizationId: locals.organization.id, actorUserId: locals.user?.id ?? null, actorMemberId: locals.membership.id, action: 'ai.connection.tested', provider: config.provider, protocol: config.protocol, model: config.model, status: 'success' });
    return json({ ok: true, message: 'Koneksi AI berhasil diuji.' });
  } catch (error) {
    await auditAiEvent(runtime.env.DB, { organizationId: locals.organization.id, actorUserId: locals.user?.id ?? null, actorMemberId: locals.membership.id, action: 'ai.connection.tested', provider: config.provider, protocol: config.protocol, model: config.model, status: 'failure' });
    const message = error instanceof AiProviderError ? error.message : 'Koneksi ke provider AI gagal.';
    return json({ ok: false, message }, { status: error instanceof AiProviderError && error.code === 'timeout' ? 504 : 400 });
  }
};

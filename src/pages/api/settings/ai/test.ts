import type { APIRoute } from 'astro';
import { getCloudflareRuntime } from '../../../../lib/cloudflare/bindings';
import { consumeAiRateLimit } from '../../../../lib/cloudflare/ai-rate-limit';
import { json } from '../../../../lib/http/response';
import { hasPermission, PERMISSIONS } from '../../../../lib/permissions';
import { getOrganizationAiProviderConfig, auditAiEvent } from '../../../../lib/services/ai-settings';
import { generateCoreValueDraft } from '../../../../lib/ai/core-value-generator';
import { AiProviderError } from '../../../../lib/ai/types';

export const POST: APIRoute = async ({ locals }) => {
  const runtime = getCloudflareRuntime(locals);
  if (!runtime?.env.DB || !locals.organization || !locals.membership) return json({ ok: false, message: 'Organisasi tidak tersedia.' }, { status: 403 });
  if (!hasPermission(locals.membership.role, PERMISSIONS.AI_SETTINGS_MANAGE)) return json({ ok: false, message: 'Anda tidak memiliki izin untuk menguji koneksi AI.' }, { status: 403 });
  const rate = await consumeAiRateLimit(runtime.env.KV, locals.organization.id, 'test', 5);
  if (!rate.allowed) return json({ ok: false, message: 'Batas test koneksi AI tercapai. Coba lagi nanti.', retryAfter: rate.retryAfter }, { status: 429 });
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

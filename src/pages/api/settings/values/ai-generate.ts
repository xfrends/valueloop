import type { APIRoute } from 'astro';
import { getCloudflareRuntime } from '../../../../lib/cloudflare/bindings';
import { consumeAiRateLimit } from '../../../../lib/cloudflare/ai-rate-limit';
import { generateCoreValueDraft } from '../../../../lib/ai/core-value-generator';
import { AiProviderError } from '../../../../lib/ai/types';
import { readJsonBody } from '../../../../lib/http/forms';
import { json } from '../../../../lib/http/response';
import { hasPermission, PERMISSIONS } from '../../../../lib/permissions';
import { auditAiEvent, getOrganizationAiProviderConfig } from '../../../../lib/services/ai-settings';
import { aiGenerationSchema } from '../../../../lib/validations';

export const POST: APIRoute = async ({ request, locals }) => {
  const runtime = getCloudflareRuntime(locals);
  if (!runtime?.env.DB || !locals.organization || !locals.membership) return json({ ok: false, message: 'Organisasi tidak tersedia.' }, { status: 403 });
  if (!hasPermission(locals.membership.role, PERMISSIONS.CORE_VALUES_AI_GENERATE)) return json({ ok: false, message: 'Anda tidak memiliki izin untuk membuat rekomendasi AI.' }, { status: 403 });
  const parsed = aiGenerationSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return json({ ok: false, message: 'Informasi dasar harus berisi 20 sampai 4000 karakter.' }, { status: 400 });
  const rate = await consumeAiRateLimit(runtime.env.KV, locals.organization.id, 'generate', 10);
  if (!rate.allowed) return json({ ok: false, message: 'Batas generate AI organisasi tercapai. Coba lagi nanti.', retryAfter: rate.retryAfter }, { status: 429 });
  const config = await getOrganizationAiProviderConfig(runtime.env.DB, locals.organization.id, runtime.env.SESSION_SECRET);
  if (!config) return json({ ok: false, message: 'AI belum dikonfigurasi atau sedang nonaktif. Minta owner/admin menyiapkannya di Settings.' }, { status: 400 });
  try {
    const draft = await generateCoreValueDraft(config, { basicInformation: parsed.data.basicInformation, organizationName: locals.organization.name, locale: locals.organization.default_locale }, Number(runtime.env.AI_GENERATION_TIMEOUT_MS || 30000));
    await auditAiEvent(runtime.env.DB, { organizationId: locals.organization.id, actorUserId: locals.user?.id ?? null, actorMemberId: locals.membership.id, action: 'core_value.ai_generated', provider: config.provider, protocol: config.protocol, model: config.model, status: 'success' });
    return json({ ok: true, draft });
  } catch (error) {
    await auditAiEvent(runtime.env.DB, { organizationId: locals.organization.id, actorUserId: locals.user?.id ?? null, actorMemberId: locals.membership.id, action: 'core_value.ai_generated', provider: config.provider, protocol: config.protocol, model: config.model, status: 'failure' });
    const message = error instanceof AiProviderError ? error.message : 'Rekomendasi AI gagal dibuat.';
    return json({ ok: false, message }, { status: error instanceof AiProviderError && error.code === 'timeout' ? 504 : 400 });
  }
};

import type { APIRoute } from 'astro';
import { getCloudflareRuntime } from '../../../../lib/cloudflare/bindings';
import { consumeAiRateLimit } from '../../../../lib/cloudflare/ai-rate-limit';
import { generateQuestionDraft } from '../../../../lib/ai/question-generator';
import { AiProviderError } from '../../../../lib/ai/types';
import { readJsonBody } from '../../../../lib/http/forms';
import { json } from '../../../../lib/http/response';
import { hasPermission, PERMISSIONS } from '../../../../lib/permissions';
import { getOrganizationAiProviderConfig } from '../../../../lib/services/ai-settings';
import { getCoreValue } from '../../../../lib/services/values';

export const POST: APIRoute = async ({ request, locals }) => {
  const runtime = getCloudflareRuntime(locals);
  if (!runtime?.env.DB || !locals.organization || !locals.membership) return json({ ok: false, message: 'Organisasi tidak tersedia.' }, { status: 403 });
  if (!hasPermission(locals.membership.role, PERMISSIONS.CORE_VALUES_AI_GENERATE)) return json({ ok: false, message: 'Anda tidak memiliki izin untuk membuat question dengan AI.' }, { status: 403 });
  const body = await readJsonBody<{ coreValueId?: string }>(request);
  const coreValueId = String(body.coreValueId || '');
  const value = await getCoreValue(runtime.env.DB, locals.organization.id, coreValueId);
  if (!value) return json({ ok: false, message: 'Core value tidak ditemukan.' }, { status: 404 });
  const rate = await consumeAiRateLimit(runtime.env.KV, locals.organization.id, 'generate', 10);
  if (!rate.allowed) return json({ ok: false, message: 'Batas generate AI organisasi tercapai. Coba lagi nanti.' }, { status: 429 });
  const config = await getOrganizationAiProviderConfig(runtime.env.DB, locals.organization.id, runtime.env.SESSION_SECRET);
  if (!config) return json({ ok: false, message: 'AI belum dikonfigurasi atau sedang nonaktif. Minta owner/admin menyiapkannya di Settings.' }, { status: 400 });
  try {
    const draft = await generateQuestionDraft(config, { valueName: value.name, description: value.description, expectedBehaviors: value.expected_behaviors, antiPatterns: value.anti_patterns, locale: locals.organization.default_locale }, Number(runtime.env.AI_GENERATION_TIMEOUT_MS || 30000));
    return json({ ok: true, draft });
  } catch (error) {
    return json({ ok: false, message: error instanceof AiProviderError ? error.message : 'Question AI gagal dibuat.' }, { status: 400 });
  }
};

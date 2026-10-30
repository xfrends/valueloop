import type { APIRoute } from 'astro';
import { getCloudflareRuntime } from '../../../../lib/cloudflare/bindings';
import { consumeAiRateLimit } from '../../../../lib/cloudflare/ai-rate-limit';
import { recommendScore } from '../../../../lib/ai/score-recommender';
import { AiProviderError } from '../../../../lib/ai/types';
import { json } from '../../../../lib/http/response';
import { canScoreChallenge } from '../../../../lib/permissions';
import { getOrganizationAiProviderConfig } from '../../../../lib/services/ai-settings';
import { dbFirst } from '../../../../lib/db/client';

export const POST: APIRoute = async ({ params, locals }) => {
  const runtime = getCloudflareRuntime(locals);
  if (!runtime?.env.DB || !locals.organization || !locals.membership) return json({ ok: false, message: 'Organisasi tidak tersedia.' }, { status: 403 });
  if (!canScoreChallenge(locals.membership.role)) return json({ ok: false, message: 'Anda tidak memiliki izin untuk merekomendasikan skor.' }, { status: 403 });
  const challenge = await dbFirst<{ status: string; answer_text: string | null; value_name: string; value_description: string | null; rubric: string | null }>(runtime.env.DB, `select cs.status, cs.answer_text, cv.name as value_name, cv.description as value_description, q.suggested_rubric_note as rubric from challenge_sessions cs join core_values cv on cv.id = cs.core_value_id and cv.organization_id = cs.organization_id join questions q on q.id = cs.question_id and q.organization_id = cs.organization_id where cs.id = ? and cs.organization_id = ? limit 1`, [params.id || '', locals.organization.id]);
  if (!challenge) return json({ ok: false, message: 'Challenge tidak ditemukan.' }, { status: 404 });
  if (challenge.status !== 'answered' || !challenge.answer_text) return json({ ok: false, message: 'Challenge belum memiliki jawaban yang dapat dinilai.' }, { status: 400 });
  const rate = await consumeAiRateLimit(runtime.env.KV, locals.organization.id, 'generate', 10);
  if (!rate.allowed) return json({ ok: false, message: 'Batas rekomendasi AI organisasi tercapai. Coba lagi nanti.' }, { status: 429 });
  const config = await getOrganizationAiProviderConfig(runtime.env.DB, locals.organization.id, runtime.env.SESSION_SECRET);
  if (!config) return json({ ok: false, message: 'AI belum dikonfigurasi atau sedang nonaktif.' }, { status: 400 });
  try {
    const recommendation = await recommendScore(config, { valueName: challenge.value_name, valueDescription: challenge.value_description, rubric: challenge.rubric, answer: challenge.answer_text, locale: locals.organization.default_locale }, Number(runtime.env.AI_GENERATION_TIMEOUT_MS || 30000));
    return json({ ok: true, recommendation });
  } catch (error) {
    return json({ ok: false, message: error instanceof AiProviderError ? error.message : 'Rekomendasi skor AI gagal dibuat.' }, { status: 400 });
  }
};

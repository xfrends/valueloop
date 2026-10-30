import { z } from 'zod';
import { AiProviderError, type AiProviderConfig } from './types';
import { requestClaude } from './providers/claude';
import { requestGemini } from './providers/gemini';
import { requestOpenAiCompatible } from './providers/openai-compatible';

const scoreRecommendationSchema = z.object({ score: z.number().int().min(0).max(10), note: z.string().trim().min(1).max(2000) }).strict();
export type ScoreRecommendation = z.infer<typeof scoreRecommendationSchema>;

export async function recommendScore(config: AiProviderConfig, input: { valueName: string; valueDescription?: string | null; rubric?: string | null; answer: string; locale?: string }, timeoutMs = 30_000): Promise<ScoreRecommendation> {
  if (!config.apiKey || !config.model) throw new AiProviderError('configuration', 'Konfigurasi AI belum lengkap.');
  const prompt = {
    systemPrompt: `Anda membantu facilitator merekomendasikan skor jawaban challenge. Gunakan bahasa ${input.locale || 'Indonesia'}. Nilai hanya relevansi terhadap core value, bukti perilaku nyata, dan kedalaman jawaban. Output HANYA JSON valid dengan struktur {"score":0,"note":"..."}. Score harus integer 0 sampai 10. Note singkat, objektif, dan menjelaskan alasan skor serta area yang bisa diperbaiki. Ini hanya rekomendasi; jangan mengklaim keputusan final.`,
    userPrompt: `Core value: ${input.valueName}\nDeskripsi: ${input.valueDescription || '-'}\nRubric question: ${input.rubric || '-'}\nMember's Answer:\n${input.answer}`,
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let raw: string;
    if (config.protocol === 'gemini') raw = await requestGemini(config, prompt, controller.signal);
    else if (config.protocol === 'claude') raw = await requestClaude(config, prompt, controller.signal);
    else raw = await requestOpenAiCompatible(config, prompt, controller.signal);
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const parsed = scoreRecommendationSchema.safeParse(JSON.parse(cleaned));
    if (!parsed.success) throw new AiProviderError('invalid_response', 'Respons provider AI tidak memenuhi format rekomendasi skor.');
    return parsed.data;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new AiProviderError('timeout', 'Permintaan ke provider AI melebihi batas waktu.');
    if (error instanceof SyntaxError) throw new AiProviderError('invalid_response', 'Respons provider AI bukan JSON yang valid.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

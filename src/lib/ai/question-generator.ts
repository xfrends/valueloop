import { z } from 'zod';
import { AiProviderError, type AiProviderConfig } from './types';
import { requestClaude } from './providers/claude';
import { requestGemini } from './providers/gemini';
import { requestOpenAiCompatible } from './providers/openai-compatible';

export const generatedQuestionSchema = z.object({
  questionText: z.string().trim().min(10).max(1000),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  suggestedRubricNote: z.string().trim().min(10).max(2000),
}).strict();

export type GeneratedQuestion = z.infer<typeof generatedQuestionSchema>;

export async function generateQuestionDraft(config: AiProviderConfig, input: { valueName: string; description?: string | null; expectedBehaviors?: string; antiPatterns?: string; locale?: string }, timeoutMs = 30_000): Promise<GeneratedQuestion> {
  if (!config.apiKey || !config.model) throw new AiProviderError('configuration', 'Konfigurasi AI belum lengkap.');
  const prompt = {
    systemPrompt: `Anda membantu membuat satu question challenge untuk core value. Gunakan bahasa ${input.locale || 'Indonesia'}. Output HANYA JSON valid dengan struktur: {"questionText":"...","difficulty":"easy|medium|hard","suggestedRubricNote":"..."}. Pertanyaan harus terbuka, meminta contoh perilaku nyata, relevan dengan core value, dan tidak meminta data sensitif. Rubric harus menjelaskan ciri jawaban yang mencerminkan nilai tersebut.`,
    userPrompt: `Core value: ${input.valueName}\nDeskripsi: ${input.description || '-'}\nExpected behaviors: ${input.expectedBehaviors || '-'}\nAnti-patterns: ${input.antiPatterns || '-'}`,
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let raw: string;
    if (config.protocol === 'gemini') raw = await requestGemini(config, prompt, controller.signal);
    else if (config.protocol === 'claude') raw = await requestClaude(config, prompt, controller.signal);
    else raw = await requestOpenAiCompatible(config, prompt, controller.signal);
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const parsed = generatedQuestionSchema.safeParse(JSON.parse(cleaned));
    if (!parsed.success) throw new AiProviderError('invalid_response', 'Respons provider AI tidak memenuhi format question.');
    return parsed.data;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new AiProviderError('timeout', 'Permintaan ke provider AI melebihi batas waktu.');
    if (error instanceof SyntaxError) throw new AiProviderError('invalid_response', 'Respons provider AI bukan JSON yang valid.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

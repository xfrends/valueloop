import { AiProviderError, generatedCoreValueDraftSchema, type AiProviderConfig, type CoreValueGenerationInput, type GeneratedCoreValueDraft } from './types';
import { requestClaude } from './providers/claude';
import { requestGemini } from './providers/gemini';
import { requestOpenAiCompatible } from './providers/openai-compatible';

const schema = '{"name":"...","shortDescription":"...","description":"...","expectedBehaviors":["..."],"antiPatterns":["..."],"example":"...","color":"#2563EB","iconName":"star"}';

export async function generateCoreValueDraft(config: AiProviderConfig, input: CoreValueGenerationInput, timeoutMs = 30_000): Promise<GeneratedCoreValueDraft> {
  if (!config.apiKey || !config.model) throw new AiProviderError('configuration', 'Konfigurasi AI belum lengkap.');
  const locale = input.locale || 'id';
  const prompt = {
    systemPrompt: `Anda membantu membuat satu draft core value organisasi. Gunakan bahasa locale ${locale}, fallback bahasa Indonesia. Output HANYA JSON valid dengan struktur persis: ${schema}. Buat rekomendasi spesifik terhadap informasi dasar. Jangan membuat pertanyaan challenge, scoring, evaluasi member, data sensitif, atau mengaktifkan core value. Satu request hanya satu draft.`,
    userPrompt: `Nama organisasi: ${input.organizationName || '-'}\nInformasi dasar organisasi:\n${input.basicInformation}`,
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let raw: string;
    if (config.protocol === 'gemini') raw = await requestGemini(config, prompt, controller.signal);
    else if (config.protocol === 'claude') raw = await requestClaude(config, prompt, controller.signal);
    else raw = await requestOpenAiCompatible(config, prompt, controller.signal);
    let parsedJson: unknown;
    try {
      const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      parsedJson = JSON.parse(cleaned);
    } catch {
      throw new AiProviderError('invalid_response', 'Respons provider AI bukan JSON yang valid.');
    }
    const parsed = generatedCoreValueDraftSchema.safeParse(parsedJson);
    if (!parsed.success) throw new AiProviderError('invalid_response', 'Respons provider AI tidak memenuhi format draft.');
    return parsed.data;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new AiProviderError('timeout', 'Permintaan ke provider AI melebihi batas waktu.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

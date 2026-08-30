import { AiProviderError, type AiProviderConfig, type ProviderPrompt } from '../types';
import { providerErrorMessage } from './error';

function endpoint(baseUrl: string | null | undefined): string {
  return `${(baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')}/chat/completions`;
}

export async function requestOpenAiCompatible(config: AiProviderConfig, input: ProviderPrompt, signal: AbortSignal): Promise<string> {
  const response = await fetch(endpoint(config.baseUrl), {
    method: 'POST', signal,
    headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: config.model, temperature: 0.2, messages: [
      { role: 'system', content: input.systemPrompt },
      { role: 'user', content: input.userPrompt },
    ], response_format: { type: 'json_object' } }),
  });
  if (response.status === 429) throw new AiProviderError('rate_limited', `Provider menolak permintaan: ${await providerErrorMessage(response)}`);
  if (!response.ok) throw new AiProviderError('unavailable', `Provider menolak permintaan: ${await providerErrorMessage(response)}`);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (Array.isArray(content)) return content.map((item) => item.text || '').join('');
  if (typeof content === 'string') return content;
  throw new AiProviderError('invalid_response', 'Respons provider AI tidak valid.');
}

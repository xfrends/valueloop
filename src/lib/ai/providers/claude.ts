import { AiProviderError, type AiProviderConfig, type ProviderPrompt } from '../types';
import { providerErrorMessage } from './error';

export async function requestClaude(config: AiProviderConfig, input: ProviderPrompt, signal: AbortSignal): Promise<string> {
  const base = (config.baseUrl || 'https://api.anthropic.com').replace(/\/$/, '');
  const response = await fetch(`${base}/v1/messages`, {
    method: 'POST', signal, headers: { 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: config.model, max_tokens: 1800, temperature: 0.2, system: input.systemPrompt, messages: [{ role: 'user', content: input.userPrompt }] }),
  });
  if (response.status === 429) throw new AiProviderError('rate_limited', `Claude menolak permintaan: ${await providerErrorMessage(response)}`);
  if (!response.ok) throw new AiProviderError('unavailable', `Claude menolak permintaan: ${await providerErrorMessage(response)}`);
  const payload = await response.json() as { content?: Array<{ type?: string; text?: string }> };
  const content = payload.content?.filter((item) => item.type === 'text').map((item) => item.text || '').join('');
  if (!content) throw new AiProviderError('invalid_response', 'Respons provider AI tidak valid.');
  return content;
}

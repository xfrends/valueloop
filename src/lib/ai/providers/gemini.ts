import { AiProviderError, type AiProviderConfig, type ProviderPrompt } from '../types';
import { providerErrorMessage } from './error';

export async function requestGemini(config: AiProviderConfig, input: ProviderPrompt, signal: AbortSignal): Promise<string> {
  // ValueLoop uses Gemini's generateContent contract. If an Interactions URL
  // was pasted into settings, normalize it to the compatible v1beta root.
  const model = config.model.replace(/^models\//, '');
  const base = (config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta')
    .replace(/\/interactions\/?$/, '')
    .replace(/\/v1\/?$/, '/v1beta')
    .replace(/\/$/, '');
  const response = await fetch(`${base}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`, {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: input.systemPrompt }] }, contents: [{ role: 'user', parts: [{ text: input.userPrompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.2 } }),
  });
  if (response.status === 429) throw new AiProviderError('rate_limited', `Gemini menolak permintaan: ${await providerErrorMessage(response)}`);
  if (!response.ok) {
    throw new AiProviderError('unavailable', `Gemini menolak permintaan: ${await providerErrorMessage(response)}`);
  }
  const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const content = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('');
  if (!content) throw new AiProviderError('invalid_response', 'Respons provider AI tidak valid.');
  return content;
}

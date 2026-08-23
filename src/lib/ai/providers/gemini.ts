import { AiProviderError, type AiProviderConfig, type ProviderPrompt } from '../types';

export async function requestGemini(config: AiProviderConfig, input: ProviderPrompt, signal: AbortSignal): Promise<string> {
  const base = (config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
  const response = await fetch(`${base}/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`, {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: input.systemPrompt }] }, contents: [{ role: 'user', parts: [{ text: input.userPrompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.2 } }),
  });
  if (response.status === 429) throw new AiProviderError('rate_limited', 'Provider AI sedang membatasi permintaan.');
  if (!response.ok) throw new AiProviderError('unavailable', 'Provider AI tidak tersedia.');
  const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const content = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('');
  if (!content) throw new AiProviderError('invalid_response', 'Respons provider AI tidak valid.');
  return content;
}

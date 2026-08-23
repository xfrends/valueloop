const HOUR_SECONDS = 60 * 60;

export async function consumeAiRateLimit(kv: KVNamespace | null | undefined, organizationId: string, kind: 'generate' | 'test', limit: number): Promise<{ allowed: boolean; retryAfter: number }> {
  if (!kv) return { allowed: true, retryAfter: 0 };
  const window = Math.floor(Date.now() / 1000 / HOUR_SECONDS);
  const key = `ai:${kind === 'generate' ? 'core-value' : 'connection-test'}:${organizationId}:${window}`;
  const current = Number(await kv.get(key) || '0');
  if (current >= limit) return { allowed: false, retryAfter: HOUR_SECONDS - (Math.floor(Date.now() / 1000) % HOUR_SECONDS) };
  await kv.put(key, String(current + 1), { expirationTtl: HOUR_SECONDS + 60 });
  return { allowed: true, retryAfter: 0 };
}

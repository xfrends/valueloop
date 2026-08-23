const encoder = new TextEncoder();

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function encryptionKey(secret: string, organizationId: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(`${secret}:${organizationId}`), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: encoder.encode('valueloop-ai-token-v1'), iterations: 100_000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptApiKey(apiKey: string, secret: string | undefined, organizationId: string): Promise<{ encrypted: string; iv: string }> {
  if (!secret) throw new Error('SESSION_SECRET belum dikonfigurasi. Token AI tidak dapat disimpan.');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await encryptionKey(secret, organizationId), encoder.encode(apiKey));
  return { encrypted: toBase64(new Uint8Array(encrypted)), iv: toBase64(iv) };
}

export async function decryptApiKey(encrypted: string, iv: string, secret: string | undefined, organizationId: string): Promise<string> {
  if (!secret) throw new Error('SESSION_SECRET belum dikonfigurasi.');
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(iv) }, await encryptionKey(secret, organizationId), fromBase64(encrypted));
  return new TextDecoder().decode(decrypted);
}

export function maskApiKey(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.length <= 8 ? '••••••••' : `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

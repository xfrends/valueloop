const encoder = new TextEncoder();

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const output = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    output[index] = binary.charCodeAt(index);
  }
  return output;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);

  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations: 120000,
    },
    key,
    256
  );

  return ['pbkdf2_sha256', '120000', base64UrlEncode(salt), base64UrlEncode(new Uint8Array(derived))].join('$');
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [scheme, iterationsRaw, saltRaw, hashRaw] = storedHash.split('$');
  if (scheme !== 'pbkdf2_sha256' || !iterationsRaw || !saltRaw || !hashRaw) {
    return false;
  }

  const iterations = Number(iterationsRaw);
  if (!Number.isFinite(iterations) || iterations <= 0) {
    return false;
  }

  const salt = base64UrlDecode(saltRaw);
  const expected = base64UrlDecode(hashRaw);
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: salt as unknown as BufferSource,
      iterations,
    },
    key,
    expected.byteLength * 8
  );

  const actual = new Uint8Array(derived);
  if (actual.byteLength !== expected.byteLength) {
    return false;
  }

  let mismatch = 0;
  for (let index = 0; index < actual.byteLength; index += 1) {
    mismatch |= actual[index] ^ expected[index];
  }
  return mismatch === 0;
}

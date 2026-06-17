import { randomToken, sha256Hex } from '../utils/crypto';
import { isoNow } from '../utils/date';
import { SESSION_CACHE_TTL_SECONDS, SESSION_TTL_SECONDS } from './constants';

export type SessionRecord = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  last_seen_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export async function createSession(db: D1Database, kv: KVNamespace, userId: string): Promise<{ token: string; expiresAt: string }> {
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();

  await db.prepare(
    `insert into auth_sessions (id, user_id, token_hash, expires_at, created_at)
     values (?, ?, ?, ?, ?)`
  ).bind(crypto.randomUUID(), userId, tokenHash, expiresAt, isoNow()).run();

  await kv.put(`session:${tokenHash}`, JSON.stringify({ userId, expiresAt }), {
    expirationTtl: SESSION_CACHE_TTL_SECONDS,
  });

  return { token, expiresAt };
}

export async function resolveSessionToken(token: string | null | undefined): Promise<string | null> {
  if (!token) {
    return null;
  }
  return sha256Hex(token);
}

export async function revokeSession(db: D1Database, kv: KVNamespace, token: string): Promise<void> {
  const tokenHash = await sha256Hex(token);
  await db.prepare(`update auth_sessions set revoked_at = ? where token_hash = ?`).bind(isoNow(), tokenHash).run();
  await kv.delete(`session:${tokenHash}`);
}

import { dbFirst, dbRun } from '../db/client';
import { decryptApiKey, encryptApiKey, maskApiKey } from '../ai/encryption';
import type { AiProvider, AiProtocol, OrganizationAiSettings } from '../ai/types';
import { isoNow } from '../utils/date';
import { writeAuditLog } from './shared';

type SecretRow = { organization_id: string; provider: AiProvider; protocol: AiProtocol; base_url: string | null; model: string; encrypted_api_key: string | null; encryption_iv: string | null; is_enabled: number };

export async function getOrganizationAiSettings(db: D1Database, organizationId: string): Promise<OrganizationAiSettings | null> {
  const row = await dbFirst<SecretRow>(db, 'select * from organization_ai_settings where organization_id = ? limit 1', [organizationId]);
  if (!row) return null;
  let maskedApiKey: string | null = null;
  if (row.encrypted_api_key && row.encryption_iv) maskedApiKey = '••••••••';
  return { organizationId, provider: row.provider, protocol: row.protocol, baseUrl: row.base_url, model: row.model, isEnabled: row.is_enabled === 1, hasApiKey: Boolean(row.encrypted_api_key), maskedApiKey };
}

export async function getOrganizationAiProviderConfig(db: D1Database, organizationId: string, secret: string | undefined) {
  const row = await dbFirst<SecretRow>(db, 'select * from organization_ai_settings where organization_id = ? limit 1', [organizationId]);
  if (!row || !row.is_enabled || !row.encrypted_api_key || !row.encryption_iv) return null;
  const apiKey = await decryptApiKey(row.encrypted_api_key, row.encryption_iv, secret, organizationId);
  return { provider: row.provider, protocol: row.protocol, baseUrl: row.base_url, model: row.model, apiKey };
}

export async function upsertOrganizationAiSettings(db: D1Database, payload: { organizationId: string; actorUserId: string | null; actorMemberId: string | null; provider: AiProvider; protocol: AiProtocol; baseUrl?: string; model: string; apiToken?: string; isEnabled: boolean; sessionSecret?: string }): Promise<void> {
  const previous = await dbFirst<{ encrypted_api_key: string | null; encryption_iv: string | null }>(db, 'select encrypted_api_key, encryption_iv from organization_ai_settings where organization_id = ?', [payload.organizationId]);
  let encrypted = previous?.encrypted_api_key ?? null;
  let iv = previous?.encryption_iv ?? null;
  if (payload.apiToken) {
    const result = await encryptApiKey(payload.apiToken, payload.sessionSecret, payload.organizationId);
    encrypted = result.encrypted;
    iv = result.iv;
  } else if (!previous) {
    throw new Error('API token wajib diisi untuk konfigurasi pertama.');
  }
  const now = isoNow();
  await dbRun(db, `insert into organization_ai_settings (organization_id, provider, protocol, base_url, model, encrypted_api_key, encryption_iv, is_enabled, created_at, updated_at)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) on conflict(organization_id) do update set provider=excluded.provider, protocol=excluded.protocol, base_url=excluded.base_url, model=excluded.model, encrypted_api_key=excluded.encrypted_api_key, encryption_iv=excluded.encryption_iv, is_enabled=excluded.is_enabled, updated_at=excluded.updated_at`,
    [payload.organizationId, payload.provider, payload.protocol, payload.baseUrl || null, payload.model, encrypted, iv, payload.isEnabled ? 1 : 0, now, now]);
  await writeAuditLog(db, { organizationId: payload.organizationId, actorUserId: payload.actorUserId, actorMemberId: payload.actorMemberId, action: 'ai.settings.updated', entityType: 'organization_ai_settings', entityId: payload.organizationId, afterValue: { provider: payload.provider, protocol: payload.protocol, model: payload.model, isEnabled: payload.isEnabled, hasApiKey: true } });
}

export async function auditAiEvent(db: D1Database, payload: { organizationId: string; actorUserId: string | null; actorMemberId: string | null; action: 'ai.connection.tested' | 'core_value.ai_generated'; provider?: string; protocol?: string; model?: string; status: 'success' | 'failure' }): Promise<void> {
  await writeAuditLog(db, { organizationId: payload.organizationId, actorUserId: payload.actorUserId, actorMemberId: payload.actorMemberId, action: payload.action, entityType: payload.action.startsWith('core_value') ? 'core_value' : 'ai_provider', entityId: null, afterValue: { provider: payload.provider || null, protocol: payload.protocol || null, model: payload.model || null, status: payload.status } });
}

export { maskApiKey };

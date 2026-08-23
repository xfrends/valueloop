create table organization_ai_settings (
    organization_id text primary key references organizations(id) on delete cascade,
    provider text not null check (provider in ('openai', 'openrouter', 'sumopod', 'gemini', 'claude', 'custom')),
    protocol text not null check (protocol in ('openai_compatible', 'gemini', 'claude')),
    base_url text,
    model text not null,
    encrypted_api_key text,
    encryption_iv text,
    is_enabled integer not null default 0 check (is_enabled in (0, 1)),
    created_at text not null default current_timestamp,
    updated_at text not null default current_timestamp,
    check ((encrypted_api_key is null and encryption_iv is null) or (encrypted_api_key is not null and encryption_iv is not null))
);

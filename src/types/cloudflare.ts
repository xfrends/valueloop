export type CloudflareBindings = {
  DB: D1Database;
  KV: KVNamespace;
  R2: R2Bucket;
  ASSETS: Fetcher;
  PUBLIC_APP_URL: string;
  PUBLIC_TURNSTILE_SITE_KEY: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  AUTH_EMAIL_FROM?: string;
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USERNAME?: string;
  SMTP_PASSWORD?: string;
  SMTP_FROM?: string;
  SMTP_SECURE?: string;
  OPENAI_API_KEY?: string;
  OPENAI_TEXT_MODEL?: string;
  OPENAI_IMAGE_MODEL?: string;
  SESSION_SECRET?: string;
  TURNSTILE_SECRET_KEY?: string;
  ORGANIZATION_REALTIME: DurableObjectNamespace<import('../lib/notifications/realtime').OrganizationRealtime>;
};

export type CloudflareRuntime = {
  env: CloudflareBindings;
  cf: Request['cf'];
  ctx: ExecutionContext;
};

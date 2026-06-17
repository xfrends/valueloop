export type CloudflareBindings = {
  DB: D1Database;
  KV: KVNamespace;
  R2: R2Bucket;
  ASSETS: Fetcher;
  PUBLIC_APP_URL: string;
  PUBLIC_TURNSTILE_SITE_KEY: string;
  SESSION_SECRET?: string;
  TURNSTILE_SECRET_KEY?: string;
};

export type CloudflareRuntime = {
  env: CloudflareBindings;
  cf: Request['cf'];
  ctx: ExecutionContext;
};

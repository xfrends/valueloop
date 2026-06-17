# ValueLoop

ValueLoop adalah SaaS multi-tenant untuk membantu organisasi mengubah core values menjadi kebiasaan kerja harian melalui challenge, jawaban member, scoring manual, leaderboard, history, dan insights.

Brief produk, data model, permission matrix, TDD, dan design system ada di `app-spec.md`.

## Status

Project ini masih berada di fase specification-first. Implementasi aplikasi Astro harus dibuat di repo yang sama berdasarkan `app-spec.md`.

## Stack

Project ini adalah satu aplikasi Astro yang dideploy di Cloudflare Workers:

- Astro
- `@astrojs/cloudflare`
- TypeScript
- Tailwind CSS
- Astro Actions atau API routes
- Cloudflare Workers runtime
- Cloudflare Workers deployment target
- Cloudflare D1 untuk database utama
- Cloudflare KV untuk cache, session cache, rate limit, dan token sementara
- Cloudflare R2 untuk logo organisasi dan file export
- Wrangler untuk local development, binding, migration, dan deployment config

Tidak menggunakan Next.js, Vercel, Supabase, PostgreSQL, Redis, Cloudflare Pages sebagai runtime utama, atau backend service terpisah.

## AI Workflow

Project ini memakai pembagian kerja agent:

- Codex CLI: backend, logic utama, Cloudflare integration, D1 schema, auth, permission, services, actions/API, tests.
- Agy: tampilan, layout, Astro components, responsive UI, styling, dan polish visual.

Aturan detail untuk agent ada di `AGENTS.md`.

## Product Scope

MVP mencakup:

- Multi-tenant organization support.
- Email/password auth.
- Organization onboarding.
- Organization switcher.
- Role-based permission guard.
- Core values CRUD.
- Question bank CRUD.
- Member dan team management.
- Daily challenge randomizer.
- Manual answer input.
- Manual score input 0 sampai 10.
- Leaderboard.
- History.
- Basic dashboard dan insights.
- Audit log.
- Template import.

MVP tidak mencakup AI scoring, Slack/Teams integration, native mobile app, gamification advanced, HR review automation, atau enterprise SSO.

## Cloudflare Resources

Expected bindings in `wrangler.jsonc`:

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "valueloop",
      "database_id": ""
    }
  ],
  "kv_namespaces": [
    {
      "binding": "KV",
      "id": ""
    }
  ],
  "r2_buckets": [
    {
      "binding": "R2",
      "bucket_name": "valueloop-assets"
    }
  ]
}
```

Runtime variables and secrets:

```env
PUBLIC_APP_URL=
PUBLIC_TURNSTILE_SITE_KEY=
SESSION_SECRET=
TURNSTILE_SECRET_KEY=

# Phase 2
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# Phase 3
OPENAI_API_KEY=
```

## Expected Structure

```text
astro.config.mjs
wrangler.jsonc

migrations/
  0001_initial.sql

src/
  pages/
    index.astro
    login.astro
    signup.astro
    onboarding.astro
    app/
      [orgSlug]/
    platform/
    api/
  actions/
  middleware.ts
  components/
  lib/
    auth/
    context/
    permissions/
    db/
    cloudflare/
    services/
    validations/
    utils/
  types/
```

## Implementation Order

1. Scaffold Astro project with Cloudflare adapter.
2. Add TypeScript, Tailwind, Wrangler, and Cloudflare binding types.
3. Create D1 migration from `app-spec.md`.
4. Implement D1 repositories, KV helpers, and R2 helpers.
5. Implement auth, session, organization context, and permission guard.
6. Implement service layer and Astro Actions/API contracts.
7. Build UI pages/components with Agy based on the completed contracts.
8. Add focused tests for permission rules, challenge flow, and tenant isolation.

## Core Rules

- Every tenant-owned record must include `organization_id`.
- Every tenant-owned query must be scoped by `organization_id`.
- Every mutation must check permissions server-side.
- Random challenge result must persist in D1.
- KV must not be used as source of truth for tenant data.
- R2 stores files only; D1 stores object keys.
- User-facing app errors should be in Indonesian.
- Do not hardcode exactly 5 values.

## Local Development

After the Astro project is scaffolded, expected commands are:

```bash
npm install
npm run dev
```

Wrangler should be used for Cloudflare resources and D1 migrations:

```bash
npx wrangler d1 migrations apply valueloop --local
npm run build
npm run preview
```

Exact scripts should be finalized in `package.json` during scaffold.

## Deployment

Deploy the Astro app to Cloudflare Workers with the Cloudflare adapter. Server-side routes and Astro Actions run on the Cloudflare Workers runtime. Bind `DB`, `KV`, and `R2` in the Cloudflare project before production deployment.

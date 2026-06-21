# ValueLoop

ValueLoop adalah SaaS multi-tenant untuk membantu organisasi mengubah core values menjadi kebiasaan kerja harian melalui challenge, jawaban member, scoring manual, leaderboard, history, dan insights.

Dokumen acuan utama ada di `docs/`:

- `docs/prd.md`
- `docs/erd.md`
- `docs/schema.md`
- `docs/permissions.md`
- `docs/tdd.md`
- `docs/design-system.md`

Jika ada konflik antara README ini dan dokumen di `docs/`, ikuti dokumen di `docs/`.

## Status

Repo ini sudah berisi aplikasi Astro yang ditargetkan ke Cloudflare Workers. Fokus kerja saat ini adalah implementasi fitur MVP sesuai spesifikasi di `docs/`.

## Stack

- Astro
- `@astrojs/cloudflare`
- TypeScript
- Tailwind CSS
- Astro Actions dan API routes
- Cloudflare Workers runtime
- Cloudflare D1 sebagai database utama
- Cloudflare KV untuk cache, session cache, rate limit, dan token sementara
- Cloudflare R2 untuk logo organisasi dan file export
- Wrangler untuk local bindings, migrasi D1, dan deployment config

Stack yang tidak dipakai:

- Next.js
- Vercel
- Supabase
- PostgreSQL
- Redis
- Backend terpisah di luar Astro/Cloudflare
- Cloudflare Pages sebagai runtime utama aplikasi

## Repository Layout

```text
astro.config.mjs
wrangler.jsonc

migrations/
  0001_initial.sql
  0002_auth_google.sql
  0003_articles.sql
  0004_single_owner_per_organization.sql

src/
  components/
  layouts/
  lib/
  middleware.ts
  pages/
  styles/
  types/
```

## Current Routes

Public pages:

- `/`
- `/login`
- `/signup`
- `/onboarding`
- `/verify-email`
- `/bantuan`
- `/panduan`
- `/studi-kasus`
- `/privacy`
- `/terms`
- `/blog`
- `/blog/[slug]`

App pages:

- `/dashboard`
- `/challenge`
- `/history`
- `/history/[id]`
- `/leaderboard`
- `/insights`
- `/billing`
- `/settings`
- `/settings/members`
- `/settings/questions`
- `/settings/teams`
- `/settings/values`
- `/settings/values/new`
- `/settings/values/[id]`
- `/settings/values/[id]/edit`
- `/settings/audit`

Platform pages:

- `/platform/organizations`
- `/platform/plans`
- `/platform/articles`
- `/platform/articles/new`
- `/platform/articles/[id]`

API routes:

- `/api/auth/*`
- `/api/organizations/*`
- `/api/settings/*`
- `/api/challenge/*`
- `/api/articles/*`
- `/api/platform/articles/*`
- `/api/export/*`
- `/api/assets/*`

## Core Rules

- Semua tenant-owned record wajib punya `organization_id`.
- Semua query tenant-owned wajib difilter dengan `organization_id`.
- Semua mutation wajib cek auth dan permission di server.
- Jangan percaya hidden button atau disabled input di client.
- Random challenge result wajib disimpan di D1 dan tidak boleh berubah karena refresh.
- Jangan izinkan self-scoring kecuali setting organisasi mengizinkan.
- Jangan izinkan scored session di-reroll.
- Jangan pilih member, core value, atau question yang inactive.
- Error message user-facing harus berbahasa Indonesia.
- Jangan hardcode tepat 5 values.
- Template `Good Product`, `Good Attitude`, `Good Service`, `Good Teamwork`, dan `Good Delivery` hanya optional template.
- AI scoring bukan bagian dari MVP.

## Local Development

### Install

```bash
npm install
```

### Jalankan migrasi lokal

```bash
npm run db:migrate:local
```

### Bootstrap data awal

```bash
npm run setup
```

### Jalankan app

```bash
npm run dev
```

## Available Scripts

- `npm run dev`
- `npm run build`
- `npm run preview`
- `npm run check`
- `npm run test`
- `npm run setup`
- `npm run setup:remote`
- `npm run generate-types`
- `npm run db:migrate:local`
- `npm run db:migrate:remote`
- `npm run deploy`

## Environment Variables

```env
PUBLIC_APP_URL=
PUBLIC_TURNSTILE_SITE_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
AUTH_EMAIL_FROM=
SMTP_HOST=
SMTP_PORT=587
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_FROM=
SMTP_SECURE=starttls
SESSION_SECRET=
TURNSTILE_SECRET_KEY=
OPENAI_API_KEY=
OPENAI_TEXT_MODEL=gpt-5.2
OPENAI_IMAGE_MODEL=gpt-image-1
```

Catatan:

- Redirect URI Google OAuth: `${PUBLIC_APP_URL}/api/auth/google/callback`
- OTP email dikirim lewat SMTP
- Port SMTP 25 tidak didukung di Cloudflare Workers
- Dalam development tanpa SMTP lengkap, OTP bisa muncul di console server sebagai dev hint

## Cloudflare Bindings

`wrangler.jsonc` diharapkan mendefinisikan:

- `DB` untuk D1
- `KV` untuk cache/session/token sementara
- `R2` untuk asset dan export file

## Deployment

Build dan deploy ke Cloudflare Workers:

```bash
npm run build
npm run deploy
```

Sebelum production deploy, pastikan binding D1, KV, dan R2 sudah dikonfigurasi di Cloudflare project.

## Agent Workflow

- Codex CLI menangani backend, logic, data model, auth, permission, service layer, actions/API, dan tests.
- Agy menangani UI, layout, responsive behavior, visual hierarchy, dan polish visual.

Aturan detail untuk agent ada di `AGENTS.md`.

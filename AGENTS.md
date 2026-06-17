# AGENTS.md

Panduan kerja agent untuk project ValueLoop.

## Source of Truth

- Brief utama ada di `app-spec.md`.
- Jika ada konflik antara dokumen ini dan `app-spec.md`, ikuti `app-spec.md` kecuali user memberi instruksi terbaru.
- Jangan menambah scope di luar MVP tanpa instruksi eksplisit.

## Project Context

ValueLoop adalah SaaS multi-tenant untuk membantu organisasi mengubah core values menjadi kebiasaan kerja lewat challenge, jawaban member, scoring manual, leaderboard, history, dan insights.

Project ini adalah satu aplikasi Astro yang akan dideploy di Cloudflare.

## Required Stack

Gunakan stack ini secara konsisten:

- Astro
- `@astrojs/cloudflare`
- TypeScript
- Tailwind CSS
- Astro Actions atau API routes
- Cloudflare Workers runtime
- Cloudflare Workers deployment target
- Cloudflare D1 sebagai database utama
- Cloudflare KV untuk cache, session cache, rate limit, nonce/token sementara
- Cloudflare R2 untuk logo organisasi dan file export
- Wrangler untuk local bindings, D1 migrations, dan deployment config

Jangan mengganti stack ke:

- Next.js
- Vercel
- Supabase
- PostgreSQL
- Redis
- Backend terpisah di luar Astro/Cloudflare

Catatan: untuk versi Astro/`@astrojs/cloudflare` saat ini, full-stack/on-demand app dideploy ke Cloudflare Workers. Jangan menargetkan Cloudflare Pages untuk runtime utama aplikasi ini.

## Agent Roles

### Codex CLI

Codex CLI adalah agent utama untuk backend, logic aplikasi, data model, dan integrasi Cloudflare.

Codex bertanggung jawab atas:

- Struktur project Astro.
- Konfigurasi `astro.config.mjs` dan `wrangler.jsonc`.
- D1 schema dan migration SQL.
- D1 repositories dan query.
- KV helpers.
- R2 helpers.
- Authentication dan session logic.
- Organization context resolver.
- Permission guard.
- Services untuk business logic.
- Astro Actions/API routes.
- Validasi Zod.
- Tests untuk service, permission, dan flow penting.
- Memastikan tenant isolation di semua query.

### Agy

Agy digunakan untuk membuat tampilan, layout, dan polish visual.

Agy bertanggung jawab atas:

- UI Astro components.
- Layout halaman.
- Responsive behavior.
- Visual hierarchy.
- Form styling.
- Table/list/card presentation.
- Empty states dan loading states.
- Konsistensi design system.

Agy tidak boleh mengubah logic backend, permission rules, schema D1, auth, atau Cloudflare bindings kecuali diminta secara eksplisit. Jika UI membutuhkan data/action baru, Agy harus mengikuti contract yang dibuat oleh Codex atau meminta contract baru.

## Implementation Rules

- Semua tenant-owned table wajib punya `organization_id`.
- Semua query tenant-owned wajib difilter dengan `organization_id`.
- Semua mutation wajib cek auth dan permission server-side.
- Jangan percaya hidden button atau disabled input di client.
- Random challenge result wajib disimpan di D1 dan tidak boleh berubah karena refresh.
- Jangan memilih inactive member, inactive core value, atau inactive question.
- Jangan izinkan scored session di-reroll.
- Jangan izinkan self-scoring kecuali setting organisasi mengizinkan.
- Error message aplikasi gunakan bahasa Indonesia.
- Jangan hardcode tepat 5 values.
- Template "Good Product", "Good Attitude", "Good Service", "Good Teamwork", dan "Good Delivery" hanya optional template.
- AI scoring bukan bagian dari MVP.

## Cloudflare Data Rules

- D1 adalah source of truth untuk relational data.
- KV bukan source of truth untuk tenant data.
- KV hanya untuk cache, session cache, rate limit, nonce/token, dan data sementara.
- R2 hanya menyimpan object/file. D1 menyimpan key/path object, misalnya `logo_r2_key`.
- ID disimpan sebagai `text` UUID yang dibuat di application code dengan `crypto.randomUUID()`.
- Timestamp disimpan sebagai UTC ISO string atau SQLite `current_timestamp`.
- JSON di D1 disimpan sebagai `text` dengan validasi `json_valid(...)`.
- Boolean di D1 disimpan sebagai integer `0` atau `1`.

## Expected Project Shape

Ikuti struktur dari `app-spec.md`, dengan pola utama:

```text
astro.config.mjs
wrangler.jsonc

migrations/
  0001_initial.sql

src/
  pages/
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

## Development Flow

1. Baca `app-spec.md` sebelum mengubah behavior.
2. Implementasikan backend contract dan data flow dengan Codex CLI.
3. Serahkan tampilan visual ke Agy setelah contract halaman/action jelas.
4. Jalankan formatting, typecheck, dan test yang tersedia.
5. Verifikasi tidak ada regresi tenant isolation atau permission guard.

## Review Checklist

Sebelum menyelesaikan perubahan:

- Apakah perubahan sesuai `app-spec.md`?
- Apakah query tenant-owned sudah memakai `organization_id`?
- Apakah mutation punya permission check server-side?
- Apakah D1/KV/R2 dipakai sesuai tanggung jawabnya?
- Apakah UI tidak membutuhkan data yang belum punya contract?
- Apakah error message user-facing berbahasa Indonesia?
- Apakah tidak ada dependency Next.js, Vercel, Supabase, PostgreSQL, atau Redis?

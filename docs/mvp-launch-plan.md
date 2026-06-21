# ValueLoop MVP Launch Plan

Dokumen ini adalah checklist implementasi sampai MVP siap launch. Urutan dibuat dari PRD, TDD, schema, permission matrix, dan kondisi repo saat ini.

## Definisi Ready To Launch

- Auth, onboarding, organization switcher, dan session berjalan di Cloudflare Workers runtime.
- Semua tenant-owned query memakai `organization_id`.
- Semua mutation penting punya auth dan permission check server-side.
- Daily challenge memilih member, core value, dan question aktif saja; hasil random tersimpan di D1.
- Challenge yang sudah dijawab tidak bisa di-reroll, dan challenge yang sudah dinilai tidak bisa di-reroll atau diubah.
- Self-scoring ditolak kecuali setting organisasi mengizinkan.
- Core values, questions, members, teams, leaderboard, history, dashboard, insights, audit, billing placeholder, export CSV, dan platform admin MVP punya route dasar.
- Halaman yang belum dipoles boleh tampil seadanya agar bisa direvamp oleh Agy tanpa mengubah backend contract.
- `npm run test`, `npm run check`, dan `npm run build` lulus.

## Step 1 - Testing Foundation dan Critical Business Rules

Tujuan:
- Tambah test runner.
- Tambah unit/integration test service layer dengan D1 lokal.
- Kunci rule permission, challenge flow, dan tenant isolation.

Scope test awal:
- Permission role mapping.
- Challenge hanya memilih member aktif, core value aktif, dan question aktif.
- Challenge randomizer persist: refresh/list tidak membuat hasil berubah.
- Reroll ditolak untuk challenge yang sudah dijawab atau scored.
- Score ditolak sebelum ada jawaban, range score 0-10, dan self-scoring mengikuti setting organisasi.
- History/listing tenant A tidak menampilkan data tenant B.

Exit criteria:
- Script `npm run test` tersedia.
- Test Step 1 lulus.
- Bug yang ditemukan oleh test diperbaiki sebelum lanjut.

## Step 2 - Auth, Session, dan Onboarding Readiness

Tujuan:
- Validasi flow signup/login/logout/verify email dan Google auth fallback.
- Validasi bootstrap root user dan organisasi pertama.
- Validasi onboarding organisasi, template import, dan switch organization.

Checklist:
- User baru tanpa organisasi diarahkan ke `/onboarding`.
- Creator organisasi menjadi `owner`.
- Organization slug unik dan valid.
- Template import tidak hardcode tepat 5 values.
- Current organization cookie hanya bisa menunjuk organisasi aktif yang user miliki.
- Error user-facing berbahasa Indonesia.

Testing:
- Unit/integration untuk service auth/onboarding.
- Route-level smoke test untuk API signup/login/onboarding bila harness memungkinkan.

## Step 3 - Core Operational CRUD

Tujuan:
- Pastikan core values, questions, members, teams, dan settings lengkap untuk menjalankan loop harian.

Checklist:
- Core values CRUD scoped by organization.
- Questions CRUD scoped by organization dan memvalidasi core value tenant yang sama.
- Invite member, accept invitation, status, role change, dan team assignment aman.
- Setiap organisasi hanya boleh memiliki satu owner aktif.
- Settings challenge/scoring tersimpan di D1.
- Basic UI/form tersedia untuk semua route, walaupun belum final secara visual.

Testing:
- Unit/integration untuk tenant isolation dan permission mutation.
- Regression test untuk inactive data.

## Step 4 - Challenge, Leaderboard, History, dan Insights

Tujuan:
- Lengkapi loop utama dari start challenge sampai score masuk ke leaderboard/insights.

Checklist:
- Start challenge, answer, score, reroll, dan history detail berjalan.
- Leaderboard menghitung total points, total answered, average, highest, dan last participation.
- History punya filter dasar atau minimal contract untuk filter.
- Insights menampilkan aggregate per value/team/member.
- CSV export leaderboard/history berizin dan scoped tenant.

Testing:
- Integration test full challenge flow.
- Test export tidak bocor lintas tenant.

## Step 5 - Platform Admin dan Launch Operations

Tujuan:
- Siapkan kebutuhan operator SaaS dan health check production.

Checklist:
- Platform admin hanya untuk `platform_admin`.
- Platform organizations/plans/articles route tidak bisa diakses user biasa.
- Health endpoint tersedia.
- Audit log mencatat mutation penting.
- R2 asset serving aman untuk object key yang disimpan aplikasi.

Testing:
- Permission test platform route/service.
- Smoke test health dan article/public blog.

## Step 6 - UI Basic Completion untuk Agy Revamp

Tujuan:
- Semua page MVP punya tampilan dasar yang bisa dipakai dan tidak menghalangi testing end-to-end.

Checklist:
- Empty state untuk dashboard, values, questions, members, teams, challenge, leaderboard, history, dan insights.
- Form dasar tersedia untuk create/update penting.
- Copy user-facing bahasa Indonesia.
- Tidak ada UI yang mengandalkan hidden/disabled client control sebagai satu-satunya security.
- Markup sederhana dan contract data jelas agar Agy bisa fokus visual polish.

## Step 7 - Cloudflare Deployment Readiness

Tujuan:
- Siapkan deploy Cloudflare Workers dengan D1/KV/R2.

Checklist:
- `wrangler.jsonc` binding `DB`, `KV`, dan `R2` benar.
- Migration lokal dan remote bisa dijalankan.
- `npm run build` lulus dengan adapter Cloudflare.
- Bootstrap remote terdokumentasi.
- Environment/secrets production terdokumentasi.

## Step 8 - Final Hardening

Tujuan:
- Menutup risiko launch blocker.

Checklist:
- Audit dependency security yang relevan.
- Review tenant-owned SQL query.
- Review permission guard di semua API mutation.
- Test manual happy path: bootstrap, login, onboarding, create value/question, invite/member/team, challenge answer/score, leaderboard, history, export, logout.
- Catat known limitation MVP.

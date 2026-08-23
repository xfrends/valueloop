# 7. Main Page Specifications

## 7.1 Landing Page

Sections:

1. Hero
2. Problem
3. How ValueLoop Works
4. Key Features
5. CTA

Hero copy:

```text
Turn core values into daily habits.
```

Indonesian version:

```text
Ubah core values menjadi kebiasaan kerja harian.
```

## 7.2 Onboarding Page

Steps:

1. Organization details.
2. Choose value template or blank setup.
3. Invite team members.
4. Go to dashboard.

## 7.3 Dashboard

Widgets:

- Today challenge.
- Active members.
- Active core values.
- Challenges this month.
- Average score.
- Top leaderboard.
- Value distribution.

Empty states:

- No core values: CTA `Tambah Core Value`
- No questions: CTA `Tambah Pertanyaan`
- No members: CTA `Undang Member`

## 7.4 Core Values Page

Features:

- List/grid of core values.
- Create/edit/deactivate value.
- Sort order.
- Dynamic color and icon.
- Behaviors and anti-patterns.

## 7.5 Question Bank per Core Value

Features:

- Question Bank menggunakan halaman khusus per core value dengan entry point dari tombol pada halaman detail core value.
- Table of questions dengan ringkasan jumlah active, inactive, dan difficulty hard.
- Search question dan filter by difficulty/status.
- Create/edit/deactivate question melalui halaman form terpisah.
- Tidak ada menu atau halaman Question Bank global di `/settings/questions`.
- Bulk create in Phase 2.

## 7.6 Daily Challenge Page

Meeting-focused layout:

```text
Header
  ↓
Start Challenge CTA
  ↓
Selected Member Card
  ↓
Selected Core Value Card
  ↓
Question Card
  ↓
Answer Form
  ↓
Score Rubric
  ↓
Score Form
```

UX rules:

- Selected member name must be large.
- Question must be readable from meeting screen.
- Use minimal clutter.
- Reroll button should not compete with primary action.

## 7.7 Leaderboard Page

Sections:

- Filter by date/team.
- Top 3 members.
- Full leaderboard table.

Columns:

- Rank
- Member
- Team
- Total Points
- Total Answered
- Average Score
- Highest Score
- Last Participation

## 7.8 History Page

Features:

- Filter by date range, member, team, value, status.
- Paginated table.
- Detail dialog.

## 7.9 Insights Page

MVP charts:

- Average score by core value.
- Participation by member.
- Participation by team.
- Challenge count by month.

## 7.10 Members Page

Features:

- Invite member.
- Change role.
- Assign team.
- Deactivate member.
- Search by name/email.

## 7.11 Settings Page

Sections:

- Organization profile.
- Challenge settings.
- Scoring settings.
- Data export settings.

## 7.12 Billing Page

MVP-lite:

- Current plan.
- Usage limits.
- Upgrade CTA placeholder.

---

# 8. Template: 5 Good Values

This is only a starter template. It must not be hardcoded as the default product model.

## Values

1. Good Product
2. Good Attitude
3. Good Service
4. Good Teamwork
5. Good Delivery

## Example Questions

### Good Product

- Apa arti Good Product dalam pekerjaan harian kamu?
- Bagaimana cara memastikan hasil kerja kamu sudah layak dikirim ke atasan atau klien?
- Apa risiko jika kita mengejar cepat selesai tetapi kualitas pekerjaan buruk?

### Good Attitude

- Apa contoh Good Attitude saat menerima kritik?
- Bagaimana cara menjaga sikap profesional saat sedang banyak tekanan?
- Apa yang harus dilakukan jika berbeda pendapat dengan rekan kerja?

### Good Service

- Apa bedanya sekadar menjawab dengan benar-benar melayani?
- Jika ada klien komplain, apa respons pertama yang baik?
- Bagaimana cara menunjukkan empati saat membantu klien atau rekan kerja?

### Good Teamwork

- Apa arti Good Teamwork dalam pekerjaan harian?
- Bagaimana cara membantu rekan kerja tanpa membuat pekerjaan sendiri berantakan?
- Apa yang harus dilakukan jika ada anggota tim yang tertinggal?

### Good Delivery

- Apa arti Good Delivery dalam pekerjaan kamu?
- Kalau pekerjaan berisiko terlambat, apa yang harus dilakukan?
- Kenapa komunikasi progress penting sebelum deadline?

---

# 9. Implementation Phases

## Phase 1 — MVP SaaS

Must implement:

- Auth
- Organization onboarding
- Organization switcher
- Multi-tenant data model
- Role-based permissions
- Core values CRUD
- Question bank CRUD
- Member management
- Teams
- Daily challenge randomizer
- Manual answer input
- Manual score input
- Leaderboard
- History
- Basic dashboard
- Audit log
- Template import
- Plan/subscription tables without full payment integration

## Phase 2 — Billing & Reporting

- Stripe integration
- Plan enforcement UI
- CSV exports
- Monthly reports
- Usage dashboard

## Phase 3 — AI Assistance

- AI suggested questions
- AI suggested score
- AI feedback draft
- Evaluator remains final decision maker

## Phase 4 — Integrations & Gamification

- Slack/Teams integration
- Badge system
- Streaks
- Monthly winner
- Department leaderboard
- SSO

---

# 10. Codex Implementation Instruction

## 10.1 Objective

Implement a production-ready MVP SaaS web app called **ValueLoop** based on this specification.

The app must support multiple organizations, customizable core values, tenant-scoped question banks, daily challenge randomization, manual scoring, leaderboard, history, and role-based permissions.

## 10.2 Hard Requirements

Codex must implement:

1. Multi-tenant organization model.
2. Authentication.
3. Organization onboarding.
4. Organization switcher.
5. Role-based permission guard.
6. Tenant isolation on every query.
7. Core values CRUD per organization.
8. Question bank CRUD per organization.
9. Member and team management.
10. Daily challenge randomizer.
11. Persistent random result.
12. Answer submission.
13. Manual score submission.
14. Leaderboard.
15. History.
16. Dashboard.
17. Basic insights.
18. Audit log.
19. Template import.
20. Design system implementation.

## 10.3 Non-Negotiable Rules

- Do not hardcode exactly 5 values.
- Do not hardcode Good Product/Good Attitude/etc as system values.
- Treat those as optional templates only.
- Every tenant-owned query must include organization scope.
- Validate permissions server-side.
- Do not trust client-side hidden buttons.
- Do not allow inactive members to be selected.
- Do not allow inactive values/questions to be selected.
- Do not rerandomize on refresh.
- Do not allow scored sessions to be rerolled.
- Do not allow self-scoring unless organization setting allows it.
- Use Indonesian error messages for app actions.
- Keep UI copy clear and practical.

## 10.4 Definition of Done

MVP is done when:

- User can sign up.
- User can create organization.
- User can select or skip template.
- Owner can invite members.
- Owner/Admin can create core values.
- Owner/Admin can create questions.
- Facilitator can start challenge.
- System selects random member, core value, and question.
- Facilitator can submit answer.
- Facilitator can submit score.
- Leaderboard updates.
- History shows challenge result.
- Data is isolated per organization.
- Member from Organization A cannot see Organization B data.
- Permission matrix is enforced.
- Dashboard shows tenant-scoped metrics.
- Audit log records critical actions.
- TypeScript has no errors.
- Basic tests pass.

---

# 11. Future AI Scoring Design

Not part of MVP.

When added, create table:

```sql
create table ai_score_reviews (
    id text primary key,
    organization_id text not null references organizations(id) on delete cascade,
    challenge_session_id text not null references challenge_sessions(id) on delete cascade,
    suggested_score integer check (suggested_score >= 0 and suggested_score <= 10),
    feedback text,
    rubric text check (rubric is null or json_valid(rubric)),
    model_name text,
    created_at text not null default current_timestamp
);
```

AI prompt should evaluate:

1. Understanding of selected core value.
2. Relevance to daily work.
3. Concrete example.
4. Practical action.
5. Clarity of communication.

Final score must remain controlled by human evaluator.

---

# 12. Cloudflare Bindings & Environment Variables

Cloudflare bindings:

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

---

# 13. Recommended First Codex Prompt

Use this prompt to start implementation:

```text
Implement the ValueLoop MVP SaaS app based on app-spec.md.

Start by:
1. Creating the Astro project structure targeting Cloudflare Workers.
2. Adding TypeScript, Tailwind, Cloudflare adapter, authentication scaffolding, and Cloudflare binding access.
3. Creating D1 migration files for the schema.
4. Implementing D1 repositories, KV helpers, R2 helpers, permission constants, and organization context resolver.
5. Implementing onboarding, organization switcher, core values CRUD, question CRUD, member management, challenge randomizer, answer submission, scoring, leaderboard, and history.

Follow these rules:
- Do not hardcode exactly 5 values.
- Treat 5 Good Values only as an optional template.
- All tenant-owned data must be scoped by organization_id.
- All mutations must check permissions server-side.
- Random challenge result must persist in database.
- Use Indonesian app error messages.
- Keep UI aligned with the design system.
```

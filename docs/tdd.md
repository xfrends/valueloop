# 5. Technical Design Document / TDD

## 5.1 Recommended Stack

### Frontend

- Astro
- Astro Cloudflare adapter (`@astrojs/cloudflare`)
- TypeScript
- Tailwind CSS
- Astro component-based UI
- Client islands only for interactive widgets
- Zod validation

### Backend

- Astro Actions or API routes
- Cloudflare Workers runtime
- App-managed authentication backed by Cloudflare D1 and KV
- Cloudflare D1 for relational data
- Cloudflare KV for key-value cache, session cache, rate limits, and ephemeral tokens
- Cloudflare R2 for object storage
- Service layer for business logic

### Deployment

- Cloudflare Workers for web app and server runtime
- Wrangler for local bindings, D1 migrations, and deployment configuration
- Cloudflare D1 for primary database
- Cloudflare KV for key-value storage
- Cloudflare R2 for organization logos and exported files
- Stripe integration in Phase 2

### Testing

- Unit tests for services and permission rules.
- Integration tests for challenge flow.
- E2E tests for onboarding and challenge run.

---

## 5.2 Architecture

```text
Browser
  ↓
Cloudflare Workers
  ↓
Astro app
  ↓
Astro middleware
  ↓
Auth Resolver
  ↓
Organization Context Resolver
  ↓
Permission Guard
  ↓
Astro Actions / API routes
  ↓
Service Layer
  ↓
Repository Layer
  ↓
Cloudflare D1

Side bindings:
- Cloudflare KV for cache, sessions, rate limits, nonce/token storage
- Cloudflare R2 for logo and report file storage
```

## 5.3 Organization Context

Every authenticated app route must resolve:

```ts
type RequestContext = {
  userId: string;
  organizationId: string;
  organizationMemberId: string;
  organizationRole: 'owner' | 'admin' | 'facilitator' | 'member' | 'viewer';
  platformRole: 'none' | 'platform_admin';
  permissions: string[];
};
```

Organization can be resolved from:

1. URL path: `/app/[orgSlug]/...`
2. Header/cookie storing last selected organization.
3. Explicit organization selector.

Recommended route model:

```text
/app/[orgSlug]/dashboard
/app/[orgSlug]/values
/app/[orgSlug]/challenge
/app/[orgSlug]/leaderboard
/app/[orgSlug]/history
/app/[orgSlug]/insights
/app/[orgSlug]/settings
```

---

## 5.4 Folder Structure

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
        dashboard.astro
        values.astro
        challenge.astro
        leaderboard.astro
        history.astro
        insights.astro
        members.astro
        teams.astro
        questions.astro
        settings.astro
        billing.astro

    platform/
      organizations.astro
      plans.astro

    api/
      health.ts

  actions/
    index.ts

  middleware.ts

  components/
    layout/
      app-shell.astro
      app-sidebar.astro
      app-header.astro
      organization-switcher.astro

    onboarding/
      create-organization-form.astro
      template-picker.astro
      invite-members-form.astro

    values/
      core-value-card.astro
      core-value-form.astro
      core-value-grid.astro

    questions/
      question-table.astro
      question-form.astro

    challenge/
      challenge-panel.astro
      selected-member-card.astro
      selected-value-card.astro
      question-card.astro
      answer-form.astro
      score-form.astro
      score-rubric.astro
      reroll-dialog.astro

    leaderboard/
      leaderboard-table.astro
      top-three-cards.astro

    history/
      history-filter.astro
      history-table.astro
      history-detail-dialog.astro

    insights/
      metric-card.astro
      value-score-chart.astro
      participation-chart.astro

    members/
      members-table.astro
      invite-member-dialog.astro
      member-role-select.astro

    ui/
      button.astro
      card.astro
      badge.astro
      input.astro
      textarea.astro
      select.astro
      dialog.astro
      table.astro
      toast.astro
      dropdown-menu.astro

  lib/
    auth/
      get-current-user.ts
      require-auth.ts
      session.ts
      password.ts

    context/
      get-request-context.ts
      require-org-context.ts

    permissions/
      permissions.ts
      require-permission.ts

    db/
      d1.ts
      queries.ts

    cloudflare/
      bindings.ts
      kv.ts
      r2.ts

    services/
      organization-service.ts
      onboarding-service.ts
      member-service.ts
      team-service.ts
      core-value-service.ts
      question-service.ts
      challenge-service.ts
      leaderboard-service.ts
      history-service.ts
      insight-service.ts
      audit-service.ts
      billing-service.ts

    validations/
      organization-schema.ts
      member-schema.ts
      team-schema.ts
      core-value-schema.ts
      question-schema.ts
      challenge-schema.ts

    utils/
      random.ts
      date.ts
      slug.ts
      format.ts

  types/
    database.ts
    app.ts
    permissions.ts
```

---

## 5.5 Route Map

| Route | Description | Access |
|---|---|---|
| `/` | Public landing page | Public |
| `/login` | Login page | Public |
| `/signup` | Signup page | Public |
| `/onboarding` | Create organization | Authenticated |
| `/app/[orgSlug]/dashboard` | Organization dashboard | Org members |
| `/app/[orgSlug]/values` | Core values management/view | Based on permission |
| `/app/[orgSlug]/challenge` | Run challenge | Owner/Admin/Facilitator |
| `/app/[orgSlug]/leaderboard` | Leaderboard | Org members |
| `/app/[orgSlug]/history` | Challenge history | Based on permission |
| `/app/[orgSlug]/insights` | Culture insights | Owner/Admin/Facilitator/Viewer |
| `/app/[orgSlug]/members` | Members management | Owner/Admin |
| `/app/[orgSlug]/teams` | Teams management | Owner/Admin |
| `/app/[orgSlug]/questions` | Question bank | Owner/Admin/Facilitator/Viewer |
| `/app/[orgSlug]/settings` | Organization settings | Owner/Admin |
| `/app/[orgSlug]/billing` | Billing | Owner |
| `/platform/organizations` | Platform organization management | Platform Admin |
| `/platform/plans` | Platform plan management | Platform Admin |

---

## 5.6 Astro Actions / API Contracts

## `createOrganization`

Input:

```ts
type CreateOrganizationInput = {
  name: string;
  slug: string;
  timezone: string;
  templateCode?: string;
};
```

Rules:

1. User must be authenticated.
2. Slug must be unique.
3. Create organization.
4. Create organization_settings.
5. Create owner membership.
6. Create subscription/trial plan.
7. If template selected, copy template values and questions.
8. Create audit log.

---

## `inviteMember`

Input:

```ts
type InviteMemberInput = {
  organizationId: string;
  email: string;
  role: 'admin' | 'facilitator' | 'member' | 'viewer';
  teamIds?: string[];
};
```

Rules:

- Requires `members.invite`.
- Cannot invite owner directly unless current user is owner.
- Check plan member limit.
- Create invitation.
- If user already exists, create pending or active membership depending invite acceptance flow.

---

## `createCoreValue`

Input:

```ts
type CreateCoreValueInput = {
  organizationId: string;
  name: string;
  shortDescription: string;
  description?: string;
  expectedBehaviors?: string[];
  antiPatterns?: string[];
  example?: string;
  color?: string;
  iconName?: string;
  sortOrder?: number;
};
```

Rules:

- Requires `core_values.manage`.
- Check plan max active values if active.
- Create tenant-scoped value.
- Audit action.

---

## `createQuestion`

Input:

```ts
type CreateQuestionInput = {
  organizationId: string;
  coreValueId: string;
  questionText: string;
  difficulty: 'easy' | 'medium' | 'hard';
  suggestedRubricNote?: string;
};
```

Rules:

- Requires `questions.manage`.
- `coreValueId` must belong to current organization.
- Audit action.

---

## `startChallenge`

Input:

```ts
type StartChallengeInput = {
  organizationId: string;
  sessionDate?: string;
};
```

Output:

```ts
type ChallengeSessionDto = {
  id: string;
  sessionDate: string;
  sequenceNo: number;
  roundNo: number;
  selectedMember: {
    id: string;
    fullName: string;
    email: string;
  };
  coreValue: {
    id: string;
    name: string;
    color: string;
    iconName: string;
  };
  question: {
    id: string;
    questionText: string;
    difficulty: string;
  };
  status: 'open' | 'answered' | 'scored' | 'cancelled';
};
```

Rules:

1. Requires `challenge.start`.
2. Resolve organization timezone.
3. Check active subscription or trial.
4. Check plan monthly challenge limit.
5. If `allowMultipleChallengesPerDay = false`, return existing open/answered/scored session for today.
6. Pick member using fair randomization.
7. Pick active core value.
8. Pick active question under value.
9. Create challenge session.
10. Audit action.

---

## `rerollChallenge`

Input:

```ts
type RerollChallengeInput = {
  organizationId: string;
  sessionId: string;
  reason?: string;
};
```

Rules:

- Requires `challenge.reroll`.
- Session must belong to organization.
- Session status must be `open`.
- Reroll selected member, value, and question.
- Increment `reroll_count`.
- Audit before/after.

---

## `submitAnswer`

Input:

```ts
type SubmitAnswerInput = {
  organizationId: string;
  sessionId: string;
  answerText: string;
};
```

Rules:

- Requires `challenge.answer`.
- Session must belong to organization.
- Status must be `open`.
- Answer text min length: 3.
- Update status to `answered`.

---

## `submitScore`

Input:

```ts
type SubmitScoreInput = {
  organizationId: string;
  sessionId: string;
  score: number;
  evaluatorNote?: string;
};
```

Rules:

- Requires `challenge.score`.
- Session must belong to organization.
- Status must be `answered`.
- Score integer 0–10.
- If selected member equals evaluator and `allowSelfScoring = false`, reject.
- Update status to `scored`.
- Audit action.

---

## `getLeaderboard`

Input:

```ts
type GetLeaderboardInput = {
  organizationId: string;
  teamId?: string;
  startDate?: string;
  endDate?: string;
  includeInactive?: boolean;
};
```

Rules:

- Requires `leaderboard.view`.
- Scope by organization.
- Use pagination for long leaderboard.

---

## `getHistory`

Input:

```ts
type GetHistoryInput = {
  organizationId: string;
  memberId?: string;
  coreValueId?: string;
  teamId?: string;
  status?: 'open' | 'answered' | 'scored' | 'cancelled';
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
};
```

Rules:

- If user has `history.view_all`, return organization history.
- If user only has `history.view_own`, force `memberId = currentMemberId`.

---

## 5.7 Randomization Algorithms

## Fair Member Randomization

```ts
async function pickRandomMember(organizationId: string) {
  const activeMembers = await getActiveChallengeEligibleMembers(organizationId);

  if (activeMembers.length === 0) {
    throw new Error('Belum ada member aktif untuk dipilih.');
  }

  const currentRound = await getCurrentRoundNo(organizationId);

  const selectedMemberIds = await getSelectedMemberIdsByRound({
    organizationId,
    roundNo: currentRound,
  });

  let candidates = activeMembers.filter(
    member => !selectedMemberIds.includes(member.id)
  );

  let roundNo = currentRound;

  if (candidates.length === 0) {
    roundNo = currentRound + 1;
    candidates = activeMembers;
  }

  return {
    selectedMember: randomItem(candidates),
    roundNo,
  };
}
```

## Core Value Randomization

```ts
async function pickRandomCoreValue(organizationId: string) {
  const activeValues = await getActiveCoreValues(organizationId);

  if (activeValues.length === 0) {
    throw new Error('Belum ada core value aktif.');
  }

  return randomItem(activeValues);
}
```

## Question Randomization

```ts
async function pickRandomQuestion(params: {
  organizationId: string;
  coreValueId: string;
  cooldownDays: number;
}) {
  const questions = await getActiveQuestionsByCoreValue({
    organizationId: params.organizationId,
    coreValueId: params.coreValueId,
  });

  if (questions.length === 0) {
    throw new Error('Belum ada pertanyaan aktif untuk core value ini.');
  }

  const recentlyAskedIds = await getRecentlyAskedQuestionIds({
    organizationId: params.organizationId,
    coreValueId: params.coreValueId,
    days: params.cooldownDays,
  });

  let candidates = questions.filter(
    question => !recentlyAskedIds.includes(question.id)
  );

  if (candidates.length === 0) {
    candidates = questions;
  }

  return randomItem(candidates);
}
```

---

## 5.8 State Machine

```text
open
  ↓
answered
  ↓
scored
```

Alternative:

```text
open → cancelled
answered → cancelled
```

Rules:

- `open`: challenge started and waiting for answer.
- `answered`: answer submitted and waiting for score.
- `scored`: final state.
- `cancelled`: challenge cancelled by Owner/Admin.

---

## 5.9 Validation Schemas

```ts
import { z } from 'zod';

export const createOrganizationSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z.string().min(3).max(50).regex(/^[a-z0-9-]+$/),
  timezone: z.string().default('Asia/Jakarta'),
  templateCode: z.string().optional(),
});

export const coreValueSchema = z.object({
  name: z.string().min(2).max(80),
  shortDescription: z.string().min(5).max(160),
  description: z.string().max(2000).optional(),
  expectedBehaviors: z.array(z.string().min(2)).default([]),
  antiPatterns: z.array(z.string().min(2)).default([]),
  example: z.string().max(1000).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  iconName: z.string().min(2),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(false),
});

export const questionSchema = z.object({
  coreValueId: z.string().uuid(),
  questionText: z.string().min(10).max(500),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  suggestedRubricNote: z.string().max(1000).optional(),
  isActive: z.boolean().default(true),
});

export const submitAnswerSchema = z.object({
  sessionId: z.string().uuid(),
  answerText: z.string().min(3).max(5000),
});

export const submitScoreSchema = z.object({
  sessionId: z.string().uuid(),
  score: z.number().int().min(0).max(10),
  evaluatorNote: z.string().max(2000).optional(),
});
```

---

## 5.10 Error Messages

Use Bahasa Indonesia for app errors.

| Case | Message |
|---|---|
| No active members | `Belum ada member aktif untuk dipilih.` |
| No active values | `Belum ada core value aktif.` |
| No active questions | `Belum ada pertanyaan aktif untuk core value ini.` |
| Unauthorized | `Anda tidak memiliki akses untuk aksi ini.` |
| Wrong organization | `Data tidak ditemukan di organisasi ini.` |
| Session already scored | `Challenge sudah diberi skor dan tidak bisa diubah.` |
| Invalid score | `Skor harus berada di antara 0 sampai 10.` |
| Empty answer | `Jawaban tidak boleh kosong.` |
| Plan limit reached | `Batas paket Anda sudah tercapai.` |
| Organization suspended | `Organisasi ini sedang tidak aktif.` |

---

## 5.11 Audit Events

```ts
export type AuditAction =
  | 'organization.created'
  | 'organization.updated'
  | 'organization.suspended'
  | 'member.invited'
  | 'member.updated'
  | 'member.deactivated'
  | 'member.role_updated'
  | 'team.created'
  | 'team.updated'
  | 'core_value.created'
  | 'core_value.updated'
  | 'core_value.deactivated'
  | 'question.created'
  | 'question.updated'
  | 'question.deactivated'
  | 'challenge.started'
  | 'challenge.rerolled'
  | 'challenge.answered'
  | 'challenge.scored'
  | 'challenge.cancelled'
  | 'settings.updated'
  | 'billing.updated';
```

---

## 5.12 Security and Tenant Isolation

Mandatory rules for Codex:

1. Never query tenant-owned tables without `organization_id`.
2. Never trust `organization_id` from client without verifying membership.
3. Always resolve current member from authenticated user + organization.
4. Always check permission in server action.
5. UI checks are only for convenience.
6. All mutation actions must create audit logs.
7. Platform admin support access must be audited.

Example permission guard:

```ts
export async function requirePermission(
  context: RequestContext,
  permission: string
) {
  if (!context.permissions.includes(permission)) {
    throw new Error('Anda tidak memiliki akses untuk aksi ini.');
  }
}
```

Example tenant ownership check:

```ts
export async function assertBelongsToOrganization(params: {
  table: string;
  id: string;
  organizationId: string;
}) {
  const record = await db.findById(params.table, params.id);

  if (!record || record.organization_id !== params.organizationId) {
    throw new Error('Data tidak ditemukan di organisasi ini.');
  }

  return record;
}
```

---

## 5.13 Testing Plan

### Unit Tests

- Permission mapping.
- Organization context resolver.
- Slug generator.
- Fair randomization.
- Question cooldown logic.
- Score validation.
- Plan limit checker.

### Integration Tests

- Create organization with template.
- Invite member.
- Create core value.
- Create question.
- Start challenge.
- Submit answer.
- Submit score.
- Leaderboard updates.
- Member cannot view another organization data.
- Member cannot score challenge.

### E2E Tests

- Signup.
- Create organization.
- Choose template.
- Invite member.
- Login as facilitator.
- Run challenge.
- Submit score.
- View leaderboard.
- View history.

---

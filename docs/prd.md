# ValueLoop SaaS App Spec

**Document Type:** PRD + ERD + Permission & Role Matrix + Technical Design Document + Design System  
**Product Name:** ValueLoop  
**Version:** 1.0 MVP SaaS  
**Primary Goal:** Build a multi-tenant SaaS app that helps organizations turn their core values into daily work habits through challenges, questions, answers, scoring, leaderboards, and insights.

---

## 0. Executive Summary

ValueLoop is a B2B SaaS platform for organizations that want to activate their internal core values in daily routines.

Instead of hardcoding one company's 5 Values, ValueLoop lets every organization define its own values, examples, behaviors, question bank, scoring rubric, members, teams, and challenge rhythm.

### Positioning

> ValueLoop helps organizations turn core values into daily habits through structured challenges, scoring, leaderboards, and culture insights.

### Core Loop

```text
Define Core Values
  ↓
Create Questions
  ↓
Run Daily Challenge
  ↓
Member Answers
  ↓
Facilitator Scores
  ↓
Leaderboard & Insights Update
  ↓
Repeat
```

### MVP Principle

Keep the MVP focused:

- Multi-tenant organization support.
- Custom core values per organization.
- Manual scoring 0–10.
- Daily challenge randomizer.
- Leaderboard.
- History.
- Basic insights.
- Role-based access control.

Do not include AI scoring, gamification, Slack integration, mobile native app, or complex HR review in MVP.

---

# 1. Product Requirement Document / PRD

## 1.1 Product Name

**ValueLoop**

## 1.2 Product Description

ValueLoop is a SaaS web app that enables organizations to manage, educate, and measure the practice of their core values through recurring team challenges.

Each organization can define its own values, for example:

- Integrity
- Ownership
- Customer Obsession
- Innovation
- Collaboration

Or:

- Good Product
- Good Attitude
- Good Service
- Good Teamwork
- Good Delivery

The system will randomly select a member, a core value, and a related question. The selected member answers, then a facilitator gives a score from 0 to 10 based on answer quality.

## 1.3 Problem Statement

Organizations often publish core values but fail to operationalize them into daily habits.

Common problems:

- Core values are only shown in onboarding slides or posters.
- Employees know the words but do not understand practical behavior.
- There is no lightweight ritual to reinforce values.
- Leaders cannot see whether people understand the values.
- Culture initiatives are often not measurable.
- Team meetings lack structured culture-building activities.

## 1.4 Goals

ValueLoop aims to:

1. Help organizations define and manage their own core values.
2. Convert abstract values into daily practical questions.
3. Make team meetings more intentional and culture-driven.
4. Measure understanding through answer scoring.
5. Track participation and improvement over time.
6. Provide lightweight culture insights for leaders.

## 1.5 Non-Goals for MVP

The following are explicitly not part of MVP:

- AI auto-scoring.
- Sentiment analysis.
- Complex competency mapping.
- Performance review automation.
- Payroll or HRIS integration.
- Slack, Teams, or WhatsApp integration.
- Native mobile app.
- Badge system and advanced gamification.
- Public marketplace for question templates.
- Enterprise SSO.

## 1.6 Target Customers

### Primary Customers

- Small to mid-sized companies.
- Agencies.
- Accounting, finance, tax, and service firms.
- SaaS companies.
- Operations-heavy teams.
- HR and People Ops teams.

### Secondary Customers

- Business consultants.
- Leadership coaches.
- Training providers.
- Internal culture committees.

## 1.7 User Personas

### Platform Admin

Internal ValueLoop operator. Manages SaaS-level data, plans, organizations, and system health.

### Organization Owner

Person who owns an organization account. Usually founder, director, HR lead, or operations manager.

### Organization Admin

Manages members, teams, core values, questions, and reports.

### Facilitator

Runs daily challenge in meetings, records answers, and submits scores.

### Member

Participates in challenge, answers questions, and views own history and leaderboard.

### Viewer

Can view dashboard, leaderboard, history, and reports, but cannot change operational data.

## 1.8 SaaS Tenant Model

ValueLoop must support multiple organizations.

Rules:

- One user can belong to multiple organizations.
- Each organization has isolated data.
- Every tenant-owned record must include `organization_id`.
- Users switch organization from the app header.
- Permissions are scoped per organization.
- Platform-level roles are separate from organization-level roles.
- Organization data must never leak to another organization.

## 1.9 Core Functional Requirements

## FR-001 Public Landing Page

ValueLoop should have a simple public landing page.

Content:

- Product headline.
- Product benefits.
- How it works.
- Call to action: `Create Organization` or `Sign In`.

Acceptance Criteria:

- Public users can view landing page.
- Logged-in users are redirected to dashboard.
- Public page does not expose tenant data.

---

## FR-002 Authentication

Users must be able to sign up, sign in, and sign out.

Recommended MVP:

- Email/password auth implemented in Astro Actions.
- User and session source of truth in Cloudflare D1.
- Session cache, login throttling, and one-time tokens in Cloudflare KV.
- Cloudflare Turnstile optional for signup/login abuse protection.
- Authenticated users can update their profile data and change or set a password. Email changes require OTP verification again, and password changes revoke the user's other sessions.
- Magic link and OAuth are not part of MVP unless a future external email/OAuth provider is intentionally added.

Acceptance Criteria:

- User can create account.
- User can sign in.
- User can sign out.
- Unauthenticated users cannot access app dashboard.
- Authenticated users without organization are redirected to onboarding.

---

## FR-003 Organization Onboarding

A new user can create an organization.

Onboarding steps:

1. Create account.
2. Create organization.
3. Choose template or start blank.
4. Invite members.
5. Create first challenge.

Acceptance Criteria:

- User can create an organization by name; its slug is generated automatically. If the base slug is already used, append the owner user code and, only if still needed, a numeric sequence.
- Creator becomes `owner`.
- Organization gets default settings.
- User can choose a core value template or start blank.
- Organization slug must be unique.

---

## FR-004 Organization Switcher

Users who belong to multiple organizations can switch context.

Acceptance Criteria:

- Header shows current organization.
- User can switch to another organization where they are active member.
- All queries and actions use current organization context.
- If user has no access to organization, return unauthorized.

---

## FR-005 Manage Organization Settings

Owner and Admin can manage organization settings.

Fields:

- Organization name
- Slug
- Logo
- Timezone
- Default language
- Challenge frequency
- Question cooldown days
- Allow multiple challenges per day
- Active/inactive status

Acceptance Criteria:

- Owner can update billing-relevant settings.
- Admin can update non-billing settings.
- Slug update must validate uniqueness.
- Settings changes are logged in audit log.

---

## FR-006 Manage Members

Owner/Admin can invite and manage members.

Fields:

- Full name
- Email
- Role
- Team
- Active status

Acceptance Criteria:

- Owner/Admin can invite member by email.
- Invited user receives invitation link or pending invite record.
- Owner/Admin can change role.
- Owner/Admin can deactivate member.
- Deactivated member is excluded from random challenge selection.
- Member history remains available after deactivation.

---

## FR-007 Manage Teams

Organization can group members into teams/departments.

Fields:

- Team name
- Description
- Active status

Acceptance Criteria:

- Owner/Admin can create, update, deactivate teams.
- Member can belong to one or more teams.
- Leaderboard and history can be filtered by team.

---

## FR-008 Manage Core Values

Each organization can define its own core values.

Fields:

- Name
- Short description
- Full description
- Expected behaviors
- Anti-patterns
- Example
- Color
- Icon
- Sort order
- Active status

Acceptance Criteria:

- Owner/Admin can create, update, deactivate core values.
- Core value baru selalu dibuat dalam status inactive.
- Core value hanya dapat diaktifkan setelah seluruh field profil terisi dan memiliki minimal satu question aktif.
- Owner/Admin dapat menghapus core value hanya jika tidak memiliki question atau dependensi data lain seperti riwayat challenge.
- Core values are tenant-specific.
- There is no hardcoded limit of 5 values.
- Minimum recommended active values: 1.
- Inactive values do not appear in new challenges.
- Existing history remains valid if a value is deactivated.

---

## FR-009 Core Value Templates

ValueLoop provides optional templates to speed up setup.

Examples:

- 5 Good Values template
- Leadership Values template
- Service Team template
- Startup Culture template

Acceptance Criteria:

- User can select template during onboarding.
- Template creates core values and starter questions inside organization.
- Templates are copied, not linked.
- Organization can edit copied values after setup.

---

## FR-010 Manage Question Bank

Questions are connected to core values.

Fields:

- Core value
- Question text
- Difficulty: easy, medium, hard
- Suggested rubric note
- Active status

Acceptance Criteria:

- Owner/Admin can create, update, deactivate questions.
- Question must belong to one core value.
- Facilitator can view question bank.
- Inactive questions are excluded from random selection.
- Questions are tenant-specific.

---

## FR-011 Start Challenge

Facilitator/Admin/Owner can start a challenge.

System randomly selects:

1. Member
2. Core value
3. Question related to selected core value

Acceptance Criteria:

- Random result is saved to database.
- Refreshing the page does not change result.
- Challenge date uses organization timezone.
- System excludes inactive members.
- System excludes inactive values.
- System excludes inactive questions.
- If there is already an open challenge for the date and organization, return existing challenge unless multiple daily challenges are enabled.

---

## FR-012 Fair Member Randomization

The system should distribute selection fairly.

Rule:

- Select active members who have not been selected in the current round.
- If all active members have been selected, increment round number.
- Select random member from candidates.

Acceptance Criteria:

- Same member should not be prioritized repeatedly.
- Round number is stored in challenge session.
- Deactivated members are ignored.
- Re-activated members are eligible from current round onward.

---

## FR-013 Core Value Randomization

The system selects one active core value randomly.

Optional future weighting:

- Weight by underrepresented values.
- Weight by company focus of the week.
- Weight by team.

MVP Rule:

- Random active value from current organization.

Acceptance Criteria:

- Selected value belongs to current organization.
- Inactive values are excluded.

---

## FR-014 Question Randomization

System selects one active question under selected core value.

MVP Rule:

- Avoid questions used in the last N days, where N comes from organization setting.
- If no alternative exists, reuse older question.

Acceptance Criteria:

- Question must match selected core value.
- Question must belong to current organization.
- Random result must be persistent.

---

## FR-015 Reroll Challenge

Facilitator/Admin/Owner can reroll if selected member is absent or selection is invalid.

Acceptance Criteria:

- Reroll is only allowed before answer is submitted.
- Reroll reason is optional but recommended.
- Reroll count is tracked.
- Reroll event is logged.
- Scored sessions cannot be rerolled.

---

## FR-016 Submit Answer

Facilitator records selected member's answer.

Fields:

- Answer text
- Answered at

Acceptance Criteria:

- Answer cannot be empty.
- Answer can only be submitted for open challenge.
- Status changes from `open` to `answered`.
- Answer is associated with selected member.
- Audit log is created.

---

## FR-017 Submit Score

Facilitator/Admin/Owner scores the answer.

Fields:

- Score 0–10
- Evaluator note

Acceptance Criteria:

- Score must be integer 0–10.
- Scorer must have `challenge.score` permission.
- Member cannot score their own answer unless they are owner/admin and self-score is allowed by organization setting.
- Status changes to `scored`.
- Leaderboard updates automatically through query/view.
- Audit log is created.

---

## FR-018 Leaderboard

Leaderboard ranks members based on scored sessions.

Metrics:

- Total points
- Total answered
- Average score
- Highest score
- Last participation date

Acceptance Criteria:

- Leaderboard is scoped to current organization.
- Can filter by date range and team.
- Default sorting: total points descending, average score descending, total answered descending.
- Inactive members can be hidden or shown.
- Member can see leaderboard if permitted.

---

## FR-019 History

History shows challenge records.

Fields:

- Date
- Member
- Team
- Core value
- Question
- Answer
- Score
- Evaluator
- Evaluator note
- Status

Acceptance Criteria:

- Owner/Admin/Facilitator/Viewer can view all organization history.
- Member can view own history.
- Filters: date range, member, team, value, status.
- History is tenant-scoped.

---

## FR-020 Dashboard

Dashboard summarizes organization activity.

Widgets:

- Today challenge
- Total active members
- Total challenges this month
- Average score this month
- Top 5 leaderboard
- Value distribution
- Participation rate

Acceptance Criteria:

- Dashboard data is scoped to current organization.
- Member sees limited dashboard.
- Admin/Owner sees full dashboard.
- Empty state is shown if organization has no values/questions/members.

---

## FR-021 Insights

MVP insights should be basic and query-based.

Insights:

- Participation rate
- Average score by value
- Average score by team
- Most frequently asked values
- Members not yet selected this round

Acceptance Criteria:

- Insights are accessible to Owner/Admin/Viewer.
- Data is scoped to organization.
- Filters by date range and team.

---

## FR-022 Audit Log

Important changes must be logged.

Events:

- Organization created/updated
- Member invited/updated/deactivated
- Role changed
- Core value created/updated/deactivated
- Question created/updated/deactivated
- Challenge started/rerolled/answered/scored/cancelled
- Settings updated

Acceptance Criteria:

- Audit log includes actor, organization, action, entity, before value, after value, timestamp.
- Audit log is read-only from UI.
- Owner/Admin can view organization audit log.
- Platform Admin can view all audit logs.

---

## FR-023 Billing and Plan Limits

Billing can be MVP-lite or Phase 2.

Recommended MVP:

- Create plan and subscription tables.
- Implement plan limit checks in code.
- Payment integration can be added later.

Plan limits examples:

- Max members
- Max active core values
- Max challenges per month
- Insights access
- Export access
- AI scoring access in future

Acceptance Criteria:

- Organization has assigned plan.
- Seluruh plan tetap ditampilkan dalam katalog, tetapi hanya Free yang tersedia; plan lainnya berstatus Coming Soon.
- App can check feature access.
- Owner can see plan page.
- Payment provider integration can be stubbed in MVP.

---

## FR-024 Data Export

Owner/Admin/Viewer can export reports.

MVP Export:

- CSV history export.
- CSV leaderboard export.

Acceptance Criteria:

- Export respects permission.
- Export is scoped to organization.
- Export supports date range filter.

---

---

## FR-025 AI-Generated Questions (Phase 2 / Planned)

System can automatically generate relevant questions for core values using AI to keep the challenge fresh.

Capabilities:
- AI Question Generator tool within the Question Bank.
- Generates questions based on the organization's core value description, Do's, and Don'ts.
- Admin/Facilitator can review, edit, and save AI-generated questions to the active bank.

Acceptance Criteria:
- AI generation is an assistive tool; human must approve questions before they are used.
- Adheres to the MVP constraint of "No AI scoring" (AI is only for question creation, not evaluation).

---

## FR-026 Ad-Hoc / Event-Based Challenges

Allow creating a challenge manually without the randomizer, specifically for project evaluations or immediate feedback loops.

Capabilities:
- Facilitator can manually select a specific Member (or Team) and a specific Core Value.
- Facilitator can manually pick a question.
- Useful for immediate post-project feedback iteration.

Acceptance Criteria:
- Challenge can be flagged as "Ad-Hoc" or "Event-Based".
- Scores from ad-hoc challenges still contribute to the main Leaderboard.
- Ad-hoc selection does not disrupt the round-robin counter of the random daily challenge.

---

## FR-027 Scenario-Based Question Formats

Questions can be explicitly designed as practical scenarios requiring concrete examples.

Capabilities:
- Support for "Scenario" question types alongside standard questions.
- Includes a context/scenario description and a prompt for the member to explain how they handled or would handle it.

Acceptance Criteria:
- Question Bank UI supports entering scenario context.
- Challenge UI displays the scenario clearly.

---

## 1.10 Non-Functional Requirements

### Security

- Enforce authentication for all app routes.
- Enforce server-side permission checks.
- Enforce tenant isolation in all service methods.
- Every tenant-owned query must filter by `organization_id`.
- Role checks in UI are not enough.
- Audit critical actions.
- Never expose data across organizations.

### Performance

- Dashboard query should load within 2 seconds for normal organization data.
- Leaderboard query should load within 1 second for small/mid-sized tenant.
- Add indexes on `organization_id`, date, member, value, and status.
- Use pagination for history and audit log.

### Reliability

- Challenge random result must persist.
- Refresh must not rerandomize.
- Scored session should be immutable by facilitator.
- Owner/Admin edits on scored session must be audited.
- Database constraints should protect invalid scores and status.

### Usability

- Challenge page must be readable during meetings.
- Main CTA must be clear.
- Empty states must guide setup.
- Organization switcher must be obvious.
- Mobile responsive, but desktop/tablet meeting display is priority.

### Scalability

- Data model must support many organizations.
- Organization-level indexes required.
- Avoid global queries without pagination.
- Design all tenant-owned tables with `organization_id`.

---

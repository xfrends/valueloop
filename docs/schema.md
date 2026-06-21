# 3. Database Schema

Assumption: Cloudflare D1 with SQLite-compatible SQL. Authentication is app-managed through Astro Actions/API routes, D1 user/session tables, and KV-backed session/token cache.

## 3.1 Cloudflare D1 Notes

- D1 is the source of truth for relational data.
- IDs are `text` UUID strings generated in application code with `crypto.randomUUID()`.
- Timestamps are stored as UTC ISO strings or SQLite `current_timestamp` text values.
- JSON fields are stored as `text` and protected with `json_valid(...)` checks.
- Boolean values are stored as `integer` with `0` or `1`.
- KV handles cache, session cache, rate limits, nonce/token storage, and short-lived coordination data. Do not use KV as the source of truth for tenant data.
- R2 stores logos and exported files. D1 stores object keys such as `logo_r2_key`, not binary files.

## 3.2 Core Tables

```sql
pragma foreign_keys = on;

create table users (
    id text primary key,
    full_name text not null,
    email text not null unique,
    password_hash text,
    email_verified_at text,
    avatar_url text,
    platform_role text not null default 'none'
        check (platform_role in ('none', 'platform_admin')),
    created_at text not null default current_timestamp,
    updated_at text not null default current_timestamp
);

create table auth_sessions (
    id text primary key,
    user_id text not null references users(id) on delete cascade,
    token_hash text not null unique,
    expires_at text not null,
    last_seen_at text,
    revoked_at text,
    created_at text not null default current_timestamp
);

create table organizations (
    id text primary key,
    name text not null,
    slug text not null unique,
    logo_r2_key text,
    timezone text not null default 'Asia/Jakarta',
    default_locale text not null default 'id',
    status text not null default 'active'
        check (status in ('active', 'suspended', 'cancelled')),
    created_at text not null default current_timestamp,
    updated_at text not null default current_timestamp
);

create table organization_members (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
    role text not null
        check (role in ('owner', 'admin', 'facilitator', 'member', 'viewer')),
    status text not null default 'active'
        check (status in ('active', 'invited', 'inactive')),
    joined_at text,
    created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp,
  unique (organization_id, user_id)
);

-- Exactly one owner row is allowed per organization.
create unique index idx_organization_members_single_owner
  on organization_members(organization_id)
  where role = 'owner';

create table teams (
    id text primary key,
    organization_id text not null references organizations(id) on delete cascade,
    name text not null,
    description text,
    is_active integer not null default 1 check (is_active in (0, 1)),
    created_at text not null default current_timestamp,
    updated_at text not null default current_timestamp,
    unique (organization_id, name)
);

create table team_members (
    id text primary key,
    organization_id text not null references organizations(id) on delete cascade,
    team_id text not null references teams(id) on delete cascade,
    organization_member_id text not null references organization_members(id) on delete cascade,
    created_at text not null default current_timestamp,
    unique (team_id, organization_member_id)
);

create table core_values (
    id text primary key,
    organization_id text not null references organizations(id) on delete cascade,
    name text not null,
    short_description text not null,
    description text,
    expected_behaviors text not null default '[]' check (json_valid(expected_behaviors)),
    anti_patterns text not null default '[]' check (json_valid(anti_patterns)),
    example text,
    color text not null default '#2563EB',
    icon_name text not null default 'star',
    sort_order integer not null default 0,
    is_active integer not null default 1 check (is_active in (0, 1)),
    created_at text not null default current_timestamp,
    updated_at text not null default current_timestamp
);

create table questions (
    id text primary key,
    organization_id text not null references organizations(id) on delete cascade,
    core_value_id text not null references core_values(id) on delete cascade,
    question_text text not null,
    difficulty text not null default 'easy'
        check (difficulty in ('easy', 'medium', 'hard')),
    suggested_rubric_note text,
    is_active integer not null default 1 check (is_active in (0, 1)),
    created_by_member_id text references organization_members(id) on delete set null,
    created_at text not null default current_timestamp,
    updated_at text not null default current_timestamp
);

create table challenge_sessions (
    id text primary key,
    organization_id text not null references organizations(id) on delete cascade,
    session_date text not null,
    sequence_no integer not null default 1,
    round_no integer not null default 1,
    selected_member_id text not null references organization_members(id) on delete restrict,
    core_value_id text not null references core_values(id) on delete restrict,
    question_id text not null references questions(id) on delete restrict,
    answer_text text,
    answered_at text,
    score integer check (score >= 0 and score <= 10),
    evaluator_member_id text references organization_members(id) on delete set null,
    evaluator_note text,
    status text not null default 'open'
        check (status in ('open', 'answered', 'scored', 'cancelled')),
    reroll_count integer not null default 0,
    created_by_member_id text references organization_members(id) on delete set null,
    created_at text not null default current_timestamp,
    updated_at text not null default current_timestamp,
    unique (organization_id, session_date, sequence_no)
);
```

## 3.3 SaaS Support Tables

```sql
create table invitations (
    id text primary key,
    organization_id text not null references organizations(id) on delete cascade,
    email text not null,
    role text not null
        check (role in ('owner', 'admin', 'facilitator', 'member', 'viewer')),
    token_hash text not null unique,
    status text not null default 'pending'
        check (status in ('pending', 'accepted', 'expired', 'revoked')),
    expires_at text not null,
    invited_by_member_id text references organization_members(id) on delete set null,
    created_at text not null default current_timestamp
);

create table audit_logs (
    id text primary key,
    organization_id text references organizations(id) on delete cascade,
    actor_user_id text references users(id) on delete set null,
    actor_member_id text references organization_members(id) on delete set null,
    action text not null,
    entity_type text not null,
    entity_id text,
    before_value text check (before_value is null or json_valid(before_value)),
    after_value text check (after_value is null or json_valid(after_value)),
    created_at text not null default current_timestamp
);

create table organization_settings (
    organization_id text primary key references organizations(id) on delete cascade,
    settings text not null default '{"challengeFrequency":"daily","questionCooldownDays":14,"allowMultipleChallengesPerDay":false,"allowSelfScoring":false,"defaultScoreRubric":[{"min":0,"max":2,"label":"Perlu banyak perbaikan"},{"min":3,"max":4,"label":"Masih kurang"},{"min":5,"max":6,"label":"Cukup"},{"min":7,"max":8,"label":"Baik"},{"min":9,"max":10,"label":"Sangat baik"}]}'
        check (json_valid(settings)),
    updated_at text not null default current_timestamp
);

create table plans (
    id text primary key,
    code text not null unique,
    name text not null,
    limits text not null default '{}' check (json_valid(limits)),
    features text not null default '{}' check (json_valid(features)),
    is_active integer not null default 1 check (is_active in (0, 1)),
    created_at text not null default current_timestamp
);

create table subscriptions (
    id text primary key,
    organization_id text not null unique references organizations(id) on delete cascade,
    plan_id text not null references plans(id) on delete restrict,
    status text not null default 'trialing'
        check (status in ('trialing', 'active', 'past_due', 'cancelled')),
    billing_provider text,
    external_customer_id text,
    external_subscription_id text,
    current_period_start text,
    current_period_end text,
    created_at text not null default current_timestamp,
    updated_at text not null default current_timestamp
);
```

## 3.4 Template Tables

```sql
create table value_templates (
    id text primary key,
    code text not null unique,
    name text not null,
    description text,
    is_active integer not null default 1 check (is_active in (0, 1)),
    created_at text not null default current_timestamp
);

create table value_template_items (
    id text primary key,
    template_id text not null references value_templates(id) on delete cascade,
    name text not null,
    short_description text not null,
    description text,
    expected_behaviors text not null default '[]' check (json_valid(expected_behaviors)),
    anti_patterns text not null default '[]' check (json_valid(anti_patterns)),
    example text,
    color text not null default '#2563EB',
    icon_name text not null default 'star',
    sort_order integer not null default 0
);

create table question_template_items (
    id text primary key,
    value_template_item_id text not null references value_template_items(id) on delete cascade,
    question_text text not null,
    difficulty text not null default 'easy'
        check (difficulty in ('easy', 'medium', 'hard')),
    suggested_rubric_note text
);
```

## 3.5 Indexes

```sql
create index idx_auth_sessions_user on auth_sessions(user_id);
create index idx_auth_sessions_expires on auth_sessions(expires_at);

create index idx_org_members_org on organization_members(organization_id);
create index idx_org_members_user on organization_members(user_id);
create index idx_org_members_role on organization_members(role);
create index idx_org_members_status on organization_members(status);

create index idx_teams_org on teams(organization_id);
create index idx_team_members_org on team_members(organization_id);
create index idx_team_members_team on team_members(team_id);
create index idx_team_members_member on team_members(organization_member_id);

create index idx_core_values_org on core_values(organization_id);
create index idx_core_values_active on core_values(organization_id, is_active);

create index idx_questions_org on questions(organization_id);
create index idx_questions_value on questions(core_value_id);
create index idx_questions_active on questions(organization_id, core_value_id, is_active);

create index idx_sessions_org_date on challenge_sessions(organization_id, session_date);
create index idx_sessions_org_member on challenge_sessions(organization_id, selected_member_id);
create index idx_sessions_org_value on challenge_sessions(organization_id, core_value_id);
create index idx_sessions_org_status on challenge_sessions(organization_id, status);
create index idx_sessions_round on challenge_sessions(organization_id, round_no);

create index idx_audit_org_created on audit_logs(organization_id, created_at);
create index idx_audit_actor on audit_logs(actor_user_id);
```

## 3.6 Leaderboard View

```sql
create or replace view leaderboard_view as
select
    om.organization_id,
    om.id as organization_member_id,
    u.id as user_id,
    u.full_name,
    u.email,
    om.role,
    om.status,
    coalesce(sum(case when cs.status = 'scored' then coalesce(cs.score, 0) else 0 end), 0) as total_points,
    count(case when cs.status = 'scored' then 1 end) as total_answered,
    round(avg(case when cs.status = 'scored' then cs.score end), 2) as average_score,
    max(case when cs.status = 'scored' then cs.score end) as highest_score,
    max(case when cs.status = 'scored' then cs.session_date end) as last_participation_date
from organization_members om
join users u on u.id = om.user_id
left join challenge_sessions cs
    on cs.selected_member_id = om.id
    and cs.organization_id = om.organization_id
    and cs.status = 'scored'
where om.status in ('active', 'inactive')
group by
    om.organization_id,
    om.id,
    u.id,
    u.full_name,
    u.email,
    om.role,
    om.status;
```

---

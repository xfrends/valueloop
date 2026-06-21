# 4. Permission & Role Matrix

## 4.1 Role Types

There are two role scopes.

### Platform Role

Used by ValueLoop internal operators.

| Platform Role | Description |
|---|---|
| `platform_admin` | Can access platform admin area and manage organizations/plans. |
| `none` | Normal user. |

### Organization Role

Scoped per organization.

| Organization Role | Description |
|---|---|
| `owner` | Full access to organization, billing, members, settings. |
| `admin` | Manages operational data except billing ownership. |
| `facilitator` | Runs challenge, records answer, submits score. |
| `member` | Participates and views allowed data. |
| `viewer` | Read-only access to dashboard, leaderboard, history, insights. |

## 4.2 Organization Permission Matrix

| Module / Action | Owner | Admin | Facilitator | Member | Viewer |
|---|---:|---:|---:|---:|---:|
| View Dashboard | Yes | Yes | Yes | Limited | Yes |
| View Core Values | Yes | Yes | Yes | Yes | Yes |
| Manage Core Values | Yes | Yes | No | No | No |
| View Question Bank | Yes | Yes | Yes | No | Yes |
| Manage Questions | Yes | Yes | No | No | No |
| View Members | Yes | Yes | Yes | Limited | Yes |
| Invite Members | Yes | Yes | No | No | No |
| Manage Member Roles | Yes | Yes | No | No | No |
| Transfer Ownership | Yes | No | No | No | No |
| Manage Teams | Yes | Yes | No | No | No |
| Start Challenge | Yes | Yes | Yes | No | No |
| Reroll Challenge | Yes | Yes | Yes | No | No |
| Submit Answer | Yes | Yes | Yes | No | No |
| Submit Score | Yes | Yes | Yes | No | No |
| Edit Scored Session | Yes | Yes | No | No | No |
| Cancel Session | Yes | Yes | No | No | No |
| View All History | Yes | Yes | Yes | No | Yes |
| View Own History | Yes | Yes | Yes | Yes | Yes |
| View Leaderboard | Yes | Yes | Yes | Yes | Yes |
| View Insights | Yes | Yes | Yes | No | Yes |
| Export Reports | Yes | Yes | Yes | No | Yes |
| View Audit Log | Yes | Yes | No | No | No |
| Manage Org Settings | Yes | Yes | No | No | No |
| Manage Billing | Yes | No | No | No | No |
| Delete Organization | Yes | No | No | No | No |

## 4.3 Platform Permission Matrix

| Platform Action | Platform Admin |
|---|---:|
| View all organizations | Yes |
| Suspend organization | Yes |
| Manage plans | Yes |
| View platform audit logs | Yes |
| Access organization data for support | Yes, audited |
| Modify organization billing status | Yes |

## 4.4 Permission Constants

```ts
export const PERMISSIONS = {
  DASHBOARD_VIEW: 'dashboard.view',

  CORE_VALUES_VIEW: 'core_values.view',
  CORE_VALUES_MANAGE: 'core_values.manage',

  QUESTIONS_VIEW: 'questions.view',
  QUESTIONS_MANAGE: 'questions.manage',

  MEMBERS_VIEW: 'members.view',
  MEMBERS_INVITE: 'members.invite',
  MEMBERS_MANAGE: 'members.manage',
  MEMBERS_MANAGE_ROLES: 'members.manage_roles',

  TEAMS_VIEW: 'teams.view',
  TEAMS_MANAGE: 'teams.manage',

  CHALLENGE_START: 'challenge.start',
  CHALLENGE_REROLL: 'challenge.reroll',
  CHALLENGE_ANSWER: 'challenge.answer',
  CHALLENGE_SCORE: 'challenge.score',
  CHALLENGE_EDIT_SCORED: 'challenge.edit_scored',
  CHALLENGE_CANCEL: 'challenge.cancel',

  HISTORY_VIEW_ALL: 'history.view_all',
  HISTORY_VIEW_OWN: 'history.view_own',

  LEADERBOARD_VIEW: 'leaderboard.view',

  INSIGHTS_VIEW: 'insights.view',

  REPORT_EXPORT: 'report.export',

  AUDIT_VIEW: 'audit.view',

  ORG_SETTINGS_MANAGE: 'org_settings.manage',
  BILLING_MANAGE: 'billing.manage',
  ORG_DELETE: 'organization.delete',
} as const;
```

## 4.5 Role Permission Mapping

```ts
export const ROLE_PERMISSIONS = {
  owner: Object.values(PERMISSIONS),

  admin: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.CORE_VALUES_VIEW,
    PERMISSIONS.CORE_VALUES_MANAGE,
    PERMISSIONS.QUESTIONS_VIEW,
    PERMISSIONS.QUESTIONS_MANAGE,
    PERMISSIONS.MEMBERS_VIEW,
    PERMISSIONS.MEMBERS_INVITE,
    PERMISSIONS.MEMBERS_MANAGE,
    PERMISSIONS.MEMBERS_MANAGE_ROLES,
    PERMISSIONS.TEAMS_VIEW,
    PERMISSIONS.TEAMS_MANAGE,
    PERMISSIONS.CHALLENGE_START,
    PERMISSIONS.CHALLENGE_REROLL,
    PERMISSIONS.CHALLENGE_ANSWER,
    PERMISSIONS.CHALLENGE_SCORE,
    PERMISSIONS.CHALLENGE_EDIT_SCORED,
    PERMISSIONS.CHALLENGE_CANCEL,
    PERMISSIONS.HISTORY_VIEW_ALL,
    PERMISSIONS.HISTORY_VIEW_OWN,
    PERMISSIONS.LEADERBOARD_VIEW,
    PERMISSIONS.INSIGHTS_VIEW,
    PERMISSIONS.REPORT_EXPORT,
    PERMISSIONS.AUDIT_VIEW,
    PERMISSIONS.ORG_SETTINGS_MANAGE,
  ],

  facilitator: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.CORE_VALUES_VIEW,
    PERMISSIONS.QUESTIONS_VIEW,
    PERMISSIONS.MEMBERS_VIEW,
    PERMISSIONS.CHALLENGE_START,
    PERMISSIONS.CHALLENGE_REROLL,
    PERMISSIONS.CHALLENGE_ANSWER,
    PERMISSIONS.CHALLENGE_SCORE,
    PERMISSIONS.HISTORY_VIEW_ALL,
    PERMISSIONS.HISTORY_VIEW_OWN,
    PERMISSIONS.LEADERBOARD_VIEW,
    PERMISSIONS.INSIGHTS_VIEW,
    PERMISSIONS.REPORT_EXPORT,
  ],

  member: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.CORE_VALUES_VIEW,
    PERMISSIONS.HISTORY_VIEW_OWN,
    PERMISSIONS.LEADERBOARD_VIEW,
  ],

  viewer: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.CORE_VALUES_VIEW,
    PERMISSIONS.QUESTIONS_VIEW,
    PERMISSIONS.MEMBERS_VIEW,
    PERMISSIONS.HISTORY_VIEW_ALL,
    PERMISSIONS.HISTORY_VIEW_OWN,
    PERMISSIONS.LEADERBOARD_VIEW,
    PERMISSIONS.INSIGHTS_VIEW,
    PERMISSIONS.REPORT_EXPORT,
  ],
} as const;
```

---


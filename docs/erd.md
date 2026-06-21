# 2. SaaS Data Model & ERD

## 2.1 Multi-Tenant Data Rules

All tenant-owned tables must include:

```text
organization_id text not null
```

Tenant-owned tables:

- organization_members
- teams
- team_members
- core_values
- questions
- challenge_sessions
- audit_logs
- organization_settings
- invitations

Global/platform tables:

- users
- organizations
- plans
- subscriptions
- value_templates
- value_template_items
- question_template_items

Notes:

- Users and organizations are many-to-many through `organization_members`.
- Each organization may have only one active owner row in `organization_members`.

## 2.2 Mermaid ERD

```mermaid
erDiagram
    users ||--o{ organization_members : joins
    users ||--o{ auth_sessions : authenticates
    organizations ||--o{ organization_members : has
    organizations ||--o{ teams : has
    organizations ||--o{ core_values : owns
    organizations ||--o{ questions : owns
    organizations ||--o{ challenge_sessions : owns
    organizations ||--o{ invitations : has
    organizations ||--o{ audit_logs : has
    organizations ||--o{ organization_settings : has
    organizations ||--o| subscriptions : subscribes

    plans ||--o{ subscriptions : used_by

    organization_members ||--o{ team_members : assigned
    teams ||--o{ team_members : has

    core_values ||--o{ questions : has
    core_values ||--o{ challenge_sessions : selected_in
    questions ||--o{ challenge_sessions : asked_in

    organization_members ||--o{ challenge_sessions : selected_member
    organization_members ||--o{ challenge_sessions : evaluator_member
    users ||--o{ audit_logs : actor

    value_templates ||--o{ value_template_items : contains
    value_template_items ||--o{ question_template_items : contains

    users {
        text id PK
        text full_name
        text email
        text password_hash
        text email_verified_at
        text avatar_url
        text platform_role
        text created_at
        text updated_at
    }

    auth_sessions {
        text id PK
        text user_id FK
        text token_hash
        text expires_at
        text last_seen_at
        text revoked_at
        text created_at
    }

    organizations {
        text id PK
        text name
        text slug
        text logo_r2_key
        text timezone
        text default_locale
        text status
        text created_at
        text updated_at
    }

    organization_members {
        text id PK
        text organization_id FK
        text user_id FK
        text role
        text status
        text joined_at
        text created_at
        text updated_at
    }

    teams {
        text id PK
        text organization_id FK
        text name
        text description
        integer_bool is_active
        text created_at
        text updated_at
    }

    team_members {
        text id PK
        text organization_id FK
        text team_id FK
        text organization_member_id FK
        text created_at
    }

    core_values {
        text id PK
        text organization_id FK
        text name
        text short_description
        text description
        text_json expected_behaviors
        text_json anti_patterns
        text example
        text color
        text icon_name
        int sort_order
        integer_bool is_active
        text created_at
        text updated_at
    }

    questions {
        text id PK
        text organization_id FK
        text core_value_id FK
        text question_text
        text difficulty
        text suggested_rubric_note
        integer_bool is_active
        text created_by_member_id FK
        text created_at
        text updated_at
    }

    challenge_sessions {
        text id PK
        text organization_id FK
        text session_date
        int sequence_no
        int round_no
        text selected_member_id FK
        text core_value_id FK
        text question_id FK
        text answer_text
        text answered_at
        int score
        text evaluator_member_id FK
        text evaluator_note
        text status
        int reroll_count
        text created_by_member_id FK
        text created_at
        text updated_at
    }

    invitations {
        text id PK
        text organization_id FK
        text email
        text role
        text token_hash
        text status
        text expires_at
        text invited_by_member_id FK
        text created_at
    }

    audit_logs {
        text id PK
        text organization_id FK
        text actor_user_id FK
        text actor_member_id FK
        text action
        text entity_type
        text entity_id
        text_json before_value
        text_json after_value
        text created_at
    }

    organization_settings {
        text organization_id PK
        text_json settings
        text updated_at
    }

    plans {
        text id PK
        text code
        text name
        text_json limits
        text_json features
        integer_bool is_active
        text created_at
    }

    subscriptions {
        text id PK
        text organization_id FK
        text plan_id FK
        text status
        text billing_provider
        text external_customer_id
        text external_subscription_id
        text current_period_start
        text current_period_end
        text created_at
        text updated_at
    }

    value_templates {
        text id PK
        text code
        text name
        text description
        integer_bool is_active
        text created_at
    }

    value_template_items {
        text id PK
        text template_id FK
        text name
        text short_description
        text description
        text_json expected_behaviors
        text_json anti_patterns
        text example
        text color
        text icon_name
        int sort_order
    }

    question_template_items {
        text id PK
        text value_template_item_id FK
        text question_text
        text difficulty
        text suggested_rubric_note
    }
```

---

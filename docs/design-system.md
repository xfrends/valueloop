# 6. Design System

## 6.1 Brand Direction

ValueLoop should feel:

- Clear
- Practical
- Professional
- Friendly
- Modern
- Trustworthy
- Suitable for meeting rooms

Avoid:

- Too playful
- Too enterprise-heavy
- Too HR-bureaucratic
- Too many gradients
- Hardcoded colors per specific company values

## 6.2 Brand Voice

Tone:

- Clear
- Direct
- Helpful
- Warm but not childish

Example copy:

```text
Ubah core values menjadi kebiasaan kerja harian.
```

```text
Mulai challenge hari ini.
```

```text
Jawaban bagus bukan yang panjang, tapi yang jelas dan bisa diterapkan.
```

## 6.3 Design Tokens

```css
:root {
  --vl-background: #F6F8FB;
  --vl-surface: #FFFFFF;
  --vl-surface-soft: #EEF4FF;

  --vl-primary: #1D4ED8;
  --vl-primary-hover: #1E40AF;
  --vl-primary-soft: #DBEAFE;

  --vl-secondary: #0F172A;
  --vl-accent: #14B8A6;

  --vl-text: #0F172A;
  --vl-text-muted: #64748B;
  --vl-border: #DCE4F0;

  --vl-success: #16A34A;
  --vl-warning: #F59E0B;
  --vl-danger: #DC2626;
  --vl-info: #0284C7;
}
```

## 6.4 Dynamic Core Value Colors

Core value colors are configurable per organization.

Rules:

- Store value color as hex string in `core_values.color`.
- UI must render value color dynamically.
- Do not hardcode Good Product/Good Attitude colors in SaaS core UI.
- Templates may provide default colors, but organizations can edit them.

Recommended default palette:

```ts
export const DEFAULT_VALUE_PALETTE = [
  '#2563EB',
  '#16A34A',
  '#0891B2',
  '#7C3AED',
  '#EA580C',
  '#DB2777',
  '#475569',
  '#CA8A04',
];
```

## 6.5 Typography

Recommended:

- Inter
- System UI fallback

Type scale:

| Token | Size | Usage |
|---|---:|---|
| text-xs | 12px | Labels |
| text-sm | 14px | Small body |
| text-base | 16px | Body |
| text-lg | 18px | Card title |
| text-xl | 20px | Section title |
| text-2xl | 24px | Page title |
| text-3xl | 30px | Hero title |
| text-4xl | 36px | Meeting challenge title |

## 6.6 Layout

### App Shell

- Left sidebar for main navigation.
- Top header for organization switcher and user menu.
- Main content max width: 1280px.
- Challenge page can use wider meeting display layout.

Sidebar menu:

```text
Dashboard
Core Values
Daily Challenge
Leaderboard
History
Insights
Members
Teams
Questions
Settings
Billing
```

Visibility depends on role.

## 6.7 Components

### Button

Variants:

- Primary
- Secondary
- Outline
- Ghost
- Danger

Primary actions:

- Create Organization
- Start Challenge
- Submit Answer
- Submit Score
- Invite Member

### Card

Used for:

- Core value cards
- Challenge panels
- Metric cards
- Leaderboard cards
- Empty states

Style:

```text
Background: white
Border: 1px solid var(--vl-border)
Radius: 16px
Padding: 24px
Shadow: subtle
```

### Badge

Used for:

- Role
- Status
- Difficulty
- Core value label

Status mapping:

| Status | Color |
|---|---|
| open | blue |
| answered | amber |
| scored | green |
| cancelled | red |
| inactive | gray |

### Score Indicator

| Score | Label |
|---:|---|
| 0–2 | Perlu banyak perbaikan |
| 3–4 | Masih kurang |
| 5–6 | Cukup |
| 7–8 | Baik |
| 9–10 | Sangat baik |

---


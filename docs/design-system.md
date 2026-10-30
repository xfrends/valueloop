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

Visual direction: monochrome ink on white and warm paper, oversized display headings with tight tracking, pill-shaped actions, flat cards with hairline borders, and dark grain surfaces for hero/footer moments.

```css
:root {
  --vl-background: #F9F9F9;
  --vl-surface: #FFFFFF;
  --vl-surface-soft: #F4F5F0; /* warm paper */

  --vl-primary: #111111;      /* ink */
  --vl-primary-hover: #000000;
  --vl-primary-soft: #F4F5F0;

  --vl-secondary: #111111;
  --vl-accent: #10B981;

  --vl-text: #111111;
  --vl-text-muted: #666666;
  --vl-text-subtle: #999999;
  --vl-border: #E5E5E5;

  --vl-success: #10B981;
  --vl-warning: #F59E0B;
  --vl-danger: #DC2626;
  --vl-info: #0284C7;
}
```

Implementation notes (`src/styles/global.css`):

- Tailwind `slate-*` is remapped to the neutral scale above and `indigo-*` to the ink accent, so existing utility classes inherit the system.
- Font weights are lightened (`semibold` 550, `bold`/`extrabold` 600); hierarchy comes from size and tracking.
- Primary actions (`bg-indigo-600`, `bg-slate-900` links/buttons) render as pills.
- `.grain` adds film-grain texture to dark surfaces.

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

- Geist (Google Fonts) for UI and display
- Geist Mono for kicker labels and metadata
- System UI fallback

Display headings use `font-medium` (or `font-normal` for hero), `tracking-tighter`, and tight leading (`0.9`–`1.05`).

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
Shadow: none or very soft; rely on the hairline border
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


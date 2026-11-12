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

Visual direction: espresso ink on warm cream, emerald pill actions with white text, oversized display headings with tight tracking, flat off-white cards with hairline borders, and deep espresso grain surfaces for hero/footer moments.

```css
:root {
  --vl-background: #EBE2D5;   /* warm cream page */
  --vl-surface: #FAF6EF;      /* off-white cards */
  --vl-surface-soft: #F3ECE1;

  --vl-primary: #0C7C62;      /* emerald, paired with white text */
  --vl-primary-hover: #0A6B54;
  --vl-primary-soft: #E7F4EF;

  --vl-secondary: #352015;    /* espresso ink */
  --vl-accent: #0C7C62;

  --vl-text: #352015;
  --vl-text-muted: #7A685B;
  --vl-text-subtle: #A39384;
  --vl-border: #DDD3C4;

  --vl-success: #10B981;
  --vl-warning: #F59E0B;
  --vl-danger: #DC2626;
  --vl-info: #0284C7;
}
```

Implementation notes (`src/styles/global.css`):

- Tailwind `slate-*` is remapped to the cream-to-espresso neutral scale, `white` to the off-white surface, and `indigo-*` to emerald tints (50–500) with espresso ink from 600 up, so existing utility classes inherit the system.
- Font weights are lightened (`semibold` 550, `bold`/`extrabold` 600); hierarchy comes from size and tracking.
- Primary actions (`bg-indigo-600`, `bg-slate-900`, `bg-[#352015]` links/buttons) render as emerald pills with white text.
- The logged-in app (`html.app-shell`, set in `AppLayout`) is brighter than the public pages: pure white cards on a soft warm page (`#F6F3EE`), and `indigo-600+` becomes emerald ink for labels and links. The sidebar keeps the cream wall colour. Public pages keep the cream surfaces.
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


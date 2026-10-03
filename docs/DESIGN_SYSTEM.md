# Design System — Glacier Slate Glass

One premium glass workspace language across all 30 routes and 5 roles. The
single source of truth is the `@theme` block in `school-os/src/glass.css`;
no hex values exist anywhere else in the frontend, so the whole product
re-themes from that one block.

## Palette

| Token | Value | Use |
|---|---|---|
| `--color-alice-blue` | `#F0F7F8` | page base, ice-white |
| `--color-lavender` | `#E0FBFC` | light cyan surfaces |
| `--color-lavender-2` | `#CFEFF3` | hover washes |
| `--color-periwinkle` | `#C2DFE3` | light blue fills |
| `--color-periwinkle-2` | `#AED4DA` | borders, dividers |
| `--color-periwinkle-3` | `#9DB4C0` | steel accents |
| `--color-baby-blue-ice` | `#7CA3B2` | deepest accent, live dots |
| `--color-text-primary` | `#253237` | headings, body |
| `--color-text-secondary` | `#5C6B73` | secondary text |
| `--color-text-muted` | `#75868E` | captions, mono meta |
| `--color-text-disabled` | `#9DB4C0` | disabled |
| `--color-shadow-blue` | `#253237` | shadow anchor (deep slate) |
| `--color-success/warning/error` | `#3a7350/#7f652b/#a34d4d` | restrained semantic accents |

Token names are legacy; values are the palette. Semantic colors stay
secondary to the monochrome system (badges, dots, small labels — never
large fills).

## Principles

- **Atmospheric cyan/blue background**: layered radial gradients over the
  ice base, one ambient light source from the upper-left shared by every
  surface (`GlassDefs` SVG filters).
- **Frosted glass surfaces**: `GlassSurface` variants (`primary/secondary`)
  with backdrop blur, inner top-light (`--shadow-line`) and slate contact
  shadows — never flat cards, never solid fills.
- **Rounded architecture**: `--radius-glass: 28px` cards, `--radius-panel:
  20px` panels, `--radius-control: 10px` controls.
- **Cool blue-gray type**: Plus Jakarta Sans (display), Inter (UI),
  JetBrains Mono (ids, timestamps, code, meta).
- **File-tree navigation**: the sidebar renders the product as a navigable
  tree grouped by domain, with per-role pruning.
- **Purposeful motion only**: `fade-up` page entry, `fade-in`/`scale-in`
  overlays, `slide-in-right` drawers — one curve (`cubic-bezier(0.22, 1,
  0.36, 1)`), no decorative animation.

## Components (`src/components/glass.tsx`)

Surfaces: `GlassCard` (`hover`, `pad`), `GlassPanel`, `GlassDrawer`,
`GlassPopover`, `GlassModal`. Inputs: `GlassButton`
(`primary/ghost`, sizes), `GlassInput` (icon), `GlassSelect`,
`GlassTextarea`, `FieldLabel`. Data: `MetricCard`, `DataTable`,
`StatusBadge` (tone-mapped), `Avatar` (initials), `ChartCard`, `Tabs`.
Feedback: `EmptyState`, `ErrorState` (retry), `LoadingCards`
(skeleton), `FileUploader`, `SectionHead`. Overlays: `Modal`, `Drawer`
(both `role="dialog"`, labelled close buttons).

## Page contract (every route)

- **Loading**: `LoadingCards` skeletons, never blank screens or spinners
  alone.
- **Empty**: `EmptyState` with a next action ("No runs yet — press Run…").
- **Error**: `ErrorState` with retry; destructive failures surface via
  toast + inline copy, never silent.
- **Success**: toasts (`useApp().pushToast`) plus inline state change.

## Forms

`FieldLabel` + glass inputs, inline errors under the field, submit disabled
until valid, loading label on submit while pending (see E-Lab Run/Submit,
Connect modals). Destructive operations require `Modal` confirmation.

## Tables

`DataTable` provides search (placeholder + `aria-label`), sortable columns
(`sortValue`), client pagination, loading skeletons and empty states.
Server-paged lists mirror the same chrome with the API `Page` envelope.

## Accessibility

- Landmarks and labels: `role="tablist/tab"`, `role="dialog"` + `aria-modal`,
  `aria-label` on icon-only buttons, `aria-live="polite"` on live regions
  (E-Lab console, presence islands).
- Decorative SVG is `aria-hidden`; status is never color-only (badges carry
  text, tables carry labels).
- Keyboard: tab-reachable controls, visible focus via glass rings, ⌘/Ctrl+↵
  to run in E-Lab, Esc closes dialogs.
- Contrast: slate text on ice glass meets AA at all sizes; muted captions
  are never the sole carrier of meaning.

## Responsive

Mobile-first grids (`grid sm:grid-cols-4`), drawers replace side panels
under `sm`, tables scroll within cards, the code editor keeps 44px gutters
at all widths. Touch targets are ≥ 36px.

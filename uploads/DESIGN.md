---
name: Ethereal Glass Workspace
colors:
  surface: '#ebfdff'
  surface-dim: '#c2dfe3'
  surface-bright: '#ebfdff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#dcf9fd'
  surface-container: '#d6f3f7'
  surface-container-high: '#d0eef2'
  surface-container-highest: '#cbe8ec'
  on-surface: '#021f23'
  on-surface-variant: '#43474a'
  inverse-surface: '#193438'
  inverse-on-surface: '#d9f6fa'
  outline: '#73787a'
  outline-variant: '#c3c7c9'
  surface-tint: '#536066'
  primary: '#101d22'
  on-primary: '#ffffff'
  primary-container: '#253237'
  on-primary-container: '#8c9aa0'
  inverse-primary: '#bbc9cf'
  secondary: '#526168'
  on-secondary: '#ffffff'
  secondary-container: '#d2e2eb'
  on-secondary-container: '#56656d'
  tertiary: '#061e27'
  on-tertiary: '#ffffff'
  tertiary-container: '#1d333d'
  on-tertiary-container: '#859ba7'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d7e5eb'
  primary-fixed-dim: '#bbc9cf'
  on-primary-fixed: '#101d22'
  on-primary-fixed-variant: '#3c494e'
  secondary-fixed: '#d5e5ee'
  secondary-fixed-dim: '#b9c9d2'
  on-secondary-fixed: '#0f1d24'
  on-secondary-fixed-variant: '#3a4950'
  tertiary-fixed: '#cfe6f3'
  tertiary-fixed-dim: '#b3cad6'
  on-tertiary-fixed: '#061e27'
  on-tertiary-fixed-variant: '#344a54'
  background: '#ebfdff'
  on-background: '#021f23'
  surface-variant: '#cbe8ec'
typography:
  headline-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.015em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.015em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 30px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.005em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  body-xs:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 16px
  data-lg:
    fontFamily: JetBrains Mono
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.02em
  data-md:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: -0.01em
  data-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.25rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-desktop: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.25rem
---

## Brand & Style

This design system establishes an ethereal, hyper-focused administrative workspace engineered for high-density academic management. It balances ambient visual calm with razor-sharp data legibility, rejecting bloated corporate aesthetics in favor of a crisp glassmorphic spatial hierarchy. 

The emotional tone is quiet, authoritative, and frictionless. School administrators, registrars, and department heads manage complex student rosters, grading curves, and institutional analytics against luminous translucent planes that reduce cognitive fatigue across prolonged desktop sessions. 

Visual characteristics include:
- **Luminous Frosted Panes:** Multi-layered translucent panels featuring fine directional backdrops and specular perimeter lines.
- **Architectural Precision:** Strict typographic contrast and deliberate grid rhythms replace garish primary accents.
- **Atmospheric Depth:** Layered structural fields floating subtly above an ethereal light-cyan to pale-blue atmospheric field.

## Colors

The palette is tuned specifically for light-mode precision, ensuring all informational hierarchies meet strict WCAG AAA and AA contrast ratios against light-refracting surfaces.

- **Primary (`#253237` - Jet Black):** The visual anchor of the interface. Used for primary headlines, structural text, data metrics, and high-impact active states. It delivers immediate clarity without the harshness of pure `#000000`.
- **Secondary (`#5c6b73` - Blue Slate):** The secondary typographic layer and system status tone. Applied to metadata, table column headers, breadcrumb links, and inactive state icons. Achieves full WCAG AA compliance against frosted backdrops.
- **Tertiary (`#9db4c0` - Cool Steel):** Used for micro-borders, divider lines, secondary badges, and subtle hover halos. Provides structural definition to translucent surfaces without creating harsh visual cages.
- **Neutral (`#c2dfe3` - Light Blue) & Canvas Tint (`#e0fbfc` - Light Cyan):** Form the canvas foundation. The desktop viewport employs a slow, multi-stop directional mesh gradient moving from `#e0fbfc` to `#c2dfe3`, providing refraction data for surface blurs.

### Surface System
- **Canvas Base:** Linear gradient at 135deg from `#e0fbfc` (0%) to `#c2dfe3` (100%).
- **Glass Base (Level 1):** `rgba(255, 255, 255, 0.65)` with `backdrop-filter: blur(16px)` and a continuous inset line of `rgba(255, 255, 255, 0.8)`.
- **Glass Floating (Level 2):** `rgba(255, 255, 255, 0.82)` with `backdrop-filter: blur(24px)`.
- **Glass Interactive (Level 3):** `rgba(255, 255, 255, 0.95)` with `backdrop-filter: blur(32px)`.

## Typography

The typographic hierarchy implements three distinct type families to organize cognitive load:

1. **Plus Jakarta Sans (Headings & Metric Displays):** Provides warm geometric structure for dashboard titles, grade averages, student counts, and major modal headings.
2. **Inter (Body & Controls):** Delivers neutral, highly legible micro-textures across dense forms, table cells, and instructional content.
3. **JetBrains Mono (System Items & Codes):** Assigned strictly to student IDs, course registration codes, grading scales, file directory hierarchies, and numerical table ledgers.

Tabular figures (`font-variant-numeric: tabular-nums`) must be enabled globally across all numeric indicators within tables and analytic cards.

## Layout & Spacing

The workspace uses a full-viewport administrative shell designed to maximize usable area while maintaining breathable air pockets.

### Layout Philosophy
- **Desktop Grid:** A 12-column dynamic fluid layout pinned by a fixed 260px administrative navigation sidebar. The main content zone utilizes fluid columns with `1.5rem` gutters and a `2rem` outer margin.
- **Tablet / Split View (768px - 1024px):** Sidebar collapses to an 80px icon navigation rail. Grid shifts to 8 columns with `1.25rem` gutters and `1.25rem` canvas margins.
- **Mobile (< 768px):** Single-column stacked workflow with an overlay navigation drawer and `1rem` outer canvas padding.

### Spacing Scale
- `space-xs` (4px): Micro-gaps between status badges, checkbox labels, and tree toggle carats.
- `space-sm` (8px): Form input inner paddings, list item row gaps, chip horizontal paddings.
- `space-md` (16px): Standard cell spacing, card container padding, component internal flow gaps.
- `space-lg` (24px): Structural gaps between card modules, dashboard widget headers, and table headers.
- `space-xl` (36px): Primary section divisions and view header vertical separation.

## Elevation & Depth

Depth is established through progressive transparency, backdrop diffusion, and ambient edge lighting rather than muddy drop shadows.

### Elevation Architecture
- **Layer 0 (Background):** Base light cyan/blue canvas with subtle radial light pools.
- **Layer 1 (Workspace Panels):** Main table containers, file trees, and sidebar panels. Formed using `rgba(255, 255, 255, 0.65)`, blurred at `16px`. Outlined with a 1px border of `rgba(157, 180, 192, 0.45)`.
- **Layer 2 (Overlays & Cards):** Hovered data rows, floating action bars, contextual cards. Styled with `rgba(255, 255, 255, 0.85)`, blurred at `24px`. Shadow is ambient: `0 8px 32px -4px rgba(37, 50, 55, 0.06), 0 0 1px 1px rgba(255, 255, 255, 0.9) inset`.
- **Layer 3 (Modals & Flyouts):** Grade adjustment sheets, command palettes, dropdown selectors. Styled with `rgba(255, 255, 255, 0.95)`, blurred at `32px`. Edge treatment: `0 20px 48px -8px rgba(37, 50, 55, 0.12), 0 0 0 1px rgba(157, 180, 192, 0.6)`.

Avoid high-opacity dark cast shadows; depth must always feel optical and translucent.

## Shapes

The interface embraces a balanced curvature model (`roundedness: 2`), yielding crisp geometry softened by precise radius tokens:
- Standard control elements, inputs, and chips utilize `0.5rem` (8px) corners.
- Major panels, tables, and modal frames use `1rem` (16px).
- Large dashboard summary containers feature `1.5rem` (24px).
- Status tags and badge pills remain fully circular with `9999px` geometry.

All rounded containers that clip frosted elements must retain explicit `overflow: hidden` to prevent blur-leak artifacting at boundary edges.

## Components

### Buttons
- **Primary:** Background of solid `#253237`, text in `#FFFFFF`, with `0.5rem` border radius. On hover: shifts to `rgba(37, 50, 55, 0.88)` with a `0 4px 12px rgba(37, 50, 55, 0.18)` lift.
- **Secondary (Glass):** Background of `rgba(255, 255, 255, 0.7)`, border of `1px solid #9db4c0`, text in `#253237`. On hover: `rgba(255, 255, 255, 0.95)`.
- **Tertiary / Ghost:** No border or background; text in `#5c6b73`. On hover: text transitions to `#253237` with an ambient background plate of `rgba(255, 255, 255, 0.4)`.

### Inputs & Form Fields
- Fields are built with a `rgba(255, 255, 255, 0.6)` fill and `1px solid rgba(157, 180, 192, 0.6)` perimeter.
- Focus state: Surface turns pure `rgba(255, 255, 255, 0.95)`, border transitions to `#253237` (1.5px), accompanied by a diffuse outer ring of `0 0 0 3px rgba(157, 180, 192, 0.35)`.
- Placeholder text is set in `#5c6b73` at 70% opacity.

### Selection Controls (Checkboxes & Radios)
- Inactive: Frame of `1.5px solid #9db4c0`, background `rgba(255, 255, 255, 0.5)`.
- Checked: Solid `#253237` fill with crisp `#FFFFFF` iconography. Radios feature a 4px inset white core.

### Chips & Badges
- **Status Badges:** Fully rounded (`rounded-full`), padded with `0.25rem 0.625rem`. Neutral active states use `rgba(157, 180, 192, 0.25)` fill with `#253237` text and a fine border of `rgba(92, 107, 115, 0.2)`.
- **Interactive Filter Chips:** Semi-translucent glass tags that turn `#253237` with white text when selected.

### Data Tables & Lists
- Table wrapper uses Glass Level 1 with full row striping using subtle alternations: odd rows transparent, even rows `rgba(255, 255, 255, 0.25)`.
- Header row is sticky, rendered in `#5c6b73` (`body-xs`, uppercase, tracking `+0.05em`) with a bottom edge of `1px solid rgba(157, 180, 192, 0.5)`.
- Row hover triggers an immediate soft glow: `rgba(255, 255, 255, 0.75)`.

### Domain-Specific: Academic File Tree & Record Ledgers
- Tree nodes use **JetBrains Mono** (`data-sm`). Folder carats and document icons are rendered in `#5c6b73`.
- Selected student files apply a glowing glass active badge: `background: rgba(255, 255, 255, 0.9)`, border `1px solid #9db4c0`, text `#253237` with a vertical 2px indicator bar of `#253237` pinned to the left edge.
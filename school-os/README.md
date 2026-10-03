# Northview · School OS

A premium glass-workspace School Management SaaS frontend — React + TypeScript + Tailwind CSS v4 + Recharts.
Every login constructs its own **role-specific workspace**: purpose-built Overview, generated navigation,
scoped data and permission-aware actions. No two roles share an Overview.

## Run

```bash
cd school-os
npm install
npm run dev      # http://localhost:5173
npm run build    # production build → dist/
```

Use **Log in as** in the sidebar to switch roles: Super Admin · School Admin · Teacher · Student · Parent.

### Progressive Web App

Production builds (`npm run build` + serve `dist/` over HTTPS) are installable:
`public/manifest.webmanifest` + `public/icons/` (192/512, any maskable) + `public/sw.js`
(app-shell + hashed-asset caching; Supabase, `/api/*` and non-GET traffic always
bypass the cache — see the header comment in `sw.js`). The worker registers in
production only, so `npm run dev` keeps HMR cache-free. The header shows an
**Install School OS** button only while the browser holds a deferred install
prompt; standalone/mobile get safe-area-aware chrome and an offline pill.

### Digital ID cards + QR verification

Student, faculty and staff profiles render as institutional ID cards
(`src/components/idcard.tsx`, canonical data only). Each card carries a QR
encoding an opaque `/verify/<token>` credential — never profile fields.
Live credentials live in Supabase `id_tokens` (`supabase/idverify.sql`;
admin-managed, holder-readable, publicly resolved only through the
`verify_id_token()` RPC's safe projection); without Supabase, deterministic
demo credentials resolve locally. Scanning opens the public verification
page (no login; hosting must fall back `/verify/*` to `index.html`).
Regenerating (admin, `idcard.manage`) rotates the credential and revokes
older QR codes. Cards export to PNG (canvas redraw) and a CR80 print layout.

### Presence islands — temporary demo feed

Until Supabase is configured, the Overview presence islands stream example
data from the FastAPI demo feed (`/api/v1/demo-feed/*`, local SQLite —
see `school-api/app/models/demo_feed.py`), badged **Demo** instead of Live:

1. Start the API with demo data: `cd ../school-api && python -m alembic upgrade head && python -m app.seed`.
2. Open an Overview, click **Connect** on an island, and sign in:
   `admin@northview.edu` / `Password123` (faculty + staff islands),
   `rohan@northview.edu` / `Password123` (student island, Grade 10-B only).
3. Set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (see `.env.example`
   and `supabase/README.md`) to switch the islands to the live feed.

No login handy? Every island, detail view, connect dialog, the admin
Attendance page and the overview attendance card offer **Load demo data**
below the connect option — synthetic example data generated in the browser,
no backend needed. **Exit demo** returns to the real feed state.

## Role workspaces

| Role | Overview | Navigation |
|---|---|---|
| Super Admin | **Platform Overview** — schools, users, MRR, tenant health, flags, audit | Schools · Tenants · Users · Subscriptions · Feature Flags · Platform Analytics · Audit Logs · System Settings |
| School Admin | **School Overview** — enrolment, attendance, fees, events, activity | Students ▸ Directory/Admissions/Performance · Teachers ▸ Faculty/Staff · Parents · Classes ▸ Classes/Subjects · Attendance · Assignments ▸ Assignments/Submissions/Grades · Timetable · Leave · Flags · Notifications · Files · E-Lab · Settings |
| Teacher | **Teaching Overview** — my classes, today's periods, registers, grading queue | My Classes · Students (assigned, read-only) · Attendance · Assignments ▸ · Timetable (own periods) · Leave · E-Lab · Notifications · Files |
| Student | **My Overview** — today's classes, pending work, grades, feedback, E-Lab | My Classes · Assignments ▸ (own work) · Attendance (personal) · Leave · Timetable · Files · E-Lab · Notifications |
| Parent | **Family Overview** — child switcher, schedule, attendance, grades, announcements | My Children · Attendance · Assignments · Grades · Timetable · Notifications · Files |

## Architecture

```
src/
  lib/
    permissions.ts  role → actions, routes, generated nav, overview meta, search index
    api.ts          authorized client (permission check first, scoped payload second) + useScopedQuery
    scoped.ts       object scopes: assigned classes, own class, linked children
    platform-data.ts tenant/billing/flag/audit datasets (super-admin)
    data.ts         school dataset (seeded, deterministic)
    leave.ts · leave-live.ts · leave-demo.ts  leave workflow: rules, live feed, example dataset
    flags.ts · flags-live.ts · flags-demo.ts  student notes & flags: rules, live feed, example dataset
    store.tsx       session: role, route, notifications (audience-scoped), toasts
  components/       glass kit (+ <Can> permission gate) · sidebar · topbar · overlays
  pages/
    dashboard.tsx   School Overview            overviews.tsx  Platform/Teaching/Student/Family
    platform.tsx    8 super-admin modules      my-classes.tsx · my-children.tsx
    students · teachers · classes · attendance · assignments · timetable · elab · files · notifications · settings · leave-management · student-flags
docs/RBAC.md        backend enforcement contract (the UI mirrors it; the server must enforce it)
```## Design system (Alice Blue monochrome · refractive glass)

Supplied palette — the single source of truth (no unrelated accents):

| Token | Hex | Role |
|---|---|---|
| `--color-alice-blue` | `#EDF2FB` | Canvas base, primary veils, sticky headers, tooltips |
| `--color-lavender` | `#E2EAFC` | Secondary glass, table headers, elevated veils |
| `--color-lavender-2` | `#D7E3FC` | Controls, hovers, table hover, toggle-off, day pills |
| `--color-periwinkle` | `#CCDBFD` | Selected washes, unread rows, live-row tint |
| `--color-periwinkle-2` | `#C1D3FE` | Nav active, borders, tracks, tertiary charts, tree bar |
| `--color-periwinkle-3` | `#B6CCFE` | Primary buttons, selected pills, progress, focus rings |
| `--color-baby-blue-ice` | `#ABC4FF` | Button hover, indicators, chart hero, LIVE badge |
| `--color-text-primary` | `#182033` | Body text, headings (14.2:1 on glass) |
| `--color-text-secondary` | `#34405A` | Secondary text (9.1:1) |
| `--color-text-muted` | `#596780` | Hints, placeholders, dims (5.0:1) |

Shadows use `rgb(71 88 120)` (the spec's shadow-blue tone) at every elevation.
Semantic colors are restrained dark variants for the light ground: success
`#3a7350`, warning `#7f652b`, error `#a34d4d` — always dark text on a white/30
wash with a matching border, so badges hold ≥4.8:1. Info is icon-accent
`#7182a8`; stars follow it.

Contrast engineering (verified luminances): pale-on-pale is banned everywhere —
text-bearing surfaces pair dark neutrals against alice/white wells, and
selected pills are solid periwinkle-3 + primary text at 10.1:1. Documented
deviations from the literal spec, all forced by readability math: semantic
badges use white/30 wells instead of same-hue washes (which fail at ~4.3:1);
the lab editor is a light panel, not dark glass; focus rings render at /50 for
button visibility; hovers wash lavender-2/70 instead of darkening.

GlassSurface optics are preserved, not replaced: GPU displacement +
per-channel dispersion (`#glass-*` SVG filters, displace 0.5,
distortionScale −180, brightness ~50, screen blend) under LIGHT veils
(primary alice/80, secondary lavender/68, floating and controls
lavender-2/60, elevated lavender/72), refractive rims, tablet
(`#glass-soft`) / mobile (grounded + blur) / reduced-motion (static
refraction) paths intact. Charts distinguish series by lightness only
(baby → periwinkle-3 → periwinkle-2). All five role dashboards keep
their IA and permissions; only the color system changed.

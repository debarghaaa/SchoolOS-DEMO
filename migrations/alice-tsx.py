"""Alice Blue migration: all .tsx + index.html (Frosted Mint -> Alice Blue/Lavender/Periwinkle).

Rules run in ORDER (targeted/contextual first, globals last). Every rule asserts
its expected total match count across all tsx files BEFORE anything is written.
Any mismatch aborts with leftovers printed and all files untouched.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path('/home/user/school-os')
FILES = sorted(ROOT.joinpath('src').rglob('*.tsx'))
texts = {p: p.read_text() for p in FILES}
fails = []


def rep(old, new, expect, tag):
    total = sum(t.count(old) for t in texts.values())
    print(f'{tag}: found {total} (expect {expect})')
    if expect is not None and total != expect:
        fails.append(f'{tag}: expect {expect}, found {total}')
        return
    for p in texts:
        if old in texts[p]:
            texts[p] = texts[p].replace(old, new)


# ============ BADGE table (glass.tsx) ============
rep('bg-tea-green/8 text-frosted-mint border-tea-green/35',
    'bg-white/30 text-success border-success/40', 6, 'BADGE-6')
rep('bg-warning/15 text-frosted-mint border-warning/35',
    'bg-white/30 text-warning border-warning/40', 5, 'BADGE-5')
rep('bg-error/18 text-frosted-mint border-error/40',
    'bg-white/30 text-error border-error/40', 4, 'BADGE-4')
rep("active: 'bg-frosted-mint/5 text-frosted-mint border-frosted-mint/35',",
    "active: 'bg-periwinkle/50 text-text-primary border-periwinkle-3/50',", 1, 'BADGE-active')
rep("closed: 'bg-dusty-olive/10 text-tea-green/70 border-muted-olive/20',",
    "closed: 'bg-lavender/70 text-text-muted border-periwinkle-2/50',", 1, 'BADGE-closed')
rep("neutral: 'bg-dusty-olive/10 text-frosted-mint border-muted-olive/20',",
    "neutral: 'bg-lavender-2/60 text-text-secondary border-periwinkle-2/50',", 1, 'BADGE-neutral')

# ============ shared conditional branches (before bare-shared!) ============
rep("? o.v === 'present' ? 'bg-frosted-mint text-shadow-olive' : o.v === 'late' ? 'bg-warning text-shadow-olive' : 'bg-error text-shadow-olive'",
    "? 'bg-periwinkle-3 text-text-primary'", 1, 'SEG-115')
rep("v >= 85 ? 'bg-tea-green/8 text-frosted-mint' : v >= 70 ? 'bg-warning/15 text-frosted-mint border border-warning/35' : 'bg-error/18 text-frosted-mint'",
    "v >= 85 ? 'bg-white/30 text-success' : v >= 70 ? 'bg-white/30 text-warning border border-warning/40' : 'bg-white/30 text-error'", 1, 'TIERS')
rep('bg-error/18 text-frosted-mint', 'bg-white/30 text-error', 1, 'SHARE-err')
rep('bg-tea-green/8 text-frosted-mint', 'bg-white/30 text-success', 2, 'SHARE-tea')
rep('bg-warning/15 text-frosted-mint', 'bg-white/30 text-warning', 1, 'SHARE-warn')

# ============ stats ============
rep("{ l: 'Present', v: stats.present, tone: 'text-frosted-mint' },", "{ l: 'Present', v: stats.present, tone: 'text-success' },", 1, 'STAT-present')
rep("{ l: 'Late', v: stats.late, tone: 'text-frosted-mint' },", "{ l: 'Late', v: stats.late, tone: 'text-warning' },", 1, 'STAT-late')
rep("{ l: 'Absent', v: stats.absent, tone: 'text-frosted-mint' },", "{ l: 'Absent', v: stats.absent, tone: 'text-error' },", 1, 'STAT-absent')

# ============ KIND + LEG (timetable) ============
rep("lecture: { chip: 'bg-shadow-olive/10 border-muted-olive/50', bar: 'bg-frosted-mint', icon: <User size={11} /> },",
    "lecture: { chip: 'bg-white/35 border-periwinkle-2/50', bar: 'bg-baby-blue-ice', icon: <User size={11} /> },", 1, 'KIND-lecture')
rep("lab: { chip: 'bg-shadow-olive/10 border-muted-olive/40', bar: 'bg-muted-olive', icon: <FlaskConical size={11} /> },",
    "lab: { chip: 'bg-white/35 border-periwinkle-2/50', bar: 'bg-periwinkle-3', icon: <FlaskConical size={11} /> },", 1, 'KIND-lab')
rep("sports: { chip: 'bg-shadow-olive/10 border-tea-green/25', bar: 'bg-tea-green', icon: <Trophy size={11} /> },",
    "sports: { chip: 'bg-white/35 border-periwinkle-3/50', bar: 'bg-periwinkle-2', icon: <Trophy size={11} /> },", 1, 'KIND-sports')
rep("arts: { chip: 'bg-shadow-olive/10 border-muted-olive-2/35', bar: 'bg-palm-leaf', icon: <Palette size={11} /> },",
    "arts: { chip: 'bg-white/35 border-periwinkle-2/50', bar: 'bg-baby-blue-ice', icon: <Palette size={11} /> },", 1, 'KIND-arts')
rep("break: { chip: 'bg-transparent border-dashed border-muted-olive-2/40', bar: 'bg-muted-olive-2/30', icon: null },",
    "break: { chip: 'bg-transparent border-dashed border-periwinkle-2/50', bar: 'bg-periwinkle-2/40', icon: null },", 1, 'KIND-break')
rep("['Lecture', 'var(--color-frosted-mint)']", "['Lecture', 'var(--color-baby-blue-ice)']", 1, 'LEG-lecture')
rep("['Lab', 'var(--color-muted-olive)']", "['Lab', 'var(--color-periwinkle-3)']", 1, 'LEG-lab')
rep("['Sports', 'var(--color-tea-green)']", "['Sports', 'var(--color-periwinkle-2)']", 1, 'LEG-sports')
rep("['Arts', 'var(--color-palm-leaf)']", "['Arts', 'var(--color-baby-blue-ice)']", 1, 'LEG-arts')
rep("['Break', 'color-mix(in srgb, var(--color-muted-olive-2) 40%, transparent)']",
    "['Break', 'color-mix(in srgb, var(--color-periwinkle-2) 40%, transparent)']", 1, 'LEG-break')
rep('Mint · present — Amber · late — Olive · holiday — Grey · holiday', 'Blue · present — Periwinkle · late — Grey · holiday', 1, 'LEGCP')

# ============ chart constants + svg ============
rep("hi: 'var(--color-frosted-mint)'", "hi: 'var(--color-baby-blue-ice)'", 3, 'CH-hi')
rep("mid: 'var(--color-tea-green)'", "mid: 'var(--color-periwinkle-3)'", 3, 'CH-mid')
rep("low: 'var(--color-muted-olive)'", "low: 'var(--color-periwinkle-2)'", 3, 'CH-low')
rep('color-mix(in srgb, var(--color-muted-olive-2) 35%, transparent)', 'color-mix(in srgb, var(--color-periwinkle-3) 45%, transparent)', 15, 'GRID')
rep("fill: 'color-mix(in srgb, var(--color-frosted-mint) 50%, transparent)'",
    "fill: 'color-mix(in srgb, var(--color-periwinkle-3) 45%, transparent)'", 9, 'CURSOR')
rep('fill="var(--color-tea-green)"', 'fill="var(--color-periwinkle-3)"', 1, 'ATT160')
rep('fill="var(--color-frosted-mint)" fillOpacity={0.88}',
    'fill="var(--color-baby-blue-ice)" fillOpacity={0.88}', 2, 'FILL88')
rep('stopColor="var(--color-frosted-mint)" stopOpacity={0.3}',
    'stopColor="var(--color-baby-blue-ice)" stopOpacity={0.3}', 1, 'STOP30')
rep('stopColor="var(--color-frosted-mint)" stopOpacity={0}',
    'stopColor="var(--color-baby-blue-ice)" stopOpacity={0}', 1, 'STOP0')
rep('stroke="var(--color-frosted-mint)"', 'stroke="var(--color-baby-blue-ice)"', 2, 'STROKE')
rep('fill="var(--color-frosted-mint)"', 'fill="var(--color-text-primary)"', 1, 'OV374')
rep('fill="var(--color-muted-olive)"', 'fill="var(--color-periwinkle-2)"', 1, 'STU399')

# ============ brand / tabs / rail ============
rep("? 'bg-[linear-gradient(135deg,var(--color-frosted-mint),var(--color-tea-green))] text-shadow-olive shadow-tab'\n              : 'text-tea-green hover:bg-shadow-olive/20 hover:text-frosted-mint',",
    "? 'bg-periwinkle-2 text-text-primary shadow-tab'\n              : 'text-text-secondary hover:bg-lavender-2/70 hover:text-text-primary',", 1, 'TABS')
rep('place-items-center rounded-2xl bg-[linear-gradient(135deg,var(--color-frosted-mint),var(--color-tea-green))] text-shadow-olive',
    'place-items-center rounded-2xl bg-periwinkle-2 text-text-primary', 1, 'RAILBTN')
rep('place-items-center rounded-2xl bg-[linear-gradient(135deg,var(--color-frosted-mint),var(--color-tea-green))] shadow-brand',
    'place-items-center rounded-2xl bg-[linear-gradient(135deg,var(--color-baby-blue-ice),var(--color-periwinkle-2))] shadow-brand', 1, 'BRAND')
rep('var(--color-shadow-olive)', 'var(--color-text-primary)', 2, 'GLYPH')

# ============ topbar / sidebar ============
rep("route === i.id ? 'bg-frosted-mint text-shadow-olive' : 'text-frosted-mint hover:bg-muted-olive-2/20 hover:text-frosted-mint',",
    "route === i.id ? 'bg-periwinkle-2 text-text-primary' : 'text-text-secondary hover:bg-lavender-2/70 hover:text-text-primary',", 1, 'TOP112')
rep("route === id ? 'bg-frosted-mint text-shadow-olive' : 'text-frosted-mint',",
    "route === id ? 'bg-periwinkle-2 text-text-primary' : 'text-text-secondary',", 1, 'TOP153')
rep("active ? 'font-semibold text-frosted-mint' : 'text-frosted-mint hover:bg-muted-olive-2/20 hover:text-frosted-mint',",
    "active ? 'bg-periwinkle-2 font-semibold text-text-primary shadow-[inset_3px_0_0_0_var(--color-baby-blue-ice)]' : 'text-text-secondary hover:bg-lavender-2/70 hover:text-text-primary',", 1, 'SB106')
rep("active ? 'text-frosted-mint' : 'text-frosted-mint'",
    "active ? 'text-text-primary' : 'text-text-secondary'", 1, 'SB87')
rep("active && !expanded && 'bg-palm-leaf/25'",
    "active && !expanded && 'bg-periwinkle-2/60'", 1, 'SBRAIL')
rep('hover:bg-muted-olive-2/20 hover:text-frosted-mint',
    'hover:bg-lavender-2/70 hover:text-text-primary', 3, 'NAVHOVER')
rep('<span className="rounded-md bg-frosted-mint px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wider text-shadow-olive">LIVE</span>',
    '<span className="rounded-md bg-baby-blue-ice px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wider text-text-primary">LIVE</span>', 1, 'LIVEB')

# ============ toggles / knobs / tracks ============
rep("on ? 'bg-dusty-olive' : 'bg-muted-olive-2/50'",
    "on ? 'bg-periwinkle-3' : 'bg-lavender-2'", 4, 'TOGGLE')
rep('rounded-full bg-frosted-mint shadow transition-all',
    'rounded-full bg-white shadow transition-all', 4, 'KNOB')
rep('bg-muted-olive-2/30', 'bg-periwinkle-2/40', 11, 'TRACKS')

# ============ wells / chips ============
rep("value === t.id ? 'bg-shadow-olive/20 text-shadow-olive' : 'bg-muted-olive-2/15 text-tea-green'",
    "value === t.id ? 'bg-periwinkle-3 text-text-primary' : 'bg-periwinkle-2/40 text-text-secondary'", 1, 'TABCOUNT')
rep("deltaTone === 'flat' && 'bg-muted-olive-2/12 text-tea-green',",
    "deltaTone === 'flat' && 'bg-lavender-2/60 text-text-muted',", 1, 'FLAT')
rep('<span className="grid h-12 w-12 place-items-center rounded-2xl border border-muted-olive/25 bg-muted-olive-2/10 text-tea-green">',
    '<span className="grid h-12 w-12 place-items-center rounded-2xl border border-periwinkle-2/50 bg-periwinkle-2/40 text-text-secondary">', 1, 'EMPTY')
rep('<div className="mt-4 flex items-center gap-2 overflow-hidden rounded-xl bg-muted-olive-2/25 p-1">',
    '<div className="mt-4 flex items-center gap-2 overflow-hidden rounded-xl bg-periwinkle-2/30 p-1">', 1, 'FUNCONT')
rep('mx-1 h-6 w-px bg-muted-olive-2/20', 'mx-1 h-6 w-px bg-periwinkle-3/50', 1, 'DIV-TOP')
rep('h-8 w-px bg-muted-olive-2/50', 'h-8 w-px bg-periwinkle-3/50', 1, 'DIV-DASH')

# ============ SH15 sites ============
rep("n.read ? 'border-muted-olive/15 bg-shadow-olive/10' : 'border-frosted-mint/50 bg-shadow-olive/15 shadow-lift',",
    "n.read ? 'border-periwinkle-2/30 bg-white/35' : 'border-periwinkle-3/60 bg-periwinkle/50 shadow-lift',", 1, 'UNREAD')
rep("active ? 'border-frosted-mint/60 bg-shadow-olive/15 shadow-lift'",
    "active ? 'border-periwinkle-3/60 bg-periwinkle/50 shadow-lift'", 1, 'ELAB151')
rep("!n.read && 'bg-shadow-olive/15!'", "!n.read && 'bg-periwinkle/50!'", 1, 'NOTIFP')
rep("live ? 'border-frosted-mint/60 bg-shadow-olive/15 shadow-lift'",
    "live ? 'border-periwinkle-3/60 bg-periwinkle/50 shadow-lift'", 1, 'LIVE255')
rep("live ? 'border-frosted-mint/60 bg-shadow-olive/15'",
    "live ? 'border-periwinkle-3/60 bg-periwinkle/50'", 1, 'LIVE406')
rep("childId === c.id ? 'border-frosted-mint/70 bg-shadow-olive/15 shadow-lift'",
    "childId === c.id ? 'border-periwinkle-3/70 bg-periwinkle/50 shadow-lift'", 1, 'CHILDSEL')
rep("'bg-frosted-mint text-shadow-olive' : 'bg-shadow-olive/15 text-tea-green'",
    "'bg-periwinkle-3 text-text-primary' : 'bg-lavender-2/60 text-text-muted'", 2, 'TAILS')

# ============ sticky / scrim / charttip ============
rep('sticky left-0 z-10 w-[86px] bg-shadow-olive/60',
    'sticky left-0 z-10 w-[86px] bg-alice-blue/85', 1, 'STICKY')
rep('sticky left-0 z-10 bg-shadow-olive/60',
    'sticky left-0 z-10 bg-alice-blue/85', 1, 'STICKY-TD')
rep('absolute inset-0 bg-shadow-olive/60 backdrop-blur-[6px]',
    'absolute inset-0 bg-text-primary/45 backdrop-blur-[6px]', 4, 'SCRIM')
rep('<div className="rounded-xl border border-muted-olive/60 bg-shadow-olive/85 px-3 py-2 shadow-xl backdrop-blur-md">',
    '<div className="rounded-xl border border-periwinkle-2/60 bg-alice-blue/95 px-3 py-2 shadow-xl backdrop-blur-md">', 1, 'CHARTTIP')
rep('bg-shadow-olive/85', 'bg-alice-blue/95', 3, 'CHARTTIP-2')

# ============ monogram / iconchip / filechip / drag / funnel ============
rep('border border-frosted-mint/40 bg-frosted-mint/5 font-mono text-[11px] font-semibold text-frosted-mint',
    'border border-periwinkle-3/50 bg-periwinkle-2/50 font-mono text-[11px] font-semibold text-text-primary', 1, 'MONOGRAM')
rep('border border-frosted-mint/40 bg-frosted-mint/8 text-frosted-mint',
    'border border-periwinkle-3/50 bg-periwinkle-2/50 text-text-primary', 2, 'ICONCHIP')
rep('border border-muted-olive/50 bg-frosted-mint/8 text-frosted-mint',
    'border border-periwinkle-3/50 bg-periwinkle-2/50 text-text-primary', 2, 'FILECHIP')
rep("drag ? 'border-frosted-mint bg-frosted-mint/8 scale-[1.01]' : 'border-muted-olive/30 bg-shadow-olive/10 hover:bg-shadow-olive/20',",
    "drag ? 'border-baby-blue-ice bg-periwinkle-2/70 scale-[1.01]' : 'border-periwinkle-2/50 bg-white/35 hover:bg-lavender-2/70',", 1, 'DRAG')
rep("stageFilter === s ? 'border-frosted-mint bg-frosted-mint text-shadow-olive' : 'border-muted-olive/40 bg-shadow-olive/10 hover:bg-shadow-olive/20',",
    "stageFilter === s ? 'border-periwinkle-3 bg-periwinkle-3 text-text-primary' : 'border-periwinkle-2/50 bg-white/35 hover:bg-lavender-2/70',", 1, 'FUNNEL')

# ============ rings / focus ============
rep('focus-visible:ring-frosted-mint/60', 'focus-visible:ring-baby-blue-ice/50', 1, 'FOCUS')
rep('ring-frosted-mint/18', 'ring-periwinkle-3/50', 2, 'RINGS')
rep("isNow && 'ring-2 ring-frosted-mint/70',", "isNow && 'ring-2 ring-baby-blue-ice/70',", 1, 'ISNOW')

# ============ console + elab dims ============
rep("l.tone === 'ok' && 'text-frosted-mint bg-tea-green/10'",
    "l.tone === 'ok' && 'text-success bg-white/40'", 1, 'CONS-OK')
rep("l.tone === 'err' && 'text-frosted-mint bg-error/15'",
    "l.tone === 'err' && 'text-error bg-white/40'", 1, 'CONS-ERR')
rep("l.tone === 'dim' && 'text-frosted-mint/40'", "l.tone === 'dim' && 'text-text-muted'", 1, 'DIM40')
rep("l.tone === 'info' && 'text-frosted-mint/65'", "l.tone === 'info' && 'text-text-secondary'", 1, 'DIM65')
rep('<span className="text-frosted-mint/50">› </span>', '<span className="text-text-muted">› </span>', 1, 'DIM50')
rep('text-frosted-mint/8', 'text-text-muted/30', 2, 'DIM8')
rep('text-frosted-mint/10', 'text-text-muted', 3, 'DIM10')
rep('text-frosted-mint/12', 'text-text-muted', 1, 'DIM12')
rep('text-frosted-mint/45', 'text-text-secondary', 1, 'DIM45')
rep('text-frosted-mint/70', 'text-text-secondary', 1, 'DIM70')
rep('border-frosted-mint/5', 'border-periwinkle-2/70', 4, 'ELAB-B5')
rep('border-frosted-mint/6', 'border-periwinkle-2/70', 4, 'ELAB-B6')

# ============ testcards ============
rep("t.pass ? 'border-tea-green/35 bg-tea-green/8' : 'border-error/40 bg-error/15'",
    "t.pass ? 'border-success/40 bg-white/30' : 'border-error/40 bg-white/30'", 1, 'TESTCARD')
rep('<CheckCircle2 size={13} className="text-frosted-mint" />',
    '<CheckCircle2 size={13} className="text-success" />', 1, 'TEST-PASS')
rep('<XCircle size={13} className="text-frosted-mint" />',
    '<XCircle size={13} className="text-error" />', 1, 'TEST-FAIL')
rep('<CheckCircle2 size={14} className="text-frosted-mint" />',
    '<CheckCircle2 size={14} className="text-success" />', 1, 'ELAB156')

# ============ allow/deny / overdue / incident / danger ============
rep("a.result === 'allowed' ? 'text-frosted-mint bg-tea-green/15 rounded px-1' : 'text-frosted-mint bg-error/20 rounded px-1'",
    "a.result === 'allowed' ? 'text-success bg-white/40 rounded px-1' : 'text-error bg-white/40 rounded px-1'", 1, 'ALLOW-OV')
rep('text-frosted-mint bg-tea-green/15 rounded px-1.5 py-0.5"><Check',
    'text-success bg-white/40 rounded px-1.5 py-0.5"><Check', 1, 'ALLOW-PLAT')
rep('text-frosted-mint bg-error/20 rounded px-1.5 py-0.5"><X',
    'text-error bg-white/40 rounded px-1.5 py-0.5"><X', 1, 'DENY-PLAT')
rep("a.status === 'overdue' ? 'text-frosted-mint' : 'text-tea-green'",
    "a.status === 'overdue' ? 'text-error' : 'text-text-secondary'", 1, 'OVERDUE')
rep('text-frosted-mint"><ShieldCheck size={13} /> incident-free for 41 days',
    'text-success"><ShieldCheck size={13} /> incident-free for 41 days', 1, 'INCIDENT')
rep('<div className="rounded-2xl border border-error/40 bg-error/15 p-4">',
    '<div className="rounded-2xl border border-error/50 bg-white/40 p-4">', 1, 'DANGERBOX')
rep('<p className="text-[13px] font-bold text-frosted-mint">Danger zone</p>',
    '<p className="text-[13px] font-bold text-error">Danger zone</p>', 1, 'DANGERTITLE')
rep("variant === 'danger-ghost' && 'text-frosted-mint hover:bg-error/25 rounded-lg px-3',",
    "variant === 'danger-ghost' && 'text-text-primary hover:bg-error/15 rounded-lg px-3',", 1, 'DGHOST')

# ============ toast / avg / holiday ============
rep('success: <CircleCheck size={17} className="text-frosted-mint" />,',
    'success: <CircleCheck size={17} className="text-success" />,', 1, 'TOAST-OK')
rep('info: <Info size={17} className="text-frosted-mint" />,',
    'info: <Info size={17} className="text-icon-accent" />,', 1, 'TOAST-INFO')
rep('<span className="rounded-lg bg-dusty-olive/35 px-2 py-1 font-mono text-[11px] font-semibold text-frosted-mint">avg {a.avgScore}</span>',
    '<span className="rounded-lg bg-periwinkle-2/60 px-2 py-1 font-mono text-[11px] font-semibold text-text-primary">avg {a.avgScore}</span>', 1, 'AVG')
rep("v === 0 && 'bg-dusty-olive/30 text-tea-green',",
    "v === 0 && 'bg-lavender/60 text-text-muted',", 1, 'HOLIV0')

# ============ avatar / swatches / phase / prod / xdots ============
rep("const AVATAR_BG = ['bg-frosted-mint text-shadow-olive', 'bg-tea-green text-shadow-olive', 'bg-muted-olive text-shadow-olive', 'bg-shadow-olive text-frosted-mint ring-1 ring-muted-olive/30'];",
    "const AVATAR_BG = ['bg-periwinkle-3 text-text-primary', 'bg-periwinkle-2 text-text-primary', 'bg-lavender-2 text-text-secondary', 'bg-baby-blue-ice text-text-primary ring-1 ring-periwinkle-3/40'];", 1, 'AVATAR')
rep('bg-frosted-mint" /> total students', 'bg-baby-blue-ice" /> total students', 1, 'SW-DASH')
rep('bg-muted-olive" /> new admissions', 'bg-periwinkle-2" /> new admissions', 1, 'SW-ADM')
rep("phase === 'done' ? 'bg-frosted-mint' : phase === 'error' ? 'bg-error' : busy ? 'bg-muted-olive-2 animate-ping' : 'bg-muted-olive-2',",
    "phase === 'done' ? 'bg-success' : phase === 'error' ? 'bg-error' : busy ? 'bg-baby-blue-ice animate-ping' : 'bg-periwinkle-2',", 1, 'PHASE-A')
rep("phase === 'done' ? 'bg-frosted-mint' : phase === 'error' ? 'bg-error' : busy ? 'bg-muted-olive-2' : 'bg-muted-olive-2',",
    "phase === 'done' ? 'bg-success' : phase === 'error' ? 'bg-error' : busy ? 'bg-baby-blue-ice' : 'bg-periwinkle-2',", 1, 'PHASE-B')
rep("f.production ? 'bg-frosted-mint' : 'bg-muted-olive-2'",
    "f.production ? 'bg-success' : 'bg-periwinkle-2'", 1, 'PROD')
rep('bg-frosted-mint/80', 'bg-baby-blue-ice', 1, 'XDOT-1')
rep('bg-tea-green/80', 'bg-periwinkle-3', 1, 'XDOT-2')
rep('bg-muted-olive-2/80', 'bg-periwinkle-2', 1, 'XDOT-3')

# ============ misc small ============
rep('placeholder:text-muted-olive', 'placeholder:text-text-muted', 2, 'PLACEHOLDER')
rep('accent-muted-olive-2', 'accent-periwinkle-3', 1, 'ACCENT')
rep('fill-frosted-mint text-frosted-mint', 'fill-icon-accent text-icon-accent', 3, 'STARS')
rep('text-frosted-mint uppercase">403 · forbidden', 'text-error uppercase">403 · forbidden', 1, 'E403-A')
rep('text-frosted-mint">Restricted for', 'text-error">Restricted for', 1, 'E403-B')
rep("""      <span className="grid h-12 w-12 place-items-center rounded-2xl border border-error/45 bg-error/20 text-frosted-mint">
        <X size={20} />
      </span>
      <p className="font-display mt-3 text-[15px] font-bold text-frosted-mint">{title}</p>""",
    """      <span className="grid h-12 w-12 place-items-center rounded-2xl border border-error/50 bg-white/40 text-error">
        <X size={20} />
      </span>
      <p className="font-display mt-3 text-[15px] font-bold text-error">{title}</p>""", 1, 'ERRSTATE')
rep('deep-olive atmospheric dispersion', 'periwinkle atmospheric dispersion', 1, 'COM-1')
rep('screen-blend frosted-mint light layer', 'screen-blend baby-blue-ice light layer', 1, 'COM-2')
rep('a refractive rim and deep\n   shadow-olive shadows', 'a refractive rim and deep\n   shadow-blue shadows', 1, 'COM-3')
rep('over a deep-olive grounding layer', 'over an alice-blue grounding layer', 1, 'COM-4')
rep('code-dark', 'code-panel', 2, 'CODEPANEL')
rep('bg-black/20', 'bg-white/40', 1, 'BGBLACK')

# ============ GLOBALS (order: slashed/shadow first, then bare) ============
rep('hover:bg-shadow-olive/20', 'hover:bg-lavender-2/70', 26, 'G-HOV20')
rep('bg-shadow-olive/10', 'bg-white/35', 92, 'G-SH10')
rep('border-muted-olive-2', 'border-periwinkle-2', 0, 'G-BORD-O2-SAFE')
rep('border-muted-olive', 'border-periwinkle-2', None, 'G-BORD-MUT')
rep('bg-muted-olive-2/30', 'bg-periwinkle-2/40', 0, 'G-TRACK-SAFE')
rep('text-tea-green/60', 'text-text-muted', 3, 'G-TEA60')
rep('text-tea-green/70', 'text-text-muted', 2, 'G-TEA70')
rep('text-tea-green/0', 'text-text-muted/30', 1, 'G-TEA0')
rep('text-tea-green', 'text-text-secondary', None, 'G-TEA')
rep('text-frosted-mint', 'text-text-primary', None, 'G-FROST')
rep('text-shadow-olive', 'text-text-primary', None, 'G-SH-TEXT')
rep('bg-frosted-mint', 'bg-periwinkle-3', None, 'G-FROST-BG')

# ============ asserts ============
joined = '\n'.join(texts.values())
AZERO = [r'(?i)olive', r'frosted-mint', r'tea-green', r'code-dark', r'bg-black',
         r'#eef5e3', r'#cfe0b8', r'#93a07b', r'#7a8a63', r'#3c4a2e', r'#5c7042',
         r'#414e30', r'#8a6a2f', r'#9c4a3c', r'Frosted Mint', r'Deep Sea',
         r'bg-shadow-olive/', r'bg-shadow-olive"', r"bg-shadow-olive'", r'bg-muted-olive-2',
         r'bg-tea-green', r'border-frosted-mint', r'border-tea-green', r'ring-frosted-mint']
for pat in AZERO:
    n = len(re.findall(pat, joined))
    print(f'AZERO {pat}: {n}')
    if n != 0:
        fails.append(f'AZERO {pat}: {n} remain')

# semantic keeps: bare warning/error solids must survive exactly
for tok, expect in [('bg-warning', 3), ('bg-error', 6), ('border-error', 7),
                    ('border-warning', 6), ('text-black', 2)]:
    n = joined.count(tok)
    print(f'KEEP {tok}: {n} (expect {expect})')
    if n != expect:
        fails.append(f'KEEP {tok}: expect {expect}, found {n}')

for tok, minimum in [('text-text-primary', 100), ('text-text-secondary', 200),
                     ('bg-periwinkle-3', 40), ('bg-white/30', 12), ('text-success', 12),
                     ('text-warning', 5), ('text-error', 10), ('bg-lavender-2/70', 25),
                     ('bg-white/35', 80), ('border-periwinkle-2', 90), ('code-panel', 2),
                     ('bg-baby-blue-ice', 8), ('--color-baby-blue-ice', 8)]:
    n = joined.count(tok)
    print(f'HAS {tok}: {n}')
    if n < minimum:
        fails.append(f'HAS {tok}: {n} < {minimum}')

if fails:
    print('\nTSX FAIL:')
    for f in fails:
        print('  ' + f)
    print('Leftovers:')
    for p in FILES:
        for i, line in enumerate(texts[p].read_text().splitlines() if False else texts[p].splitlines(), 1):
            if re.search(r'(?i)olive|frosted-mint|tea-green|code-dark|bg-black', line):
                print(f'  {p.name}:{i}: {line.strip()[:140]}')
    sys.exit(1)

for p in FILES:
    p.write_text(texts[p])
print(f'SUCCESS: WROTE {len(FILES)} tsx files')

# ============ index.html ============
IP = ROOT / 'index.html'
html = IP.read_text()
hfails = []


def hrep(old, new, expect, tag):
    global html
    n = html.count(old)
    print(f'{tag}: found {n} (expect {expect})')
    if n != expect:
        hfails.append(f'{tag}: expect {expect}, found {n}')
        return
    html = html.replace(old, new)


hrep("fill='%23E9F5DB'", "fill='%23EDF2FB'", 1, 'IDX-BG')
hrep("stroke='%23414E30'", "stroke='%23182033'", 1, 'IDX-STROKE')
hrep("fill='%23B5C99A'", "fill='%23ABC4FF'", 1, 'IDX-DOT')
hrep('content="#414E30"', 'content="#EDF2FB"', 1, 'IDX-THEME')
hrep('a premium Frosted Mint monochrome glass', 'an Alice Blue lavender glass', 1, 'IDX-DESC')

if hfails:
    print('\nINDEX FAIL:')
    for f in hfails:
        print('  ' + f)
    sys.exit(1)
IP.write_text(html)
print('SUCCESS: WROTE index.html')

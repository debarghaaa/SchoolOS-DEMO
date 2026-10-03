"""Frosted Mint tsx migration v2: dry-run ALL rules, assert, then write (or exit 1, no writes)."""
import glob, re, sys

files = sorted(glob.glob('src/**/*.tsx', recursive=True)) + ['index.html']
orig = {f: open(f).read() for f in files}
txt = dict(orig)
FAIL = []

def rep(old, new, expect=None, tag=''):
    n = 0
    for f in files:
        c = txt[f].count(old)
        if c:
            txt[f] = txt[f].replace(old, new)
            n += c
    print(f'{tag or old[:50]!r}: {n}' + (f' (want {expect})' if expect is not None else ''))
    if expect is not None and n != expect:
        FAIL.append(f'{tag}: got {n}, want {expect}')

def azero(pat, label):
    n = sum(len(re.findall(pat, t)) for t in txt.values())
    print(f'{label}: remaining={n}')
    if n:
        FAIL.append(label)

def aeq(pat, want, label):
    n = sum(len(re.findall(pat, t)) for t in txt.values())
    print(f'{label}: {n} (want {want})')
    if n != want:
        FAIL.append(label)

# ---- consts / kind / legend ----
rep("const AVATAR_BG = ['bg-ink-100 text-ink-900', 'bg-ink-300 text-ink-900', 'bg-ink-500 text-ink-100', 'bg-ink-700 text-ink-100 ring-1 ring-ink-500/30'];",
    "const AVATAR_BG = ['bg-frosted-mint text-shadow-olive', 'bg-tea-green text-shadow-olive', 'bg-muted-olive text-shadow-olive', 'bg-shadow-olive text-frosted-mint ring-1 ring-muted-olive/30'];", 1, 'AVATAR')
rep("lecture: { chip: 'bg-ink-100/14 border-ink-500/50', bar: 'bg-ink-100', icon: <User size={11} /> },",
    "lecture: { chip: 'bg-shadow-olive/10 border-muted-olive/50', bar: 'bg-frosted-mint', icon: <User size={11} /> },", 1, 'KIND-lecture')
rep("lab: { chip: 'bg-ink-100/18 border-ink-100/40', bar: 'bg-ink-500', icon: <FlaskConical size={11} /> },",
    "lab: { chip: 'bg-shadow-olive/10 border-muted-olive/40', bar: 'bg-muted-olive', icon: <FlaskConical size={11} /> },", 1, 'KIND-lab')
rep("sports: { chip: 'bg-ink-300/20 border-ink-300/25', bar: 'bg-ink-300', icon: <Trophy size={11} /> },",
    "sports: { chip: 'bg-shadow-olive/10 border-tea-green/25', bar: 'bg-tea-green', icon: <Trophy size={11} /> },", 1, 'KIND-sports')
rep("arts: { chip: 'bg-ink-700/30 border-ink-500/30', bar: 'bg-ink-700', icon: <Palette size={11} /> },",
    "arts: { chip: 'bg-shadow-olive/10 border-muted-olive-2/35', bar: 'bg-palm-leaf', icon: <Palette size={11} /> },", 1, 'KIND-arts')
rep("break: { chip: 'bg-transparent border-dashed border-ink-500/50', bar: 'bg-ink-500/40', icon: null },",
    "break: { chip: 'bg-transparent border-dashed border-muted-olive-2/40', bar: 'bg-muted-olive-2/30', icon: null },", 1, 'KIND-break')
rep("[['Lecture', 'var(--color-ink-100)'], ['Lab', 'var(--color-ink-500)'], ['Sports', 'var(--color-ink-300)'], ['Arts', 'var(--color-ink-700)'], ['Break', 'color-mix(in srgb, var(--color-ink-500) 40%, transparent)']]",
    "[['Lecture', 'var(--color-frosted-mint)'], ['Lab', 'var(--color-muted-olive)'], ['Sports', 'var(--color-tea-green)'], ['Arts', 'var(--color-palm-leaf)'], ['Break', 'color-mix(in srgb, var(--color-muted-olive-2) 40%, transparent)']]", 1, 'LEG')
rep("Green · present — Amber · late", "Mint · present — Amber · late — Olive · holiday", 1, 'LEG-copy')
rep("const CH = { hi: 'var(--color-ink-100)', mid: 'var(--color-ink-300)', low: 'var(--color-ink-500)' };",
    "const CH = { hi: 'var(--color-frosted-mint)', mid: 'var(--color-tea-green)', low: 'var(--color-muted-olive)' };", 3, 'CH')
rep('stroke="color-mix(in srgb, var(--color-ink-500) 35%, transparent)"',
    'stroke="color-mix(in srgb, var(--color-muted-olive-2) 35%, transparent)"', 15, 'GRID')
rep('fill="var(--color-ink-500)"', 'fill="var(--color-muted-olive)"', 1, 'SVG-fill')

# ---- targeted text/track rules ----
rep("stageFilter === s ? 'text-ink-900/70'", "stageFilter === s ? 'text-shadow-olive'", 1, 'FUN-70')
rep("stageFilter === s ? 'text-ink-900/80'", "stageFilter === s ? 'text-shadow-olive'", 1, 'FUN-80')
rep("accent-ink-100", "accent-muted-olive-2", 1, 'ACCENT')
rep('<span className="text-ink-100/25">› </span>', '<span className="text-frosted-mint/50">› </span>', 1, 'PROMPT')
rep("text-ink-100/80", "text-frosted-mint", 10, 'T100-80')
rep("placeholder:text-ink-500", "placeholder:text-muted-olive", 2, 'PLACEHOLDER')
rep("hover:bg-ink-500/30 hover:text-ink-100", "hover:bg-muted-olive-2/20 hover:text-frosted-mint", 5, 'NAV-HOVER')
rep("bg-ink-500 text-ink-100", "bg-frosted-mint text-shadow-olive", 2, 'TOPBAR-ACTIVE')
rep("active && !expanded && 'bg-ink-500/35',", "active && !expanded && 'bg-palm-leaf/25',", 1, 'RAIL-ACTIVE')
rep("on ? 'bg-ink-500'", "on ? 'bg-dusty-olive'", 4, 'TOGGLE')
rep('<span className="h-2 w-6 rounded-full bg-ink-500" /> new admissions',
    '<span className="h-2 w-6 rounded-full bg-muted-olive" /> new admissions', 1, 'SWATCH')
rep("rounded-lg bg-ink-500/25 px-2 py-1 font-mono text-[11px] font-semibold text-ink-100",
    "rounded-lg bg-dusty-olive/35 px-2 py-1 font-mono text-[11px] font-semibold text-frosted-mint", 1, 'AVG')
rep("v === 0 && 'bg-ink-500/25 text-ink-300',", "v === 0 && 'bg-dusty-olive/30 text-tea-green',", 1, 'HOLIDAY')
rep("'bg-ink-100 text-ink-900' : 'bg-ink-500/25 text-ink-300'",
    "'bg-frosted-mint text-shadow-olive' : 'bg-shadow-olive/15 text-tea-green'", 2, 'TAILS')
rep("active: 'bg-ink-100/15 text-ink-100 border-ink-100/35',",
    "active: 'bg-frosted-mint/5 text-frosted-mint border-frosted-mint/35',", 1, 'B-active')
rep("closed: 'bg-ink-500/10 text-ink-300/80 border-ink-500/20',",
    "closed: 'bg-dusty-olive/10 text-tea-green/70 border-muted-olive/20',", 1, 'B-closed')
rep("neutral: 'bg-ink-500/10 text-ink-300 border-ink-500/20',",
    "neutral: 'bg-dusty-olive/10 text-frosted-mint border-muted-olive/20',", 1, 'B-neutral')

# ---- frosted-wash rework (bg-ink-100/NN targeted) ----
rep("bg-ink-100/20 font-mono text-[11px] font-semibold text-ink-100",
    "bg-frosted-mint/5 font-mono text-[11px] font-semibold text-frosted-mint", 1, 'MONOGRAM')
rep("bg-ink-100/20 text-ink-100", "bg-frosted-mint/8 text-frosted-mint", 2, 'ICONCHIP')
rep("border-ink-500/50 bg-ink-100/16", "border-muted-olive/50 bg-frosted-mint/8", 2, 'FILECHIP')
rep("border-ink-100/50 bg-ink-100/15 shadow-lift", "border-frosted-mint/50 bg-shadow-olive/15 shadow-lift", 1, 'UNREAD')
rep("drag ? 'border-ink-100 bg-ink-100/15 scale-[1.01]'", "drag ? 'border-frosted-mint bg-frosted-mint/8 scale-[1.01]'", 1, 'DRAG')
rep("bg-ink-100/30", "bg-shadow-olive/85", 4, 'CHARTTIP')
rep("rounded-2xl border border-ink-100/25 bg-ink-100/20 p-4", "rounded-2xl border border-error/40 bg-error/15 p-4", 1, 'DANGERBOX')
rep("live ? 'border-ink-100/60 bg-ink-100/20 shadow-lift'", "live ? 'border-frosted-mint/60 bg-shadow-olive/15 shadow-lift'", 1, 'LIVE255')
rep("live ? 'border-ink-100/60 bg-ink-100/20'", "live ? 'border-frosted-mint/60 bg-shadow-olive/15'", 1, 'LIVE406')
rep("active ? 'border-ink-100/60 bg-ink-100/25 shadow-lift'", "active ? 'border-frosted-mint/60 bg-shadow-olive/15 shadow-lift'", 1, 'ELAB-ACTIVE')
rep("childId === c.id ? 'border-ink-100/70 bg-ink-100/25 shadow-lift'", "childId === c.id ? 'border-frosted-mint/70 bg-shadow-olive/15 shadow-lift'", 1, 'CHILD-SEL')
rep("'bg-ink-100/18!'", "'bg-shadow-olive/15!'", 1, 'NOTIF-PAGE')
rep("sticky left-0 z-10 w-[86px] bg-ink-100/18", "sticky left-0 z-10 w-[86px] bg-shadow-olive/60", 1, 'STICKY-TH')
rep("sticky left-0 z-10 bg-ink-100/18", "sticky left-0 z-10 bg-shadow-olive/60", 1, 'STICKY-TD')
rep("bg-ink-100/80", "bg-frosted-mint/80", 1, 'DOT80')
for a, e in [('10', 1), ('12', 3), ('14', 5), ('16', 9), ('18', 8)]:
    rep(f"hover:bg-ink-100/{a}", "hover:bg-shadow-olive/20", e, f'HOV100-{a}')
for a, e in [('5', 5), ('6', 1), ('8', 5), ('10', 64), ('12', 19), ('14', 1)]:
    rep(f"bg-ink-100/{a}", "bg-shadow-olive/10", e, f'ST100-{a}')
azero(r"bg-ink-100/|hover:bg-ink-100", 'BG100-slashed')
rep("bg-ink-100", "bg-frosted-mint", 42, 'BG100-solid')
rep("fill-ink-100", "fill-frosted-mint", 3, 'FILL100')

# ---- ink-300 family ----
rep("hover:bg-ink-300/15", "hover:bg-shadow-olive/20", 2, 'HOV300-15')
rep("hover:bg-ink-300/12", "hover:bg-shadow-olive/20", 1, 'HOV300-12')
rep("bg-ink-300", "bg-tea-green", 1, 'BG300')
rep("text-ink-300", "text-tea-green", None, 'TEXT300')
rep("border-ink-300", "border-tea-green", 0, 'BORD300')
rep("var(--color-ink-300)", "var(--color-tea-green)", 4, 'VAR300')

# ---- ink-500 remainder ----
rep("bg-ink-500", "bg-muted-olive-2", 27, 'BG500')
rep("border-ink-500", "border-muted-olive", 112, 'BORD500')
rep("var(--color-ink-500)", "var(--color-muted-olive)", 0, 'VAR500')
rep("ring-ink-500", "ring-muted-olive", 0, 'RING500')
azero(r"ink-500", 'INK500')
azero(r"ink-700", 'INK700')

# ---- ink-900 / ink-100 generics ----
rep("ink-900", "shadow-olive", 39, 'INK900')
rep("border-ink-100", "border-frosted-mint", 12, 'BORD100')
rep("text-ink-100", "text-frosted-mint", None, 'TEXT100')
rep("var(--color-ink-100)", "var(--color-frosted-mint)", 19, 'VAR100')
rep("ring-ink-100", "ring-frosted-mint", 4, 'RING100')
rep("ink-100", "frosted-mint", 1, 'BARE100')
azero(r"ink-100|ink-300", 'INK100-300')

# ---- semantic rework ----
rep("l.tone === 'ok' && 'text-success',", "l.tone === 'ok' && 'text-frosted-mint bg-tea-green/10',", 1, 'CON-ok')
rep("l.tone === 'err' && 'text-error',", "l.tone === 'err' && 'text-frosted-mint bg-error/15',", 1, 'CON-err')
rep("variant === 'danger-ghost' && 'text-error hover:bg-error/20 rounded-lg px-3',",
    "variant === 'danger-ghost' && 'text-frosted-mint hover:bg-error/25 rounded-lg px-3',", 1, 'GHOST')
rep("a.result === 'allowed' ? 'text-success' : 'text-error'",
    "a.result === 'allowed' ? 'text-frosted-mint bg-tea-green/15 rounded px-1' : 'text-frosted-mint bg-error/20 rounded px-1'", 1, 'DENY-ov')
rep('font-mono text-[11px] font-bold text-success"><Check size={12} />ALLOW',
    'font-mono text-[11px] font-bold text-frosted-mint bg-tea-green/15 rounded px-1.5 py-0.5"><Check size={12} />ALLOW', 1, 'ALLOW-plat')
rep('font-mono text-[11px] font-bold text-error"><X size={12} />DENY',
    'font-mono text-[11px] font-bold text-frosted-mint bg-error/20 rounded px-1.5 py-0.5"><X size={12} />DENY', 1, 'DENY-plat')
rep("bg-success/15", "bg-tea-green/8", 7, 'W-bg15')
rep("bg-success/18", "bg-tea-green/8", 2, 'W-bg18')
rep("bg-success/20", "bg-tea-green/8", 1, 'W-bg20')
rep("bg-success", "bg-frosted-mint", 6, 'W-bgsolid')
rep("text-success", "text-frosted-mint", 15, 'W-text')
rep("border-success/", "border-tea-green/", 7, 'W-border')
rep("text-warning", "text-frosted-mint", 9, 'W-warntext')
rep("text-error", "text-frosted-mint", 14, 'W-errtext')
rep('warning: <TriangleAlert size={17} className="text-frosted-mint" />',
    'warning: <TriangleAlert size={17} className="text-warning" />', 1, 'REVERT-warn')
rep('error: <CircleAlert size={17} className="text-frosted-mint" />',
    'error: <CircleAlert size={17} className="text-error" />', 1, 'REVERT-err')
azero(r"bg-success|text-success|border-success", 'SUCCESS-utility')
aeq(r"text-warning", 1, 'WARN-text==toast')
aeq(r"text-error", 1, 'ERR-text==toast')

# ---- index.html ----
rep("%23E0E1DD", "%23E9F5DB", 1, 'H-fav1')
rep("%230D1B2A", "%23414E30", 1, 'H-fav2')
rep("%23415A77", "%23B5C99A", 1, 'H-fav3')
rep("#0D1B2A", "#414E30", 1, 'H-theme')
rep("Deep Sea", "Frosted Mint", 1, 'H-desc')
azero(r"0[Dd]1[Bb]2[Aa]|1[Bb]263[Bb]|[Cc][Ee][Ee]5[Ff]2", 'H-legacy')

# ---- final ----
azero(r"(?<!shr)ink-", 'INK-ALL')
azero(r"0[Dd]1[Bb]2[Aa]|1[Bb]263[Bb]|415[Aa]77|778[Dd][Aa]9|[Ee]0[Ee]1[Dd][Dd]", 'LEGACYHEX-tsx')
print('--- success-identifier lines (must be keys/tones/toasts only) ---')
for f in files:
    for i, line in enumerate(txt[f].splitlines(), 1):
        if 'success' in line:
            print(f'{f}:{i}: {line.strip()[:100]}')
print('--- new bg alpha distributions ---')
for tok in ['bg-frosted-mint', 'bg-tea-green', 'bg-shadow-olive', 'bg-muted-olive-2', 'bg-dusty-olive', 'bg-palm-leaf', 'bg-muted-olive/']:
    ds = sorted(set(re.findall(re.escape(tok) + r"/(\d+)", ''.join(txt.values()))), key=int)
    print(f'{tok}: {ds}')

if FAIL:
    print('LEFTOVERS:')
    for f in files:
        for i, line in enumerate(txt[f].splitlines(), 1):
            if re.search(r"(?<!shr)ink-|bg-success|text-success|border-success|0[Dd]1[Bb]2[Aa]|1[Bb]263[Bb]|415[Aa]77|778[Dd][Aa]9|[Ee]0[Ee]1[Dd][Dd]", line):
                print(f'{f}:{i}: {line.strip()[:140]}')
    print('FAIL:', FAIL)
    sys.exit(1)
for f in files:
    open(f, 'w').write(txt[f])
print('WROTE', len(files), 'files')

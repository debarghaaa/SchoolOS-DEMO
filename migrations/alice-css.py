"""Alice Blue migration: src/glass.css (Frosted Mint -> Alice Blue/Lavender/Periwinkle).

Built against the REAL on-disk file (dark-glass structure, uppercase hexes).
Every rule asserts its expected match count BEFORE anything is written.
Any mismatch aborts with leftovers printed and the file untouched.
"""
import pathlib
import re
import sys

P = pathlib.Path('/home/user/school-os/src/glass.css')
css = P.read_text()
fails = []


def rep(old, new, expect, tag):
    global css
    n = css.count(old)
    print(f'{tag}: found {n} (expect {expect})')
    if n != expect:
        fails.append(f'{tag}: expect {expect}, found {n}')
        return
    css = css.replace(old, new)


# ---------------- @theme ----------------
rep("""  /* Frosted Mint monochrome + deep-olive shadow anchor — single source of truth */
  --color-frosted-mint: #E9F5DB;
  --color-tea-green: #CFE1B9;
  --color-muted-olive: #B5C99A;
  --color-muted-olive-2: #97A97C;
  --color-palm-leaf: #87986A;
  --color-dusty-olive: #718355;
  --color-shadow-olive: #414E30;""",
    """  /* Alice Blue monochrome + shadow-blue anchor — single source of truth */
  --color-alice-blue: #EDF2FB;
  --color-lavender: #E2EAFC;
  --color-lavender-2: #D7E3FC;
  --color-periwinkle: #CCDBFD;
  --color-periwinkle-2: #C1D3FE;
  --color-periwinkle-3: #B6CCFE;
  --color-baby-blue-ice: #ABC4FF;
  --color-text-primary: #182033;
  --color-text-secondary: #34405A;
  --color-text-muted: #596780;
  --color-text-disabled: #7A87A0;
  --color-icon-accent: #7182A8;
  --color-shadow-blue: #475878;""", 1, 'THEME')

rep("""  /* Restrained semantic accents — secondary to the monochrome system */
  --color-warning: #c6a35f;
  --color-error: #cf8d8d;""",
    """  /* Restrained semantic accents — secondary to the monochrome system */
  --color-warning: #7f652b;
  --color-error: #a34d4d;
  --color-success: #3a7350;""", 1, 'SEMANTICS')

rep("""  /* Component shadows: shadow-olive contact + frosted-mint inner light */
  --shadow-line: inset 0 1px 0 color-mix(in srgb, var(--color-frosted-mint) 25%, transparent);
  --shadow-lift: 0 10px 26px -10px color-mix(in srgb, var(--color-shadow-olive) 45%, transparent);
  --shadow-card: 0 18px 40px -14px color-mix(in srgb, var(--color-shadow-olive) 25%, transparent);
  --shadow-tab: 0 8px 18px -6px color-mix(in srgb, var(--color-shadow-olive) 60%, transparent), inset 0 1px 0 color-mix(in srgb, var(--color-frosted-mint) 50%, transparent);
  --shadow-brand: inset 0 1px 0 color-mix(in srgb, var(--color-frosted-mint) 50%, transparent), 0 10px 20px -8px color-mix(in srgb, var(--color-shadow-olive) 60%, transparent);""",
    """  /* Component shadows: shadow-blue contact + white inner light */
  --shadow-line: inset 0 1px 0 color-mix(in srgb, #ffffff 60%, transparent);
  --shadow-lift: 0 10px 26px -10px color-mix(in srgb, var(--color-shadow-blue) 30%, transparent);
  --shadow-card: 0 18px 40px -14px color-mix(in srgb, var(--color-shadow-blue) 22%, transparent);
  --shadow-tab: 0 8px 18px -6px color-mix(in srgb, var(--color-shadow-blue) 30%, transparent), inset 0 1px 0 color-mix(in srgb, #ffffff 70%, transparent);
  --shadow-brand: inset 0 1px 0 color-mix(in srgb, #ffffff 70%, transparent), 0 10px 20px -8px color-mix(in srgb, var(--color-shadow-blue) 30%, transparent);""", 1, 'SHADOWS')

# ---------------- root / edges ----------------
rep("/* ---------- GlassSurface tokens (Frosted Mint monochrome) ----------",
    "/* ---------- GlassSurface tokens (Alice Blue monochrome) ----------", 1, 'ROOT-COM')
rep(":root {\n  color-scheme: dark;", ":root {\n  color-scheme: light;", 1, 'SCHEME')
rep("  /* Refractive rims: frosted-mint bright upper-left -> muted-olive lower-right */",
    "  /* Refractive rims: white bright upper-left -> periwinkle-2 lower-right */", 1, 'EDGE-COM')

rep("""  --glass-edge: linear-gradient(135deg,
    color-mix(in srgb, var(--color-frosted-mint) 55%, transparent) 0%,
    color-mix(in srgb, var(--color-frosted-mint) 30%, transparent) 28%,
    color-mix(in srgb, var(--color-tea-green) 22%, transparent) 52%,
    color-mix(in srgb, var(--color-frosted-mint) 28%, transparent) 76%,
    color-mix(in srgb, var(--color-muted-olive) 38%, transparent) 100%);""",
    """  --glass-edge: linear-gradient(135deg,
    color-mix(in srgb, #ffffff 85%, transparent) 0%,
    color-mix(in srgb, var(--color-periwinkle-2) 65%, transparent) 28%,
    color-mix(in srgb, var(--color-baby-blue-ice) 45%, transparent) 52%,
    color-mix(in srgb, var(--color-periwinkle-2) 65%, transparent) 76%,
    color-mix(in srgb, var(--color-periwinkle-3) 60%, transparent) 100%);""", 1, 'EDGE')

rep("""  --glass-edge-strong: linear-gradient(135deg,
    color-mix(in srgb, var(--color-frosted-mint) 65%, transparent) 0%,
    color-mix(in srgb, var(--color-frosted-mint) 36%, transparent) 28%,
    color-mix(in srgb, var(--color-tea-green) 28%, transparent) 52%,
    color-mix(in srgb, var(--color-frosted-mint) 34%, transparent) 76%,
    color-mix(in srgb, var(--color-muted-olive) 44%, transparent) 100%);""",
    """  --glass-edge-strong: linear-gradient(135deg,
    color-mix(in srgb, #ffffff 90%, transparent) 0%,
    color-mix(in srgb, var(--color-periwinkle-2) 70%, transparent) 28%,
    color-mix(in srgb, var(--color-baby-blue-ice) 50%, transparent) 52%,
    color-mix(in srgb, var(--color-periwinkle-2) 70%, transparent) 76%,
    color-mix(in srgb, var(--color-periwinkle-3) 65%, transparent) 100%);""", 1, 'EDGE-STRONG')

rep("""  --glass-edge-soft: linear-gradient(135deg,
    color-mix(in srgb, var(--color-frosted-mint) 38%, transparent) 0%,
    color-mix(in srgb, var(--color-frosted-mint) 20%, transparent) 40%,
    color-mix(in srgb, var(--color-frosted-mint) 22%, transparent) 100%);""",
    """  --glass-edge-soft: linear-gradient(135deg,
    color-mix(in srgb, #ffffff 75%, transparent) 0%,
    color-mix(in srgb, var(--color-periwinkle-2) 55%, transparent) 40%,
    color-mix(in srgb, var(--color-baby-blue-ice) 45%, transparent) 100%);""", 1, 'EDGE-SOFT')

rep("""  --glass-shadow: 0 2px 8px color-mix(in srgb, var(--color-shadow-olive) 35%, transparent), 0 24px 55px color-mix(in srgb, var(--color-shadow-olive) 35%, transparent);
  --glass-shadow-deep: 0 3px 10px color-mix(in srgb, var(--color-shadow-olive) 40%, transparent), 0 30px 65px color-mix(in srgb, var(--color-shadow-olive) 45%, transparent);""",
    """  --glass-shadow: 0 2px 8px color-mix(in srgb, var(--color-shadow-blue) 22%, transparent), 0 24px 55px color-mix(in srgb, var(--color-shadow-blue) 20%, transparent);
  --glass-shadow-deep: 0 3px 10px color-mix(in srgb, var(--color-shadow-blue) 26%, transparent), 0 30px 65px color-mix(in srgb, var(--color-shadow-blue) 28%, transparent);""", 1, 'GSHADOW')

# ---------------- body / mesh / selection ----------------
rep("""/* Frosted Mint atmosphere: dusty-olive depth, palm blooms, muted light —
   never flat, never neon. */
body {
  font-family: var(--font-sans);
  color: var(--color-frosted-mint);
  background:
    radial-gradient(90% 75% at 50% 42%, color-mix(in srgb, var(--color-shadow-olive) 88%, transparent), transparent 72%),
    radial-gradient(900px 500px at 12% -6%, color-mix(in srgb, var(--color-palm-leaf) 40%, transparent), transparent 60%),
    radial-gradient(760px 520px at 88% 8%, color-mix(in srgb, var(--color-muted-olive) 28%, transparent), transparent 60%),
    radial-gradient(820px 620px at 85% 95%, color-mix(in srgb, var(--color-palm-leaf) 35%, transparent), transparent 62%),
    radial-gradient(700px 560px at 8% 96%, color-mix(in srgb, var(--color-tea-green) 22%, transparent), transparent 62%),
    radial-gradient(1000px 700px at 50% 45%, color-mix(in srgb, var(--color-muted-olive) 18%, transparent), transparent 65%),
    linear-gradient(135deg, var(--color-dusty-olive) 0%, var(--color-palm-leaf) 55%, var(--color-dusty-olive) 100%);""",
    """/* Alice Blue atmosphere: periwinkle depth, baby-blue blooms, porcelain light —
   never flat, never neon. */
body {
  font-family: var(--font-sans);
  color: var(--color-text-primary);
  background:
    radial-gradient(90% 75% at 50% 42%, color-mix(in srgb, var(--color-periwinkle-3) 30%, transparent), transparent 72%),
    radial-gradient(900px 500px at 12% -6%, color-mix(in srgb, var(--color-baby-blue-ice) 26%, transparent), transparent 60%),
    radial-gradient(760px 520px at 88% 8%, color-mix(in srgb, var(--color-periwinkle-2) 24%, transparent), transparent 60%),
    radial-gradient(820px 620px at 85% 95%, color-mix(in srgb, var(--color-periwinkle) 26%, transparent), transparent 62%),
    radial-gradient(700px 560px at 8% 96%, color-mix(in srgb, var(--color-lavender-2) 30%, transparent), transparent 62%),
    radial-gradient(1000px 700px at 50% 45%, color-mix(in srgb, #ffffff 60%, transparent), transparent 65%),
    linear-gradient(135deg, var(--color-alice-blue) 0%, var(--color-lavender) 55%, var(--color-alice-blue) 100%);""", 1, 'BODY')

rep("/* The recognizable scene behind the glass: muted-olive band + frosted-mint pools */",
    "/* The recognizable scene behind the glass: periwinkle band + white pools */", 1, 'MESH-COM')
rep("""    linear-gradient(115deg, transparent 40%, color-mix(in srgb, var(--color-muted-olive) 10%, transparent) 47%, transparent 56%),
    radial-gradient(560px 300px at 22% 18%, color-mix(in srgb, var(--color-tea-green) 7%, transparent), transparent 65%),
    radial-gradient(640px 360px at 80% 74%, color-mix(in srgb, var(--color-dusty-olive) 16%, transparent), transparent 65%),
    radial-gradient(420px 420px at 62% 38%, color-mix(in srgb, var(--color-muted-olive) 10%, transparent), transparent 70%);""",
    """    linear-gradient(115deg, transparent 40%, color-mix(in srgb, var(--color-periwinkle-2) 35%, transparent) 47%, transparent 56%),
    radial-gradient(560px 300px at 22% 18%, color-mix(in srgb, var(--color-periwinkle-3) 22%, transparent), transparent 65%),
    radial-gradient(640px 360px at 80% 74%, color-mix(in srgb, var(--color-baby-blue-ice) 20%, transparent), transparent 65%),
    radial-gradient(420px 420px at 62% 38%, color-mix(in srgb, #ffffff 55%, transparent), transparent 70%);""", 1, 'MESH')

rep("""::selection {
  background: color-mix(in srgb, var(--color-tea-green) 70%, transparent);
  color: var(--color-shadow-olive);
}""",
    """::selection {
  background: color-mix(in srgb, var(--color-periwinkle-3) 65%, transparent);
  color: var(--color-text-primary);
}""", 1, 'SELECTION')

rep("""   with a screen-blend frosted-mint light layer, a refractive rim and
   deep shadow-olive shadows. Content above stays sharp. Blur is fallback only.""",
    """   with a screen-blend baby-blue-ice light layer, a refractive rim and
   deep shadow-blue shadows. Content above stays sharp. Blur is fallback only.""", 1, 'SURF-COM')

# ---------------- surface roles ----------------
rep("""  --glass-veil: color-mix(in srgb, var(--color-frosted-mint) 5%, transparent);
  background:
    linear-gradient(color-mix(in srgb, var(--color-frosted-mint) 7%, transparent), color-mix(in srgb, var(--color-frosted-mint) 7%, transparent)) padding-box,
    linear-gradient(var(--glass-veil), var(--glass-veil)) padding-box,
    linear-gradient(color-mix(in srgb, var(--color-shadow-olive) 30%, transparent), color-mix(in srgb, var(--color-shadow-olive) 30%, transparent)) padding-box,
    var(--glass-edge) border-box;
  box-shadow:
    inset 1px 1px 0 color-mix(in srgb, var(--color-frosted-mint) 22%, transparent),
    inset -1px -1px 0 color-mix(in srgb, var(--color-shadow-olive) 35%, transparent),
    0 2px 8px color-mix(in srgb, var(--color-shadow-olive) 35%, transparent),
    0 24px 55px color-mix(in srgb, var(--color-shadow-olive) 35%, transparent),
    0 0 0 1px color-mix(in srgb, var(--color-muted-olive) 16%, transparent);""",
    """  --glass-veil: color-mix(in srgb, var(--color-alice-blue) 80%, transparent);
  background:
    linear-gradient(color-mix(in srgb, #ffffff 50%, transparent), color-mix(in srgb, #ffffff 50%, transparent)) padding-box,
    linear-gradient(var(--glass-veil), var(--glass-veil)) padding-box,
    linear-gradient(color-mix(in srgb, #ffffff 55%, transparent), color-mix(in srgb, #ffffff 55%, transparent)) padding-box,
    var(--glass-edge) border-box;
  box-shadow:
    inset 1px 1px 0 color-mix(in srgb, #ffffff 75%, transparent),
    inset -1px -1px 0 color-mix(in srgb, var(--color-periwinkle-2) 60%, transparent),
    0 2px 8px color-mix(in srgb, var(--color-shadow-blue) 22%, transparent),
    0 24px 55px color-mix(in srgb, var(--color-shadow-blue) 20%, transparent),
    0 0 0 1px color-mix(in srgb, var(--color-periwinkle-2) 50%, transparent);""", 1, 'SURF-BASE')

rep(""".glass-surface[data-glass="secondary"] {
  --glass-veil: color-mix(in srgb, var(--color-tea-green) 5%, transparent);
  background:
    linear-gradient(color-mix(in srgb, var(--color-tea-green) 5%, transparent), color-mix(in srgb, var(--color-tea-green) 5%, transparent)) padding-box,
    linear-gradient(var(--glass-veil), var(--glass-veil)) padding-box,
    linear-gradient(color-mix(in srgb, var(--color-shadow-olive) 20%, transparent), color-mix(in srgb, var(--color-shadow-olive) 20%, transparent)) padding-box,
    var(--glass-edge-soft) border-box;
  box-shadow:
    inset 1px 1px 0 color-mix(in srgb, var(--color-frosted-mint) 16%, transparent),
    inset -1px -1px 0 color-mix(in srgb, var(--color-shadow-olive) 30%, transparent),
    0 2px 6px color-mix(in srgb, var(--color-shadow-olive) 30%, transparent),
    0 14px 34px color-mix(in srgb, var(--color-shadow-olive) 30%, transparent),
    0 0 0 1px color-mix(in srgb, var(--color-muted-olive) 14%, transparent);
}""",
    """.glass-surface[data-glass="secondary"] {
  --glass-veil: color-mix(in srgb, var(--color-lavender) 68%, transparent);
  background:
    linear-gradient(color-mix(in srgb, var(--color-lavender-2) 55%, transparent), color-mix(in srgb, var(--color-lavender-2) 55%, transparent)) padding-box,
    linear-gradient(var(--glass-veil), var(--glass-veil)) padding-box,
    linear-gradient(color-mix(in srgb, #ffffff 50%, transparent), color-mix(in srgb, #ffffff 50%, transparent)) padding-box,
    var(--glass-edge-soft) border-box;
  box-shadow:
    inset 1px 1px 0 color-mix(in srgb, #ffffff 70%, transparent),
    inset -1px -1px 0 color-mix(in srgb, var(--color-periwinkle-2) 55%, transparent),
    0 2px 6px color-mix(in srgb, var(--color-shadow-blue) 18%, transparent),
    0 14px 34px color-mix(in srgb, var(--color-shadow-blue) 18%, transparent),
    0 0 0 1px color-mix(in srgb, var(--color-periwinkle-2) 45%, transparent);
}""", 1, 'SURF-SEC')

rep(""".glass-surface[data-glass="floating"] {
  --glass-veil: color-mix(in srgb, var(--color-frosted-mint) 5%, transparent);
  background:
    linear-gradient(color-mix(in srgb, var(--color-frosted-mint) 6%, transparent), color-mix(in srgb, var(--color-frosted-mint) 6%, transparent)) padding-box,
    linear-gradient(var(--glass-veil), var(--glass-veil)) padding-box,
    linear-gradient(color-mix(in srgb, var(--color-shadow-olive) 70%, transparent), color-mix(in srgb, var(--color-shadow-olive) 70%, transparent)) padding-box,
    var(--glass-edge-strong) border-box;
  box-shadow:
    inset 1px 1px 0 color-mix(in srgb, var(--color-frosted-mint) 26%, transparent),
    inset -1px -1px 0 color-mix(in srgb, var(--color-shadow-olive) 40%, transparent),
    var(--glass-shadow-deep),
    0 0 0 1px color-mix(in srgb, var(--color-muted-olive) 20%, transparent);
}""",
    """.glass-surface[data-glass="floating"] {
  --glass-veil: color-mix(in srgb, var(--color-lavender-2) 60%, transparent);
  background:
    linear-gradient(color-mix(in srgb, #ffffff 45%, transparent), color-mix(in srgb, #ffffff 45%, transparent)) padding-box,
    linear-gradient(var(--glass-veil), var(--glass-veil)) padding-box,
    linear-gradient(color-mix(in srgb, #ffffff 60%, transparent), color-mix(in srgb, #ffffff 60%, transparent)) padding-box,
    var(--glass-edge-strong) border-box;
  box-shadow:
    inset 1px 1px 0 color-mix(in srgb, #ffffff 75%, transparent),
    inset -1px -1px 0 color-mix(in srgb, var(--color-periwinkle-2) 60%, transparent),
    var(--glass-shadow-deep),
    0 0 0 1px color-mix(in srgb, var(--color-periwinkle-2) 50%, transparent);
}""", 1, 'SURF-FLOAT')

rep(""".glass-surface[data-glass="controls"] {
  --glass-veil: color-mix(in srgb, var(--color-tea-green) 6%, transparent);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--color-frosted-mint) 22%, transparent),
    0 6px 16px -10px color-mix(in srgb, var(--color-shadow-olive) 45%, transparent),
    0 0 0 1px color-mix(in srgb, var(--color-muted-olive) 14%, transparent);
}""",
    """.glass-surface[data-glass="controls"] {
  --glass-veil: color-mix(in srgb, var(--color-lavender-2) 60%, transparent);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, #ffffff 70%, transparent),
    0 6px 16px -10px color-mix(in srgb, var(--color-shadow-blue) 28%, transparent),
    0 0 0 1px color-mix(in srgb, var(--color-periwinkle-2) 45%, transparent);
}""", 1, 'SURF-CTRL')

rep(""".glass-surface.glass-elevated {
  --glass-veil: color-mix(in srgb, var(--color-frosted-mint) 5%, transparent);
  background:
    linear-gradient(var(--glass-veil), var(--glass-veil)) padding-box,
    linear-gradient(color-mix(in srgb, var(--color-shadow-olive) 85%, transparent), color-mix(in srgb, var(--color-shadow-olive) 85%, transparent)) padding-box,
    var(--glass-edge) border-box;
  box-shadow:
    inset 1px 1px 0 color-mix(in srgb, var(--color-frosted-mint) 26%, transparent),
    inset -1px -1px 0 color-mix(in srgb, var(--color-shadow-olive) 35%, transparent),
    0 2px 8px color-mix(in srgb, var(--color-shadow-olive) 35%, transparent),
    0 26px 60px color-mix(in srgb, var(--color-shadow-olive) 40%, transparent),
    0 0 0 1px color-mix(in srgb, var(--color-muted-olive) 18%, transparent);
}""",
    """.glass-surface.glass-elevated {
  --glass-veil: color-mix(in srgb, var(--color-lavender) 72%, transparent);
  background:
    linear-gradient(var(--glass-veil), var(--glass-veil)) padding-box,
    linear-gradient(color-mix(in srgb, #ffffff 58%, transparent), color-mix(in srgb, #ffffff 58%, transparent)) padding-box,
    var(--glass-edge) border-box;
  box-shadow:
    inset 1px 1px 0 color-mix(in srgb, #ffffff 75%, transparent),
    inset -1px -1px 0 color-mix(in srgb, var(--color-periwinkle-2) 60%, transparent),
    0 2px 8px color-mix(in srgb, var(--color-shadow-blue) 22%, transparent),
    0 26px 60px color-mix(in srgb, var(--color-shadow-blue) 24%, transparent),
    0 0 0 1px color-mix(in srgb, var(--color-periwinkle-2) 50%, transparent);
}""", 1, 'SURF-ELEV')

# ---------------- fallbacks ----------------
rep("""/* ---- Graceful fallback: dark frosted optics where url() filters
   are unavailable. Blur here is a stand-in, never the primary material. ---- */""",
    """/* ---- Graceful fallback: light alice optics where url() filters
   are unavailable. Blur here is a stand-in, never the primary material. ---- */""", 1, 'FB-COM')

rep("""  .glass-surface[data-glass="primary"] {
    --glass-veil: color-mix(in srgb, var(--color-frosted-mint) 3%, transparent);
    background:
      linear-gradient(var(--glass-veil), var(--glass-veil)) padding-box,
      linear-gradient(color-mix(in srgb, var(--color-shadow-olive) 75%, transparent), color-mix(in srgb, var(--color-shadow-olive) 75%, transparent)) padding-box,
      var(--glass-edge) border-box;""",
    """  .glass-surface[data-glass="primary"] {
    --glass-veil: color-mix(in srgb, var(--color-alice-blue) 82%, transparent);
    background:
      linear-gradient(var(--glass-veil), var(--glass-veil)) padding-box,
      linear-gradient(color-mix(in srgb, #ffffff 70%, transparent), color-mix(in srgb, #ffffff 70%, transparent)) padding-box,
      var(--glass-edge) border-box;""", 1, 'FB-PRI')

rep("""  .glass-surface[data-glass="secondary"] {
    --glass-veil: color-mix(in srgb, var(--color-tea-green) 3%, transparent);
    background:
      linear-gradient(var(--glass-veil), var(--glass-veil)) padding-box,
      linear-gradient(color-mix(in srgb, var(--color-shadow-olive) 75%, transparent), color-mix(in srgb, var(--color-shadow-olive) 75%, transparent)) padding-box,
      var(--glass-edge-soft) border-box;""",
    """  .glass-surface[data-glass="secondary"] {
    --glass-veil: color-mix(in srgb, var(--color-lavender) 70%, transparent);
    background:
      linear-gradient(var(--glass-veil), var(--glass-veil)) padding-box,
      linear-gradient(color-mix(in srgb, #ffffff 65%, transparent), color-mix(in srgb, #ffffff 65%, transparent)) padding-box,
      var(--glass-edge-soft) border-box;""", 1, 'FB-SEC')

rep("""  .glass-surface[data-glass="floating"] {
    --glass-veil: color-mix(in srgb, var(--color-frosted-mint) 3%, transparent);
    background:
      linear-gradient(var(--glass-veil), var(--glass-veil)) padding-box,
      linear-gradient(color-mix(in srgb, var(--color-shadow-olive) 75%, transparent), color-mix(in srgb, var(--color-shadow-olive) 75%, transparent)) padding-box,
      var(--glass-edge-strong) border-box;""",
    """  .glass-surface[data-glass="floating"] {
    --glass-veil: color-mix(in srgb, var(--color-lavender-2) 62%, transparent);
    background:
      linear-gradient(var(--glass-veil), var(--glass-veil)) padding-box,
      linear-gradient(color-mix(in srgb, #ffffff 68%, transparent), color-mix(in srgb, #ffffff 68%, transparent)) padding-box,
      var(--glass-edge-strong) border-box;""", 1, 'FB-FLOAT')

rep("""  .glass-surface[data-glass="controls"] {
    --glass-veil: color-mix(in srgb, var(--color-tea-green) 3%, transparent);
    background:
      linear-gradient(var(--glass-veil), var(--glass-veil)) padding-box,
      linear-gradient(color-mix(in srgb, var(--color-shadow-olive) 75%, transparent), color-mix(in srgb, var(--color-shadow-olive) 75%, transparent)) padding-box,
      var(--glass-edge-soft) border-box;""",
    """  .glass-surface[data-glass="controls"] {
    --glass-veil: color-mix(in srgb, var(--color-lavender-2) 62%, transparent);
    background:
      linear-gradient(var(--glass-veil), var(--glass-veil)) padding-box,
      linear-gradient(color-mix(in srgb, #ffffff 65%, transparent), color-mix(in srgb, #ffffff 65%, transparent)) padding-box,
      var(--glass-edge-soft) border-box;""", 1, 'FB-CTRL')

rep("""  .glass-surface.glass-elevated {
    --glass-veil: color-mix(in srgb, var(--color-frosted-mint) 3%, transparent);
    background:
      linear-gradient(var(--glass-veil), var(--glass-veil)) padding-box,
      linear-gradient(color-mix(in srgb, var(--color-shadow-olive) 85%, transparent), color-mix(in srgb, var(--color-shadow-olive) 85%, transparent)) padding-box,
      var(--glass-edge) border-box;""",
    """  .glass-surface.glass-elevated {
    --glass-veil: color-mix(in srgb, var(--color-lavender) 74%, transparent);
    background:
      linear-gradient(var(--glass-veil), var(--glass-veil)) padding-box,
      linear-gradient(color-mix(in srgb, #ffffff 72%, transparent), color-mix(in srgb, #ffffff 72%, transparent)) padding-box,
      var(--glass-edge) border-box;""", 1, 'FB-ELEV')

# ---------------- ::before optics (geometry untouched) ----------------
rep("""    radial-gradient(210px 72px at 20% 1%, color-mix(in srgb, var(--color-frosted-mint) 30%, transparent), transparent 70%),
    radial-gradient(130% 100% at 8% -18%, color-mix(in srgb, var(--color-frosted-mint) 22%, transparent), transparent 48%),
    radial-gradient(80px 80px at 100% 0%, color-mix(in srgb, var(--color-tea-green) 35%, transparent), transparent 70%),
    radial-gradient(110px 80px at 0% 100%, color-mix(in srgb, var(--color-frosted-mint) 30%, transparent), transparent 70%),
    radial-gradient(100px 70px at 90% 108%, color-mix(in srgb, var(--color-frosted-mint) 14%, transparent), transparent 70%);""",
    """    radial-gradient(210px 72px at 20% 1%, color-mix(in srgb, #ffffff 38%, transparent), transparent 70%),
    radial-gradient(130% 100% at 8% -18%, color-mix(in srgb, #ffffff 30%, transparent), transparent 48%),
    radial-gradient(80px 80px at 100% 0%, color-mix(in srgb, var(--color-periwinkle-3) 30%, transparent), transparent 70%),
    radial-gradient(110px 80px at 0% 100%, color-mix(in srgb, #ffffff 38%, transparent), transparent 70%),
    radial-gradient(100px 70px at 90% 108%, color-mix(in srgb, var(--color-periwinkle-2) 22%, transparent), transparent 70%);""", 1, 'BEFORE')

rep("  background: radial-gradient(130% 100% at 8% -18%, color-mix(in srgb, var(--color-tea-green) 22%, transparent), transparent 48%);",
    "  background: radial-gradient(130% 100% at 8% -18%, color-mix(in srgb, var(--color-periwinkle-3) 20%, transparent), transparent 48%);", 1, 'BEFORE-SEC')
rep("  background: linear-gradient(180deg, color-mix(in srgb, var(--color-frosted-mint) 30%, transparent), transparent 55%);",
    "  background: linear-gradient(180deg, color-mix(in srgb, #ffffff 40%, transparent), transparent 55%);", 1, 'BEFORE-CTRL')

# ---------------- hover / active / selected ----------------
rep("""  box-shadow:
    inset 1px 1px 0 color-mix(in srgb, var(--color-frosted-mint) 30%, transparent),
    inset -1px -1px 0 color-mix(in srgb, var(--color-shadow-olive) 35%, transparent),
    0 4px 12px color-mix(in srgb, var(--color-shadow-olive) 40%, transparent),
    0 30px 65px color-mix(in srgb, var(--color-shadow-olive) 45%, transparent),
    0 0 0 1px color-mix(in srgb, var(--color-muted-olive) 20%, transparent);""",
    """  box-shadow:
    inset 1px 1px 0 color-mix(in srgb, #ffffff 45%, transparent),
    inset -1px -1px 0 color-mix(in srgb, var(--color-periwinkle-2) 55%, transparent),
    0 4px 12px color-mix(in srgb, var(--color-shadow-blue) 26%, transparent),
    0 30px 65px color-mix(in srgb, var(--color-shadow-blue) 28%, transparent),
    0 0 0 1px color-mix(in srgb, var(--color-periwinkle-2) 50%, transparent);""", 1, 'HOVER')

rep("  --glass-veil: color-mix(in srgb, var(--color-frosted-mint) 10%, transparent);",
    "  --glass-veil: color-mix(in srgb, var(--color-lavender-2) 70%, transparent);", 1, 'HOVER-ACT')

rep("""/* Selected state (selectable glass rows/cards): frosted-mint presence + ring */
.glass-selected {
  --glass-veil: color-mix(in srgb, var(--color-frosted-mint) 4%, transparent);
  box-shadow:
    0 0 0 1.5px color-mix(in srgb, var(--color-frosted-mint) 65%, transparent),
    inset 1px 1px 0 color-mix(in srgb, var(--color-frosted-mint) 30%, transparent),
    0 14px 34px color-mix(in srgb, var(--color-shadow-olive) 45%, transparent);
}""",
    """/* Selected state (selectable glass rows/cards): baby-blue-ice presence + ring */
.glass-selected {
  --glass-veil: color-mix(in srgb, var(--color-periwinkle-2) 35%, transparent);
  box-shadow:
    0 0 0 1.5px color-mix(in srgb, var(--color-baby-blue-ice) 65%, transparent),
    inset 1px 1px 0 color-mix(in srgb, #ffffff 50%, transparent),
    0 14px 34px color-mix(in srgb, var(--color-shadow-blue) 28%, transparent);
}""", 1, 'SELECTED')

# ---------------- buttons ----------------
rep(""".btn-primary {
  background: var(--color-frosted-mint);
  color: var(--color-shadow-olive);
  box-shadow: inset 0 1px 0 0 color-mix(in srgb, var(--color-frosted-mint) 45%, transparent), 0 8px 20px -8px color-mix(in srgb, var(--color-shadow-olive) 60%, transparent);
  transition: transform 0.3s var(--glass-ease), box-shadow 0.3s ease, background 0.3s ease;
}
.btn-primary:hover {
  transform: translateY(-1px);
  background: var(--color-tea-green);
  box-shadow: inset 0 1px 0 0 color-mix(in srgb, var(--color-frosted-mint) 50%, transparent), 0 12px 26px -8px color-mix(in srgb, var(--color-shadow-olive) 65%, transparent);
}
.btn-primary:active { transform: translateY(0) scale(0.985); background: var(--color-muted-olive); }""",
    """.btn-primary {
  background: var(--color-periwinkle-3);
  color: var(--color-text-primary);
  box-shadow: inset 0 1px 0 0 color-mix(in srgb, #ffffff 60%, transparent), 0 8px 20px -8px color-mix(in srgb, var(--color-shadow-blue) 35%, transparent);
  transition: transform 0.3s var(--glass-ease), box-shadow 0.3s ease, background 0.3s ease;
}
.btn-primary:hover {
  transform: translateY(-1px);
  background: var(--color-baby-blue-ice);
  box-shadow: inset 0 1px 0 0 color-mix(in srgb, #ffffff 65%, transparent), 0 12px 26px -8px color-mix(in srgb, var(--color-shadow-blue) 40%, transparent);
}
.btn-primary:active { transform: translateY(0) scale(0.985); background: var(--color-periwinkle-2); }""", 1, 'BTN-PRI')

rep("""  --glass-veil: color-mix(in srgb, var(--color-frosted-mint) 5%, transparent);
  background:
    linear-gradient(var(--glass-veil), var(--glass-veil)) padding-box,
    linear-gradient(color-mix(in srgb, var(--color-shadow-olive) 45%, transparent), color-mix(in srgb, var(--color-shadow-olive) 45%, transparent)) padding-box,
    linear-gradient(135deg,
      color-mix(in srgb, var(--color-frosted-mint) 38%, transparent) 0%,
      color-mix(in srgb, var(--color-frosted-mint) 22%, transparent) 45%,
      color-mix(in srgb, var(--color-muted-olive) 30%, transparent) 100%) border-box;
  color: var(--color-frosted-mint);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--color-frosted-mint) 25%, transparent),
    0 6px 16px -10px color-mix(in srgb, var(--color-shadow-olive) 50%, transparent);""",
    """  --glass-veil: color-mix(in srgb, var(--color-lavender-2) 62%, transparent);
  background:
    linear-gradient(var(--glass-veil), var(--glass-veil)) padding-box,
    linear-gradient(color-mix(in srgb, #ffffff 52%, transparent), color-mix(in srgb, #ffffff 52%, transparent)) padding-box,
    linear-gradient(135deg,
      color-mix(in srgb, #ffffff 70%, transparent) 0%,
      color-mix(in srgb, var(--color-periwinkle-2) 55%, transparent) 45%,
      color-mix(in srgb, var(--color-periwinkle-3) 50%, transparent) 100%) border-box;
  color: var(--color-text-primary);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, #ffffff 65%, transparent),
    0 6px 16px -10px color-mix(in srgb, var(--color-shadow-blue) 30%, transparent);""", 1, 'BTN-GLASS')

rep("""    --glass-veil: color-mix(in srgb, var(--color-frosted-mint) 5%, transparent);
    backdrop-filter: blur(8px) saturate(1.22);""",
    """    --glass-veil: color-mix(in srgb, var(--color-lavender-2) 62%, transparent);
    backdrop-filter: blur(8px) saturate(1.22);""", 1, 'BTN-GLASS-FB')

rep("  background: linear-gradient(180deg, color-mix(in srgb, var(--color-frosted-mint) 35%, transparent), transparent 60%);",
    "  background: linear-gradient(180deg, color-mix(in srgb, #ffffff 45%, transparent), transparent 60%);", 1, 'BTN-GLASS-BEFORE')

rep("""  --glass-veil: color-mix(in srgb, var(--color-frosted-mint) 6%, transparent);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--color-frosted-mint) 35%, transparent),
    0 10px 22px -10px color-mix(in srgb, var(--color-shadow-olive) 55%, transparent);""",
    """  --glass-veil: color-mix(in srgb, var(--color-periwinkle-2) 70%, transparent);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, #ffffff 70%, transparent),
    0 10px 22px -10px color-mix(in srgb, var(--color-shadow-blue) 32%, transparent);""", 1, 'BTN-GLASS-HOV')

rep(""".btn-ghost {
  color: var(--color-frosted-mint);
  border: 1px solid color-mix(in srgb, var(--color-muted-olive-2) 45%, transparent);
  border-radius: 10px;
  transition: color 0.2s ease, background 0.2s ease;
}
.btn-ghost:hover {
  color: var(--color-frosted-mint);
  background: color-mix(in srgb, var(--color-palm-leaf) 25%, transparent);
}""",
    """.btn-ghost {
  color: var(--color-text-primary);
  border: 1px solid color-mix(in srgb, var(--color-periwinkle-2) 50%, transparent);
  border-radius: 10px;
  transition: color 0.2s ease, background 0.2s ease;
}
.btn-ghost:hover {
  color: var(--color-text-primary);
  background: color-mix(in srgb, var(--color-lavender-2) 70%, transparent);
}""", 1, 'BTN-GHOST')

# ---------------- fields ----------------
rep(""".field {
  border: 1px solid color-mix(in srgb, var(--color-muted-olive) 45%, transparent);
  border-radius: 10px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--color-tea-green) 10%, transparent), transparent 55%),
    color-mix(in srgb, var(--color-shadow-olive) 55%, transparent);
  color: var(--color-frosted-mint);""",
    """.field {
  border: 1px solid color-mix(in srgb, var(--color-periwinkle-2) 70%, transparent);
  border-radius: 10px;
  background:
    linear-gradient(180deg, color-mix(in srgb, #ffffff 35%, transparent), transparent 55%),
    color-mix(in srgb, #ffffff 60%, transparent);
  color: var(--color-text-primary);""", 1, 'FIELD')

rep("""  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--color-frosted-mint) 12%, transparent),
    0 4px 12px -8px color-mix(in srgb, var(--color-shadow-olive) 50%, transparent);""",
    """  box-shadow:
    inset 0 1px 0 color-mix(in srgb, #ffffff 50%, transparent),
    0 4px 12px -8px color-mix(in srgb, var(--color-shadow-blue) 22%, transparent);""", 1, 'FIELD-SH')

rep("""  .field {
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--color-tea-green) 10%, transparent), transparent 55%),
      color-mix(in srgb, var(--color-shadow-olive) 55%, transparent);
    backdrop-filter: blur(8px) saturate(1.20);""",
    """  .field {
    background:
      linear-gradient(180deg, color-mix(in srgb, #ffffff 35%, transparent), transparent 55%),
      color-mix(in srgb, #ffffff 60%, transparent);
    backdrop-filter: blur(8px) saturate(1.20);""", 1, 'FIELD-FB')

rep(".field::placeholder { color: var(--color-muted-olive); }",
    ".field::placeholder { color: var(--color-text-muted); }", 1, 'FIELD-PH')

rep(""".field:focus-within,
.field:focus {
  outline: none;
  border-color: var(--color-frosted-mint);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--color-tea-green) 10%, transparent), transparent 55%),
    color-mix(in srgb, var(--color-shadow-olive) 55%, transparent);
  box-shadow:
    0 0 0 1px var(--color-frosted-mint),
    0 0 0 4px color-mix(in srgb, var(--color-frosted-mint) 20%, transparent),
    inset 0 1px 0 color-mix(in srgb, var(--color-frosted-mint) 15%, transparent);
}""",
    """.field:focus-within,
.field:focus {
  outline: none;
  border-color: var(--color-baby-blue-ice);
  background:
    linear-gradient(180deg, color-mix(in srgb, #ffffff 35%, transparent), transparent 55%),
    color-mix(in srgb, #ffffff 60%, transparent);
  box-shadow:
    0 0 0 1px var(--color-baby-blue-ice),
    0 0 0 4px color-mix(in srgb, var(--color-baby-blue-ice) 35%, transparent),
    inset 0 1px 0 color-mix(in srgb, #ffffff 50%, transparent);
}""", 1, 'FIELD-FOCUS')

rep("/* Native controls follow the dark theme */", "/* Native controls follow the light theme */", 1, 'RANGE-COM')
rep("""input[type="range"] {
  accent-color: var(--color-muted-olive-2);
}""",
    """input[type="range"] {
  accent-color: var(--color-periwinkle-3);
}""", 1, 'RANGE')

# ---------------- tables / tree ----------------
rep("""  color: var(--color-tea-green);
  border-bottom: 1px solid color-mix(in srgb, var(--color-muted-olive) 25%, transparent);""",
    """  color: var(--color-text-secondary);
  background: color-mix(in srgb, var(--color-lavender) 60%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--color-periwinkle-2) 70%, transparent);""", 1, 'TABLE-TH')

rep(""".data-table tbody tr:nth-child(even) { background: color-mix(in srgb, var(--color-frosted-mint) 4%, transparent); }
.data-table tbody tr:hover { background: color-mix(in srgb, var(--color-tea-green) 10%, transparent); }""",
    """.data-table tbody tr:nth-child(even) { background: color-mix(in srgb, #ffffff 30%, transparent); }
.data-table tbody tr:hover { background: color-mix(in srgb, var(--color-lavender-2) 60%, transparent); }
.data-table tbody tr[data-selected='true'] { background: color-mix(in srgb, var(--color-periwinkle) 55%, transparent); }""", 1, 'TABLE-ROWS')

rep("  border-bottom: 1px solid color-mix(in srgb, var(--color-muted-olive-2) 15%, transparent);",
    "  border-bottom: 1px solid color-mix(in srgb, var(--color-periwinkle-2) 50%, transparent);", 1, 'TABLE-TD')

rep(""".tree-active {
  background: color-mix(in srgb, var(--color-palm-leaf) 25%, transparent) !important;
  border: 1px solid color-mix(in srgb, var(--color-frosted-mint) 40%, transparent) !important;
  color: var(--color-frosted-mint) !important;
  box-shadow:
    inset 2px 0 0 0 var(--color-frosted-mint),
    inset 0 1px 0 color-mix(in srgb, var(--color-frosted-mint) 20%, transparent),
    0 6px 16px -8px color-mix(in srgb, var(--color-shadow-olive) 50%, transparent);
}""",
    """.tree-active {
  background: color-mix(in srgb, var(--color-periwinkle-2) 70%, transparent) !important;
  border: 1px solid color-mix(in srgb, var(--color-periwinkle-3) 60%, transparent) !important;
  color: var(--color-text-primary) !important;
  box-shadow:
    inset 2px 0 0 0 var(--color-baby-blue-ice),
    inset 0 1px 0 color-mix(in srgb, #ffffff 60%, transparent),
    0 6px 16px -8px color-mix(in srgb, var(--color-shadow-blue) 28%, transparent);
}""", 1, 'TREE')

# ---------------- scrollbar / skeleton / code / tt / recharts ----------------
rep("  scrollbar-color: color-mix(in srgb, var(--color-muted-olive-2) 50%, transparent) transparent;",
    "  scrollbar-color: color-mix(in srgb, var(--color-periwinkle-3) 60%, transparent) transparent;", 1, 'SCROLL')
rep("  background: color-mix(in srgb, var(--color-muted-olive-2) 45%, transparent);",
    "  background: color-mix(in srgb, var(--color-periwinkle-3) 55%, transparent);", 1, 'SCROLL-WK')

rep("  background: linear-gradient(90deg, color-mix(in srgb, var(--color-muted-olive) 10%, transparent) 25%, color-mix(in srgb, var(--color-frosted-mint) 22%, transparent) 50%, color-mix(in srgb, var(--color-muted-olive) 10%, transparent) 75%);",
    "  background: linear-gradient(90deg, color-mix(in srgb, var(--color-periwinkle-2) 40%, transparent) 25%, color-mix(in srgb, #ffffff 55%, transparent) 50%, color-mix(in srgb, var(--color-periwinkle-2) 40%, transparent) 75%);", 1, 'SKELETON')

rep("""/* ---------- Code editor (shadow-olive technical surface) ---------- */
.code-dark {
  background: linear-gradient(180deg, color-mix(in srgb, var(--color-dusty-olive) 25%, var(--color-shadow-olive)) 0%, var(--color-shadow-olive) 100%);
  border: 1px solid color-mix(in srgb, var(--color-muted-olive) 20%, transparent);
  box-shadow: inset 0 1px 0 0 color-mix(in srgb, var(--color-frosted-mint) 8%, transparent), 0 18px 46px -14px color-mix(in srgb, var(--color-shadow-olive) 60%, transparent);
}
.code-dark textarea, .code-dark pre {""",
    """/* ---------- Code editor (alice-blue technical surface) ---------- */
.code-panel {
  background: linear-gradient(180deg, var(--color-alice-blue) 0%, var(--color-lavender) 100%);
  border: 1px solid color-mix(in srgb, var(--color-periwinkle-2) 70%, transparent);
  box-shadow: inset 0 1px 0 0 color-mix(in srgb, #ffffff 60%, transparent), 0 18px 46px -14px color-mix(in srgb, var(--color-shadow-blue) 30%, transparent);
}
.code-panel textarea, .code-panel pre {""", 1, 'CODE')

rep(""".tt-cell { border-left: 1px solid color-mix(in srgb, var(--color-muted-olive-2) 15%, transparent); }
.tt-row { border-top: 1px solid color-mix(in srgb, var(--color-muted-olive-2) 15%, transparent); }""",
    """.tt-cell { border-left: 1px solid color-mix(in srgb, var(--color-periwinkle-2) 50%, transparent); }
.tt-row { border-top: 1px solid color-mix(in srgb, var(--color-periwinkle-2) 50%, transparent); }""", 1, 'TT')

rep(""".recharts-cartesian-axis-tick text {
  font-family: var(--font-sans);
  font-size: 11px;
  fill: var(--color-tea-green);
}""",
    """.recharts-cartesian-axis-tick text {
  font-family: var(--font-sans);
  font-size: 11px;
  fill: var(--color-text-secondary);
}""", 1, 'TICKS')

rep(""".recharts-default-tooltip {
  background: color-mix(in srgb, var(--color-shadow-olive) 94%, transparent) !important;
  border: 1px solid color-mix(in srgb, var(--color-muted-olive) 25%, transparent) !important;
  border-radius: 12px !important;
  box-shadow: 0 12px 30px color-mix(in srgb, var(--color-shadow-olive) 50%, transparent) !important;
  font-family: var(--font-sans);
}
.recharts-tooltip-label { color: var(--color-frosted-mint) !important; }
.recharts-tooltip-item { color: var(--color-tea-green) !important; }""",
    """.recharts-default-tooltip {
  background: color-mix(in srgb, var(--color-alice-blue) 95%, transparent) !important;
  border: 1px solid color-mix(in srgb, var(--color-periwinkle-2) 60%, transparent) !important;
  border-radius: 12px !important;
  box-shadow: 0 12px 30px color-mix(in srgb, var(--color-shadow-blue) 30%, transparent) !important;
  font-family: var(--font-sans);
}
.recharts-tooltip-label { color: var(--color-text-primary) !important; }
.recharts-tooltip-item { color: var(--color-text-secondary) !important; }""", 1, 'RECHARTS')

# ---------------- responsive ----------------
rep("   Mobile: dark frosted fallback — translucent, edged, deep. */",
    "   Mobile: light alice fallback — translucent, edged, luminous. */", 1, 'RESP-COM')
rep("""  .glass-surface[data-glass] {
    --glass-veil: color-mix(in srgb, var(--color-frosted-mint) 5%, transparent);
    background:
      linear-gradient(var(--glass-veil), var(--glass-veil)) padding-box,
      linear-gradient(color-mix(in srgb, var(--color-shadow-olive) 80%, transparent), color-mix(in srgb, var(--color-shadow-olive) 80%, transparent)) padding-box,
      var(--glass-edge) border-box;""",
    """  .glass-surface[data-glass] {
    --glass-veil: color-mix(in srgb, var(--color-alice-blue) 82%, transparent);
    background:
      linear-gradient(var(--glass-veil), var(--glass-veil)) padding-box,
      linear-gradient(color-mix(in srgb, #ffffff 72%, transparent), color-mix(in srgb, #ffffff 72%, transparent)) padding-box,
      var(--glass-edge) border-box;""", 1, 'MOBILE')

# ---------------- asserts ----------------
AZERO = [r'(?i)olive', r'(?i)frosted', r'tea-green', r'code-dark', r'color-scheme: dark',
         r'#E9F5DB', r'#CFE1B9', r'#B5C99A', r'#97A97C', r'#87986A', r'#718355',
         r'#414E30', r'#e9f5db', r'#cfe1b9', r'#b5c99a', r'#97a97c', r'#87986a',
         r'#718355', r'#414e30', r'#c6a35f', r'#cf8d8d', r'Frosted Mint', r'Deep Sea',
         r'dark frosted', r'linear-gradient\(color-mix\(in srgb, var\(--color-shadow-blue\)']
for pat in AZERO:
    n = len(re.findall(pat, css))
    print(f'AZERO {pat}: {n}')
    if n != 0:
        fails.append(f'AZERO {pat}: {n} remain')

for tok, minimum in [('--color-alice-blue:', 1), ('--color-lavender:', 1),
                     ('--color-lavender-2:', 1), ('--color-periwinkle:', 1),
                     ('--color-periwinkle-2:', 1), ('--color-periwinkle-3:', 1),
                     ('--color-baby-blue-ice:', 1), ('--color-text-primary:', 1),
                     ('--color-text-secondary:', 1), ('--color-text-muted:', 1),
                     ('--color-shadow-blue:', 1), ('--color-success:', 1),
                     ('Alice Blue', 2), ('.code-panel', 2), ('color-scheme: light', 1),
                     ('data-selected', 1), ('shadow-blue', 20)]:
    n = css.count(tok)
    print(f'HAS {tok}: {n}')
    if n < minimum:
        fails.append(f'HAS {tok}: {n} < {minimum}')

if fails:
    print('\nFAIL:')
    for f in fails:
        print('  ' + f)
    print('Leftovers:')
    for i, line in enumerate(css.splitlines(), 1):
        if re.search(r'(?i)olive|frosted|tea-green|code-dark|E9F5DB|CFE1B9|B5C99A|97A97C|87986A|718355|414E30|c6a35f|cf8d8d', line):
            print(f'  L{i}: {line.strip()[:150]}')
    sys.exit(1)

P.write_text(css)
print('SUCCESS: WROTE src/glass.css')

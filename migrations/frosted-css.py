"""Frosted Mint glass.css migration v2: dry-run ALL pairs, assert, then write (or exit 1, no writes)."""
import re, sys

F = 'src/glass.css'
t = open(F).read()
FAIL = []

def rep(old, new, expect=None, tag=''):
    global t
    n = t.count(old)
    if n:
        t = t.replace(old, new)
    print(f'{tag or old[:50]!r}: {n}' + (f' (want {expect})' if expect is not None else ''))
    if expect is not None and n != expect:
        FAIL.append(f'{tag}: got {n}, want {expect}')

def azero(pat, label):
    n = len(re.findall(pat, t))
    print(f'{label}: remaining={n}')
    if n:
        FAIL.append(label)

# ---- @theme + comments ----
rep("""  /* Deep Sea (Coolors popular monochrome, 27.6K) — single source of truth */
  --color-ink-100: #E0E1DD;
  --color-ink-300: #778DA9;
  --color-ink-500: #415A77;
  --color-ink-700: #1B263B;
  --color-ink-900: #0D1B2A;

  /* Restrained semantic accents — secondary to the monochrome system */
  --color-success: #7fa98c;
  --color-warning: #c6a35f;
  --color-error: #c08080;""",
"""  /* Frosted Mint monochrome + deep-olive shadow anchor — single source of truth */
  --color-frosted-mint: #E9F5DB;
  --color-tea-green: #CFE1B9;
  --color-muted-olive: #B5C99A;
  --color-muted-olive-2: #97A97C;
  --color-palm-leaf: #87986A;
  --color-dusty-olive: #718355;
  --color-shadow-olive: #414E30;

  /* Restrained semantic accents — secondary to the monochrome system */
  --color-warning: #c6a35f;
  --color-error: #cf8d8d;""", 1, 'C1-theme')
rep("/* Component shadows: ink-900 contact + ink-100 inner light */",
    "/* Component shadows: shadow-olive contact + frosted-mint inner light */", 1, 'C1b-shadowcomment')
rep("/* ---------- GlassSurface tokens (Deep Sea monochrome) ----------",
    "/* ---------- GlassSurface tokens (Frosted Mint monochrome) ----------", 1, 'C1c-tokcomment')
rep("/* Refractive rims: ink-100 bright upper-left -> ink-500 lower-right */",
    "/* Refractive rims: frosted-mint bright upper-left -> muted-olive lower-right */", 1, 'C1d-edgecomment')
rep("""/* Deep Sea atmosphere: predominantly dark ink, faint mist illumination —
   never flat, never pastel. */""",
"""/* Frosted Mint atmosphere: dusty-olive depth, palm blooms, muted light —
   never flat, never neon. */""", 1, 'C1e-bodycomment')
rep("/* The recognizable scene behind the glass: ink-500 band + ink-100 pools */",
    "/* The recognizable scene behind the glass: muted-olive band + frosted-mint pools */", 1, 'C1f-meshcomment')
rep("""   with a screen-blend ink-100 light layer, a refractive rim and
   deep ink-900 shadows. Content above stays sharp. Blur is fallback only.""",
"""   with a screen-blend frosted-mint light layer, a refractive rim and
   deep shadow-olive shadows. Content above stays sharp. Blur is fallback only.""", 1, 'C1g-headercomment')
rep("/* Selected state (selectable glass rows/cards): ink-100 presence + ring */",
    "/* Selected state (selectable glass rows/cards): frosted-mint presence + ring */", 1, 'C1h-selcomment')
rep("/* ---------- Code editor (ink technical surface) ---------- */",
    "/* ---------- Code editor (shadow-olive technical surface) ---------- */", 1, 'C1i-codecomment')

# ---- body canvas + mesh ----
rep("""  background:
    radial-gradient(120% 120% at 50% 38%, transparent 60%, color-mix(in srgb, var(--color-ink-900) 55%, transparent) 100%),
    radial-gradient(900px 500px at 12% -6%, color-mix(in srgb, var(--color-ink-500) 22%, transparent), transparent 60%),
    radial-gradient(760px 520px at 88% 8%, color-mix(in srgb, var(--color-ink-500) 12%, transparent), transparent 60%),
    radial-gradient(820px 620px at 85% 95%, color-mix(in srgb, var(--color-ink-500) 18%, transparent), transparent 62%),
    radial-gradient(700px 560px at 8% 96%, color-mix(in srgb, var(--color-ink-500) 10%, transparent), transparent 62%),
    radial-gradient(1000px 700px at 50% 45%, color-mix(in srgb, var(--color-ink-100) 5%, transparent), transparent 65%),
    linear-gradient(135deg, var(--color-ink-700) 0%, var(--color-ink-900) 55%, var(--color-ink-900) 100%);""",
"""  background:
    radial-gradient(90% 75% at 50% 42%, color-mix(in srgb, var(--color-shadow-olive) 88%, transparent), transparent 72%),
    radial-gradient(900px 500px at 12% -6%, color-mix(in srgb, var(--color-palm-leaf) 40%, transparent), transparent 60%),
    radial-gradient(760px 520px at 88% 8%, color-mix(in srgb, var(--color-muted-olive) 28%, transparent), transparent 60%),
    radial-gradient(820px 620px at 85% 95%, color-mix(in srgb, var(--color-palm-leaf) 35%, transparent), transparent 62%),
    radial-gradient(700px 560px at 8% 96%, color-mix(in srgb, var(--color-tea-green) 22%, transparent), transparent 62%),
    radial-gradient(1000px 700px at 50% 45%, color-mix(in srgb, var(--color-muted-olive) 18%, transparent), transparent 65%),
    linear-gradient(135deg, var(--color-dusty-olive) 0%, var(--color-palm-leaf) 55%, var(--color-dusty-olive) 100%);""", 1, 'C2-body')
rep("""  background:
    linear-gradient(115deg, transparent 40%, color-mix(in srgb, var(--color-ink-500) 10%, transparent) 47%, transparent 56%),
    radial-gradient(560px 300px at 22% 18%, color-mix(in srgb, var(--color-ink-100) 7%, transparent), transparent 65%),
    radial-gradient(640px 360px at 80% 74%, color-mix(in srgb, var(--color-ink-500) 16%, transparent), transparent 65%),
    radial-gradient(420px 420px at 62% 38%, color-mix(in srgb, var(--color-ink-500) 10%, transparent), transparent 70%);""",
"""  background:
    linear-gradient(115deg, transparent 40%, color-mix(in srgb, var(--color-muted-olive) 10%, transparent) 47%, transparent 56%),
    radial-gradient(560px 300px at 22% 18%, color-mix(in srgb, var(--color-tea-green) 7%, transparent), transparent 65%),
    radial-gradient(640px 360px at 80% 74%, color-mix(in srgb, var(--color-dusty-olive) 16%, transparent), transparent 65%),
    radial-gradient(420px 420px at 62% 38%, color-mix(in srgb, var(--color-muted-olive) 10%, transparent), transparent 70%);""", 1, 'C3-mesh')

# ---- selection ----
rep("""::selection {
  background: color-mix(in srgb, var(--color-ink-300) 35%, transparent);
  color: var(--color-ink-100);
}""",
"""::selection {
  background: color-mix(in srgb, var(--color-tea-green) 70%, transparent);
  color: var(--color-shadow-olive);
}""", 1, 'C27-selection')

# ---- primary / secondary / floating / controls / elevated ----
rep("  --glass-veil: color-mix(in srgb, var(--color-ink-100) 10%, transparent);",
    "  --glass-veil: color-mix(in srgb, var(--color-frosted-mint) 5%, transparent);", 2, 'C5a-veil')
rep("""  background:
    linear-gradient(color-mix(in srgb, var(--color-ink-100) 10%, transparent), color-mix(in srgb, var(--color-ink-100) 10%, transparent)) padding-box,
    linear-gradient(var(--glass-veil), var(--glass-veil)) padding-box,
    var(--glass-edge) border-box;""",
"""  background:
    linear-gradient(color-mix(in srgb, var(--color-frosted-mint) 7%, transparent), color-mix(in srgb, var(--color-frosted-mint) 7%, transparent)) padding-box,
    linear-gradient(var(--glass-veil), var(--glass-veil)) padding-box,
    linear-gradient(color-mix(in srgb, var(--color-shadow-olive) 30%, transparent), color-mix(in srgb, var(--color-shadow-olive) 30%, transparent)) padding-box,
    var(--glass-edge) border-box;""", 1, 'C5b-bg')
rep(""".glass-surface[data-glass="secondary"] {
  --glass-veil: color-mix(in srgb, var(--color-ink-300) 8%, transparent);""",
""".glass-surface[data-glass="secondary"] {
  --glass-veil: color-mix(in srgb, var(--color-tea-green) 5%, transparent);""", 1, 'C6a-secveil')
rep("""    linear-gradient(color-mix(in srgb, var(--color-ink-300) 8%, transparent), color-mix(in srgb, var(--color-ink-300) 8%, transparent)) padding-box,
    linear-gradient(var(--glass-veil), var(--glass-veil)) padding-box,
    var(--glass-edge-soft) border-box;""",
"""    linear-gradient(color-mix(in srgb, var(--color-tea-green) 5%, transparent), color-mix(in srgb, var(--color-tea-green) 5%, transparent)) padding-box,
    linear-gradient(var(--glass-veil), var(--glass-veil)) padding-box,
    linear-gradient(color-mix(in srgb, var(--color-shadow-olive) 20%, transparent), color-mix(in srgb, var(--color-shadow-olive) 20%, transparent)) padding-box,
    var(--glass-edge-soft) border-box;""", 1, 'C6b-secbg')
rep("  --glass-veil: color-mix(in srgb, var(--color-ink-500) 16%, transparent);",
    "  --glass-veil: color-mix(in srgb, var(--color-frosted-mint) 5%, transparent);", 1, 'C8a-floatveil')
rep("""    linear-gradient(color-mix(in srgb, var(--color-ink-500) 14%, transparent), color-mix(in srgb, var(--color-ink-500) 14%, transparent)) padding-box,
    linear-gradient(var(--glass-veil), var(--glass-veil)) padding-box,
    var(--glass-edge-strong) border-box;""",
"""    linear-gradient(color-mix(in srgb, var(--color-frosted-mint) 6%, transparent), color-mix(in srgb, var(--color-frosted-mint) 6%, transparent)) padding-box,
    linear-gradient(var(--glass-veil), var(--glass-veil)) padding-box,
    linear-gradient(color-mix(in srgb, var(--color-shadow-olive) 70%, transparent), color-mix(in srgb, var(--color-shadow-olive) 70%, transparent)) padding-box,
    var(--glass-edge-strong) border-box;""", 1, 'C8b-floatbg')
rep(""".glass-surface[data-glass="controls"] {
  --glass-veil: color-mix(in srgb, var(--color-ink-300) 8%, transparent);""",
""".glass-surface[data-glass="controls"] {
  --glass-veil: color-mix(in srgb, var(--color-tea-green) 6%, transparent);""", 1, 'C9-controls')
rep(""".glass-surface.glass-elevated {
  --glass-veil: color-mix(in srgb, var(--color-ink-100) 13%, transparent);""",
""".glass-surface.glass-elevated {
  --glass-veil: color-mix(in srgb, var(--color-frosted-mint) 5%, transparent);
  background:
    linear-gradient(var(--glass-veil), var(--glass-veil)) padding-box,
    linear-gradient(color-mix(in srgb, var(--color-shadow-olive) 85%, transparent), color-mix(in srgb, var(--color-shadow-olive) 85%, transparent)) padding-box,
    var(--glass-edge) border-box;""", 1, 'C7-elev')

# ---- fallbacks (veil/03 + grounding/75 bg override) ----
rep("""  .glass-surface[data-glass="primary"] {
    --glass-veil: color-mix(in srgb, var(--color-ink-100) 30%, transparent);
    backdrop-filter: blur(16px) saturate(1.25) brightness(1.04);
    -webkit-backdrop-filter: blur(16px) saturate(1.25) brightness(1.04);
  }""",
"""  .glass-surface[data-glass="primary"] {
    --glass-veil: color-mix(in srgb, var(--color-frosted-mint) 3%, transparent);
    background:
      linear-gradient(var(--glass-veil), var(--glass-veil)) padding-box,
      linear-gradient(color-mix(in srgb, var(--color-shadow-olive) 75%, transparent), color-mix(in srgb, var(--color-shadow-olive) 75%, transparent)) padding-box,
      var(--glass-edge) border-box;
    backdrop-filter: blur(16px) saturate(1.25) brightness(1.04);
    -webkit-backdrop-filter: blur(16px) saturate(1.25) brightness(1.04);
  }""", 1, 'C25a-fb')
rep("""  .glass-surface[data-glass="secondary"] {
    --glass-veil: color-mix(in srgb, var(--color-ink-300) 18%, transparent);
    backdrop-filter: blur(10px) saturate(1.22);
    -webkit-backdrop-filter: blur(10px) saturate(1.22);
  }""",
"""  .glass-surface[data-glass="secondary"] {
    --glass-veil: color-mix(in srgb, var(--color-tea-green) 3%, transparent);
    background:
      linear-gradient(var(--glass-veil), var(--glass-veil)) padding-box,
      linear-gradient(color-mix(in srgb, var(--color-shadow-olive) 75%, transparent), color-mix(in srgb, var(--color-shadow-olive) 75%, transparent)) padding-box,
      var(--glass-edge-soft) border-box;
    backdrop-filter: blur(10px) saturate(1.22);
    -webkit-backdrop-filter: blur(10px) saturate(1.22);
  }""", 1, 'C25b-fb')
rep("""  .glass-surface[data-glass="floating"] {
    --glass-veil: color-mix(in srgb, var(--color-ink-500) 38%, transparent);
    backdrop-filter: blur(20px) saturate(1.30) brightness(1.05);
    -webkit-backdrop-filter: blur(20px) saturate(1.30) brightness(1.05);
  }""",
"""  .glass-surface[data-glass="floating"] {
    --glass-veil: color-mix(in srgb, var(--color-frosted-mint) 3%, transparent);
    background:
      linear-gradient(var(--glass-veil), var(--glass-veil)) padding-box,
      linear-gradient(color-mix(in srgb, var(--color-shadow-olive) 75%, transparent), color-mix(in srgb, var(--color-shadow-olive) 75%, transparent)) padding-box,
      var(--glass-edge-strong) border-box;
    backdrop-filter: blur(20px) saturate(1.30) brightness(1.05);
    -webkit-backdrop-filter: blur(20px) saturate(1.30) brightness(1.05);
  }""", 1, 'C25c-fb')
rep("""  .glass-surface[data-glass="controls"] {
    --glass-veil: color-mix(in srgb, var(--color-ink-300) 22%, transparent);
    backdrop-filter: blur(8px) saturate(1.22);
    -webkit-backdrop-filter: blur(8px) saturate(1.22);
  }""",
"""  .glass-surface[data-glass="controls"] {
    --glass-veil: color-mix(in srgb, var(--color-tea-green) 3%, transparent);
    background:
      linear-gradient(var(--glass-veil), var(--glass-veil)) padding-box,
      linear-gradient(color-mix(in srgb, var(--color-shadow-olive) 75%, transparent), color-mix(in srgb, var(--color-shadow-olive) 75%, transparent)) padding-box,
      var(--glass-edge-soft) border-box;
    backdrop-filter: blur(8px) saturate(1.22);
    -webkit-backdrop-filter: blur(8px) saturate(1.22);
  }""", 1, 'C25d-fb')
rep("""  .glass-surface.glass-elevated {
    --glass-veil: color-mix(in srgb, var(--color-ink-100) 36%, transparent);
  }""",
"""  .glass-surface.glass-elevated {
    --glass-veil: color-mix(in srgb, var(--color-frosted-mint) 3%, transparent);
    background:
      linear-gradient(var(--glass-veil), var(--glass-veil)) padding-box,
      linear-gradient(color-mix(in srgb, var(--color-shadow-olive) 85%, transparent), color-mix(in srgb, var(--color-shadow-olive) 85%, transparent)) padding-box,
      var(--glass-edge) border-box;
  }""", 1, 'C25e-fb')

# ---- mobile ----
rep("""  .glass-surface[data-glass] {
    --glass-veil: color-mix(in srgb, var(--color-ink-100) 24%, transparent);
    backdrop-filter: blur(12px) saturate(1.22);
    -webkit-backdrop-filter: blur(12px) saturate(1.22);
  }""",
"""  .glass-surface[data-glass] {
    --glass-veil: color-mix(in srgb, var(--color-frosted-mint) 5%, transparent);
    background:
      linear-gradient(var(--glass-veil), var(--glass-veil)) padding-box,
      linear-gradient(color-mix(in srgb, var(--color-shadow-olive) 80%, transparent), color-mix(in srgb, var(--color-shadow-olive) 80%, transparent)) padding-box,
      var(--glass-edge) border-box;
    backdrop-filter: blur(12px) saturate(1.22);
    -webkit-backdrop-filter: blur(12px) saturate(1.22);
  }""", 1, 'C24-mobile')

# ---- hover/active/selected ----
rep("""  transform: translateY(-1px) scale(0.99);
  --glass-veil: color-mix(in srgb, var(--color-ink-100) 16%, transparent);""",
"""  transform: translateY(-1px) scale(0.99);
  --glass-veil: color-mix(in srgb, var(--color-frosted-mint) 10%, transparent);""", 1, 'C10b-active')
rep("  --glass-veil: color-mix(in srgb, var(--color-ink-100) 22%, transparent);",
    "  --glass-veil: color-mix(in srgb, var(--color-frosted-mint) 4%, transparent);", 1, 'C11-selected')

# ---- buttons ----
rep("""  transform: translateY(-1px);
  background: color-mix(in srgb, var(--color-ink-100) 85%, transparent);""",
"""  transform: translateY(-1px);
  background: var(--color-tea-green);""", 1, 'C12a')
rep(".btn-primary:active { transform: translateY(0) scale(0.985); background: color-mix(in srgb, var(--color-ink-100) 70%, transparent); }",
    ".btn-primary:active { transform: translateY(0) scale(0.985); background: var(--color-muted-olive); }", 1, 'C12b')
rep("""  background:
    linear-gradient(var(--glass-veil), var(--glass-veil)) padding-box,
    linear-gradient(135deg,
      color-mix(in srgb, var(--color-ink-100) 38%, transparent) 0%,
      color-mix(in srgb, var(--color-ink-100) 22%, transparent) 45%,
      color-mix(in srgb, var(--color-ink-500) 30%, transparent) 100%) border-box;""",
"""  background:
    linear-gradient(var(--glass-veil), var(--glass-veil)) padding-box,
    linear-gradient(color-mix(in srgb, var(--color-shadow-olive) 45%, transparent), color-mix(in srgb, var(--color-shadow-olive) 45%, transparent)) padding-box,
    linear-gradient(135deg,
      color-mix(in srgb, var(--color-frosted-mint) 38%, transparent) 0%,
      color-mix(in srgb, var(--color-frosted-mint) 22%, transparent) 45%,
      color-mix(in srgb, var(--color-muted-olive) 30%, transparent) 100%) border-box;""", 1, 'C13-btnglass')
rep(""".btn-glass:hover {
  transform: translateY(-1px);
  --glass-veil: color-mix(in srgb, var(--color-ink-100) 16%, transparent);""",
""".btn-glass:hover {
  transform: translateY(-1px);
  --glass-veil: color-mix(in srgb, var(--color-frosted-mint) 6%, transparent);""", 1, 'C10a')
rep("    --glass-veil: color-mix(in srgb, var(--color-ink-100) 20%, transparent);",
    "    --glass-veil: color-mix(in srgb, var(--color-frosted-mint) 5%, transparent);", 1, 'C15-fbveil')
rep(""".btn-ghost {
  color: var(--color-ink-100);
  transition: color 0.2s ease, background 0.2s ease;
}
.btn-ghost:hover {
  color: var(--color-ink-100);
  background: color-mix(in srgb, var(--color-ink-500) 45%, transparent);
}""",
""".btn-ghost {
  color: var(--color-frosted-mint);
  border: 1px solid color-mix(in srgb, var(--color-muted-olive-2) 45%, transparent);
  border-radius: 10px;
  transition: color 0.2s ease, background 0.2s ease;
}
.btn-ghost:hover {
  color: var(--color-frosted-mint);
  background: color-mix(in srgb, var(--color-palm-leaf) 25%, transparent);
}""", 1, 'C16-ghost')

# ---- fields ----
rep("""    linear-gradient(180deg, color-mix(in srgb, var(--color-ink-100) 10%, transparent), transparent 45%),
    color-mix(in srgb, var(--color-ink-300) 8%, transparent);""",
"""    linear-gradient(180deg, color-mix(in srgb, var(--color-tea-green) 10%, transparent), transparent 55%),
    color-mix(in srgb, var(--color-shadow-olive) 55%, transparent);""", 1, 'C17a-field')
rep("""      linear-gradient(180deg, color-mix(in srgb, var(--color-ink-100) 12%, transparent), transparent 45%),
      color-mix(in srgb, var(--color-ink-300) 14%, transparent);""",
"""      linear-gradient(180deg, color-mix(in srgb, var(--color-tea-green) 10%, transparent), transparent 55%),
      color-mix(in srgb, var(--color-shadow-olive) 55%, transparent);""", 1, 'C17b-fieldfb')
rep("""    linear-gradient(180deg, color-mix(in srgb, var(--color-ink-100) 12%, transparent), transparent 45%),
    color-mix(in srgb, var(--color-ink-300) 10%, transparent);""",
"""    linear-gradient(180deg, color-mix(in srgb, var(--color-tea-green) 10%, transparent), transparent 55%),
    color-mix(in srgb, var(--color-shadow-olive) 55%, transparent);""", 1, 'C17c-focus')

# ---- range / table / tree / scrollbar / code / ticks ----
rep('  accent-color: var(--color-ink-100);', '  accent-color: var(--color-muted-olive-2);', 1, 'C18-range')
rep("  border-bottom: 1px solid color-mix(in srgb, var(--color-ink-500) 12%, transparent);",
    "  border-bottom: 1px solid color-mix(in srgb, var(--color-muted-olive-2) 15%, transparent);", 1, 'C19-td')
rep(""".tree-active {
  background: color-mix(in srgb, var(--color-ink-500) 45%, transparent) !important;
  border: 1px solid color-mix(in srgb, var(--color-ink-100) 35%, transparent) !important;
  color: var(--color-ink-100) !important;
  box-shadow:
    inset 2px 0 0 0 var(--color-ink-100),
    inset 0 1px 0 color-mix(in srgb, var(--color-ink-100) 20%, transparent),
    0 6px 16px -8px color-mix(in srgb, var(--color-ink-900) 50%, transparent);
}""",
""".tree-active {
  background: color-mix(in srgb, var(--color-palm-leaf) 25%, transparent) !important;
  border: 1px solid color-mix(in srgb, var(--color-frosted-mint) 40%, transparent) !important;
  color: var(--color-frosted-mint) !important;
  box-shadow:
    inset 2px 0 0 0 var(--color-frosted-mint),
    inset 0 1px 0 color-mix(in srgb, var(--color-frosted-mint) 20%, transparent),
    0 6px 16px -8px color-mix(in srgb, var(--color-shadow-olive) 50%, transparent);
}""", 1, 'C20-tree')
rep("  scrollbar-color: color-mix(in srgb, var(--color-ink-500) 50%, transparent) transparent;",
    "  scrollbar-color: color-mix(in srgb, var(--color-muted-olive-2) 50%, transparent) transparent;", 1, 'C21a-scroll')
rep("  background: color-mix(in srgb, var(--color-ink-500) 45%, transparent);",
    "  background: color-mix(in srgb, var(--color-muted-olive-2) 45%, transparent);", 1, 'C21b-thumb')
rep("  background: linear-gradient(180deg, var(--color-ink-700) 0%, var(--color-ink-900) 100%);",
    "  background: linear-gradient(180deg, color-mix(in srgb, var(--color-dusty-olive) 25%, var(--color-shadow-olive)) 0%, var(--color-shadow-olive) 100%);", 1, 'C22-code')
rep(".tt-cell { border-left: 1px solid color-mix(in srgb, var(--color-ink-500) 15%, transparent); }",
    ".tt-cell { border-left: 1px solid color-mix(in srgb, var(--color-muted-olive-2) 15%, transparent); }", 1, 'C23a-tt')
rep(".tt-row { border-top: 1px solid color-mix(in srgb, var(--color-ink-500) 15%, transparent); }",
    ".tt-row { border-top: 1px solid color-mix(in srgb, var(--color-muted-olive-2) 15%, transparent); }", 1, 'C23b-tt')

# ---- globals ----
rep("ink-100", "frosted-mint", None, 'G1')
rep("ink-300", "tea-green", None, 'G2')
rep("ink-500", "muted-olive", None, 'G3')
n700 = t.count("ink-700")
print(f'G4-ink700-left: {n700} (want 0)')
if n700:
    FAIL.append('G4')
rep("ink-900", "shadow-olive", None, 'G5')
azero(r"ink-", 'INK-ALL')
azero(r"rgba?\(", 'RGBA')
azero(r"success", 'SUCCESS')
azero(r"7fa98c|c08080", 'OLDSEM')
azero(r"(?i)0d1b2a|1b263b|415a77|778da9|e0e1dd", 'LEGACYHEX')
for tok in ['--color-frosted-mint:', '--color-tea-green:', '--color-muted-olive:', '--color-muted-olive-2:',
            '--color-palm-leaf:', '--color-dusty-olive:', '--color-shadow-olive:', '--color-warning:', '--color-error:']:
    c = t.count(tok)
    print(f'token {tok} {c}')
    if c != 1:
        FAIL.append(f'token-{tok}')
for tok in ['frosted-mint', 'tea-green', 'muted-olive-2', 'palm-leaf', 'dusty-olive', 'shadow-olive']:
    print(f'uses {tok}: {t.count(tok)}')

if FAIL:
    print('LEFTOVERS:')
    for i, line in enumerate(t.splitlines(), 1):
        if re.search(r"ink-|success|rgba?\(|7fa98c|c08080|(?i)0d1b2a|1b263b|415a77|778da9|e0e1dd", line):
            print(f'{i}: {line.strip()[:140]}')
    print('FAIL:', FAIL)
    sys.exit(1)
open(F, 'w').write(t)
print('WROTE', F)

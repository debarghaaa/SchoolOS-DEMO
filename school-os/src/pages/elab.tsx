import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, ChevronDown, ChevronRight, CircleAlert, Clock, FlaskConical, History, ListChecks, Maximize2, Minimize2, Play, RotateCcw, Send, Square, Trophy, X, XCircle } from 'lucide-react';
import { ELAB_WEEK, HOUSE_POINTS, LAB_PROBLEMS } from '../lib/data';
import { useApp } from '../lib/store';
import type { LabProblem } from '../lib/types';
import { cn } from '../lib/utils';
import { GlassButton, GlassCard, GlassSelect, StatusBadge } from '../components/glass';
import { ensureDemoSession, feedApi, feedMutate, FeedError } from '../lib/supabase';

/* =====================================================================
   E-Lab — real code execution. Run/Submit POST the editor source to the
   school API, which queues it for an isolated container runner; this page
   polls for the verdict. Per-test submit runs each hidden test with its
   input on stdin and diffs stdout. History lists recent runs (View loads
   one into the console). Student code never executes in the browser.
   ===================================================================== */

type RunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'timeout' | 'cancelled';
type Phase = 'idle' | RunStatus;
interface ConsoleLine { id: number; text: string; tone: 'dim' | 'ok' | 'err' | 'info' | 'cmd' }
interface ElabRun {
  id: string; language: string; status: RunStatus; stage: string | null;
  stdout: string; stderr: string; exit_code: number | null;
  runtime_ms: number | null; created_at: string; completed_at: string | null;
}
interface TestVerdict { input: string; expected: string; got: string; pass: boolean }

/* Expandable editor: ONE card element, portaled into its in-flow anchor
   (embedded) or document.body (expanded). The portal escapes the page
   entrance-animation transform and body overflow-x clipping, so viewport
   coordinates are exact. Same DOM node throughout: cursor, selection,
   scroll, code, language and run controls all survive maximize/minimize. */
interface EditorFrame { top: number; left: number; width: number; height: number; radius: number }

const ED_OPEN_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const ED_CLOSE_EASE = 'cubic-bezier(0.65, 0, 0.35, 1)';

function edTargetFrame(): EditorFrame {
  const w = window.innerWidth, h = window.innerHeight;
  const mobile = w < 640;
  const mx = mobile ? 0 : w < 1024 ? 16 : 32;
  const my = mobile ? 0 : w < 1024 ? 16 : 24;
  return {
    top: my, left: mx,
    width: Math.max(0, w - mx * 2), height: Math.max(0, h - my * 2),
    radius: mobile ? 0 : 24,
  };
}

const DIFF_TONE: Record<LabProblem['difficulty'], string> = { Easy: 'graded', Medium: 'pending', Hard: 'overdue' };
const STATUS_TONE: Record<RunStatus, string> = {
  queued: 'pending', running: 'active', completed: 'graded',
  failed: 'error', timeout: 'overdue', cancelled: 'closed',
};
const TERMINAL: RunStatus[] = ['completed', 'failed', 'timeout', 'cancelled'];
const POLL_MS = 800;
const MAX_POLLS = 75; // ~60s safety net; the server times out runs at 5s

let lineSeq = 1;

export function ELab() {
  const { pushToast } = useApp();
  const [problemId, setProblemId] = useState('p3');
  const [lang, setLang] = useState<'python' | 'javascript'>('python');
  const [code, setCode] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<Phase>('idle');
  const [lines, setLines] = useState<ConsoleLine[]>([
    { id: 0, text: 'e-lab console · snippets run in isolated containers (python 3.12 · node 22 · gcc 14)', tone: 'dim' },
  ]);
  const [testResults, setTestResults] = useState<TestVerdict[] | null>(null);
  const [solved, setSolved] = useState<Set<string>>(new Set(['p1', 'p2']));
  const [descTab, setDescTab] = useState<'desc' | 'tests' | 'history'>('desc');
  const [filter, setFilter] = useState('all');
  const [history, setHistory] = useState<ElabRun[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const pollRef = useRef<number | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const abortRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current = true;
      if (pollRef.current) window.clearTimeout(pollRef.current);
    };
  }, []);

  const elabStreak = (() => {
    let n = 0;
    for (let i = ELAB_WEEK.length - 1; i >= 0; i--) {
      if (ELAB_WEEK[i].min > 0) n++;
      else break;
    }
    return n;
  })();
  const ramanPoints = HOUSE_POINTS.find((h) => h.house === 'Raman')?.points ?? 0;

  const problem = LAB_PROBLEMS.find((p) => p.id === problemId)!;
  const currentCode = code[problemId] ?? problem.starter[lang];

  const visible = useMemo(() => LAB_PROBLEMS.filter((p) =>
    filter === 'all' || (filter === 'solved' ? solved.has(p.id) : filter === 'todo' ? !solved.has(p.id) : p.difficulty === filter)
  ), [filter, solved]);

  const push = (text: string, tone: ConsoleLine['tone'] = 'info') =>
    setLines((prev) => [...prev.slice(-60), { id: lineSeq++, text, tone }]);

  const setCodeFor = (v: string) => setCode((p) => ({ ...p, [problemId]: v }));

  const resetCode = () => {
    setCode((p) => ({ ...p, [problemId]: problem.starter[lang] }));
    push(`↺ reset ${problem.code} starter (${lang})`, 'dim');
  };

  const stopPolling = () => {
    if (pollRef.current) { window.clearTimeout(pollRef.current); pollRef.current = null; }
  };

  /** POST one snippet and poll to a terminal state. Throws FeedError on API failure. */
  const runOnce = async (token: string, source: string, stdin: string): Promise<ElabRun> => {
    const created = await feedMutate<{ execution_id: string }>('/elab/runs', token, {
      method: 'POST', body: JSON.stringify({ language: lang, source_code: source, stdin }),
    });
    activeIdRef.current = created.execution_id;
    if (mountedRef.current) setPhase('queued');
    let polls = 0;
    for (;;) {
      if (abortRef.current) throw new FeedError('AbortedError', 'Run aborted.');
      const run = await feedApi<ElabRun>(`/elab/runs/${created.execution_id}`, token);
      if (mountedRef.current) setPhase(run.status);
      if (TERMINAL.includes(run.status) || ++polls >= MAX_POLLS) return run;
      await new Promise<void>((resolve) => {
        pollRef.current = window.setTimeout(() => resolve(), POLL_MS);
      });
    }
  };

  const handleApiError = (e: unknown, what: string) => {
    stopPolling();
    activeIdRef.current = null;
    if (mountedRef.current) setPhase('idle');
    if (e instanceof FeedError && e.name === 'SigninRequiredError') {
      push('⛔ not connected — open Presence → Connect with your school login, then run again', 'err');
      pushToast({ title: 'Connect required', body: 'Sign in with your school login to execute code.', tone: 'warning' });
    } else if (e instanceof FeedError && e.name === 'RateLimitedError') {
      push(`⏳ quota exceeded — ${(e as Error).message}`, 'err');
      pushToast({ title: 'Quota exceeded', body: (e as Error).message, tone: 'warning' });
    } else if (e instanceof FeedError && (e as Error).name !== 'AbortedError') {
      push(`✕ ${what} failed — ${(e as Error).message}`, 'err');
    }
  };

  const refreshHistory = async () => {
    try {
      const { token } = await ensureDemoSession();
      const page = await feedApi<{ items: ElabRun[]; total: number }>('/elab/runs?limit=20', token);
      if (mountedRef.current) { setHistory(page.items); setHistoryLoaded(true); }
    } catch {
      /* history is best-effort; runs still work */
    }
  };

  const printRun = (run: ElabRun, label: string) => {
    push(`— ${label} · ${run.id.slice(0, 8)} · ${run.status}${run.runtime_ms != null ? ` · ${run.runtime_ms}ms` : ''} —`, 'dim');
    if (run.stage) push(`stage: ${run.stage}`, 'dim');
    const out = run.stdout.trimEnd();
    const err = run.stderr.trimEnd();
    if (out) out.split('\n').forEach((l) => push(l, 'info'));
    if (err) err.split('\n').forEach((l) => push(l, run.status === 'completed' ? 'dim' : 'err'));
    if (!out && !err) push('(no output)', 'dim');
    if (run.exit_code != null && run.exit_code !== 0) push(`exit code ${run.exit_code}`, 'err');
  };

  const executeSuite = async (mode: 'run' | 'submit') => {
    if (phase === 'queued' || phase === 'running') return;
    abortRef.current = false;
    setTestResults(null);
    push(`$ ${mode} ${problem.code}.${lang === 'python' ? 'py' : 'js'}`, 'cmd');
    let token: string;
    try {
      ({ token } = await ensureDemoSession());
    } catch (e) { handleApiError(e, mode); return; }

    try {
      if (mode === 'run') {
        // Sample run: first visible test input on stdin.
        const sample = problem.tests[0];
        const run = await runOnce(token, currentCode, sample?.input ?? '');
        printRun(run, `sample${sample ? ` · stdin ${sample.input}` : ''}`);
        if (run.status === 'completed') push('sample run clean — hit Submit to lock it in', 'dim');
        else if (run.status === 'timeout') push('⏱ timed out after 5s — check for infinite loops', 'err');
        else if (run.status !== 'cancelled') push('✕ run failed — see output above', 'err');
      } else {
        const verdicts: TestVerdict[] = [];
        for (let i = 0; i < problem.tests.length; i++) {
          const t = problem.tests[i];
          push(`test ${i + 1}/${problem.tests.length} · input ${t.input}`, 'dim');
          const run = await runOnce(token, currentCode, t.input);
          if (run.status === 'cancelled') { push('■ suite cancelled', 'err'); break; }
          const got = run.status === 'completed' ? run.stdout.trim()
            : run.status === 'timeout' ? '⟨timeout⟩' : `⟨${run.status}${run.exit_code != null ? `:${run.exit_code}` : ''}⟩`;
          if (run.status !== 'completed' && run.stderr.trim()) {
            push(run.stderr.trim().split('\n')[0], 'err');
          }
          verdicts.push({ input: t.input, expected: t.expected, got, pass: got === t.expected.trim() });
        }
        if (!mountedRef.current) return;
        setTestResults(verdicts);
        const passed = verdicts.filter((r) => r.pass).length;
        if (verdicts.length === problem.tests.length && passed === verdicts.length) {
          push(`✓ all ${passed} tests passed`, 'ok');
          setSolved((prev) => new Set(prev).add(problemId));
          push(`★ ${problem.code} accepted · +${problem.difficulty === 'Hard' ? 100 : problem.difficulty === 'Medium' ? 60 : 30} house points`, 'ok');
          pushToast({ title: 'Solution accepted', body: `${problem.title} solved · leaderboard updated.`, tone: 'success' });
        } else if (verdicts.length > 0) {
          const failed = verdicts.find((r) => !r.pass)!;
          push(`✕ ${verdicts.length - passed} test${verdicts.length - passed > 1 ? 's' : ''} failed — expected ${failed.expected}, got ${failed.got}`, 'err');
        }
      }
    } catch (e) {
      handleApiError(e, mode);
    } finally {
      activeIdRef.current = null;
      stopPolling();
      void refreshHistory();
    }
  };

  const cancelActive = async () => {
    const id = activeIdRef.current;
    if (!id) return;
    abortRef.current = true;
    stopPolling();
    try {
      const { token } = await ensureDemoSession();
      const run = await feedMutate<ElabRun>(`/elab/runs/${id}`, token, { method: 'DELETE' });
      if (mountedRef.current) setPhase(run.status === 'running' ? 'cancelled' : run.status);
      push(`■ cancelled ${id.slice(0, 8)}`, 'err');
    } catch (e) {
      if (mountedRef.current) setPhase('cancelled');
      push(`■ cancel requested (${(e as Error).message})`, 'err');
    } finally {
      activeIdRef.current = null;
      void refreshHistory();
    }
  };

  const viewRun = async (id: string) => {
    try {
      const { token } = await ensureDemoSession();
      const run = await feedApi<ElabRun>(`/elab/runs/${id}`, token);
      push(`$ view ${id.slice(0, 8)}`, 'cmd');
      printRun(run, `${run.language} · ${new Date(run.created_at).toLocaleString()}`);
    } catch (e) {
      push(`✕ could not load run — ${(e as Error).message}`, 'err');
    }
  };

  const busy = phase === 'queued' || phase === 'running';

  /* ----- Expand state: ONE boolean. edFrame/edSnap/edDim/edClosing are
     animation helpers only — edExpanded alone decides where the card lives. */
  const [edExpanded, setEdExpanded] = useState(false);
  const [edFrame, setEdFrame] = useState<EditorFrame | null>(null);
  const [edSnap, setEdSnap] = useState(false);
  const [edDim, setEdDim] = useState(false);
  const [edClosing, setEdClosing] = useState(false);
  const [edSlotH, setEdSlotH] = useState<number | null>(null);
  const [slotEl, setSlotEl] = useState<HTMLDivElement | null>(null);
  const [problemsOpen, setProblemsOpen] = useState(false);
  const edCardRef = useRef<HTMLDivElement>(null);
  const edTimerRef = useRef<number | null>(null);
  const edAnimRef = useRef<'idle' | 'opening' | 'closing'>('idle');
  const edBaseHRef = useRef(0);
  const edBaseLinesRef = useRef(0);
  const edResizeRef = useRef('');

  const slotCallback = useCallback((el: HTMLDivElement | null) => { setSlotEl(el); }, []);

  const restoreEditorFocus = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.focus({ preventScroll: true });
    try {
      const pos = ta.selectionStart ?? ta.value.length;
      ta.setSelectionRange(pos, ta.selectionEnd ?? pos);
    } catch { /* selection restore is best-effort */ }
  }, []);

  const expandEditor = useCallback(() => {
    if (edExpanded || edAnimRef.current !== 'idle' || !slotEl) return;
    const r = slotEl.getBoundingClientRect();
    if (edTimerRef.current) window.clearTimeout(edTimerRef.current);
    edBaseHRef.current = r.height;
    edBaseLinesRef.current = (taRef.current?.value ?? '').split('\n').length;
    // A manually resized textarea carries inline height that would fight the
    // fill layout; stash it and restore on collapse.
    edResizeRef.current = taRef.current?.style.height ?? '';
    if (taRef.current) taRef.current.style.height = '';
    edAnimRef.current = 'opening';
    setEdSlotH(r.height);
    setEdSnap(true);
    setEdClosing(false);
    setEdFrame({ top: r.top, left: r.left, width: r.width, height: r.height, radius: 27 });
    setEdExpanded(true);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!mountedRef.current || edAnimRef.current !== 'opening') return;
      setEdSnap(false);
      setEdFrame(edTargetFrame());
      setEdDim(true);
      restoreEditorFocus();
    }));
    edTimerRef.current = window.setTimeout(() => {
      if (edAnimRef.current === 'opening') edAnimRef.current = 'idle';
    }, 330);
  }, [edExpanded, slotEl, restoreEditorFocus]);

  const collapseEditor = useCallback(() => {
    const card = edCardRef.current;
    if (!edExpanded || edAnimRef.current === 'closing' || !slotEl || !card) return;
    if (edTimerRef.current) window.clearTimeout(edTimerRef.current);
    const t = slotEl.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    const radius = Number.parseFloat(getComputedStyle(card).borderRadius) || 24;
    edAnimRef.current = 'closing';
    setEdClosing(true);
    setEdDim(false);
    setEdSnap(true);
    setEdFrame({ top: c.top, left: c.left, width: c.width, height: c.height, radius });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!mountedRef.current || edAnimRef.current !== 'closing') return;
      setEdSnap(false);
      setEdFrame({ top: t.top, left: t.left, width: t.width, height: t.height, radius: 27 });
      setEdSlotH(t.height);
    }));
    edTimerRef.current = window.setTimeout(() => {
      if (!mountedRef.current) return;
      edAnimRef.current = 'idle';
      if (taRef.current && edResizeRef.current) taRef.current.style.height = edResizeRef.current;
      setEdClosing(false);
      setEdExpanded(false);
      setEdFrame(null);
      setEdSlotH(null);
      requestAnimationFrame(() => { if (mountedRef.current) restoreEditorFocus(); });
    }, 330);
  }, [edExpanded, slotEl, restoreEditorFocus]);

  // Escape exits; background scroll locks; resize tracks the viewport.
  useEffect(() => {
    if (!edExpanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); collapseEditor(); }
    };
    const onResize = () => { if (edAnimRef.current === 'idle') setEdFrame(edTargetFrame()); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      document.body.style.overflow = prev;
    };
  }, [edExpanded, collapseEditor]);

  // Track the placeholder height as code grows (21px per line) so the
  // collapse target matches the card's natural height. No-op otherwise.
  useEffect(() => {
    if (!edExpanded) return;
    setEdSlotH(edBaseHRef.current + (currentCode.split('\n').length - edBaseLinesRef.current) * 21);
  }, [currentCode, edExpanded]);

  useEffect(() => () => { if (edTimerRef.current) window.clearTimeout(edTimerRef.current); }, []);

  const edEase = edClosing ? ED_CLOSE_EASE : ED_OPEN_EASE;
  const edCardStyle: CSSProperties | undefined = edFrame ? {
    position: 'fixed', top: edFrame.top, left: edFrame.left,
    width: edFrame.width, height: edFrame.height,
    borderRadius: edFrame.radius, zIndex: 76, margin: 0,
    padding: 'env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px)',
    transition: edSnap ? 'none' : [
      `top 300ms ${edEase}`, `left 300ms ${edEase}`, `width 300ms ${edEase}`,
      `height 300ms ${edEase}`, `border-radius 300ms ${edEase}`,
    ].join(', '),
  } : undefined;

  const editorCard = (
    <div ref={edCardRef} className={cn('code-panel overflow-hidden rounded-[27px]', edExpanded && 'flex flex-col')} style={edCardStyle}>
      <div className="flex flex-wrap items-center gap-2 border-b border-periwinkle-2/70 px-4 py-2.5">
        <span className="flex gap-1.5">
          <i className="h-2.5 w-2.5 rounded-full bg-baby-blue-ice" />
          <i className="h-2.5 w-2.5 rounded-full bg-periwinkle-3" />
          <i className="h-2.5 w-2.5 rounded-full bg-periwinkle-2" />
        </span>
        <span className="ml-1 font-mono text-[11px] text-text-muted">{problem.code.toLowerCase()}.{lang === 'python' ? 'py' : 'js'}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <select
            value={lang} onChange={(e) => setLang(e.target.value as 'python' | 'javascript')}
            className="h-8 cursor-pointer rounded-lg border border-periwinkle-2/70 bg-white/35 px-2 font-mono text-[11px] text-text-primary outline-none"
            aria-label="Language"
          >
            <option value="python" className="text-black">Python</option>
            <option value="javascript" className="text-black">JavaScript</option>
          </select>
          <button onClick={resetCode} title="Reset starter code" className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg border border-periwinkle-2/70 bg-white/35 text-text-secondary hover:text-text-primary">
            <RotateCcw size={13} />
          </button>
          {edExpanded ? (
            <>
              <button onClick={collapseEditor} title="Minimize editor" aria-label="Minimize editor" className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg border border-periwinkle-2/70 bg-white/35 text-text-secondary hover:text-text-primary">
                <Minimize2 size={13} />
              </button>
              <button onClick={collapseEditor} title="Exit full screen editor" aria-label="Exit full screen editor" className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg border border-periwinkle-2/70 bg-white/35 text-text-secondary hover:text-text-primary">
                <X size={13} />
              </button>
            </>
          ) : (
            <button onClick={expandEditor} title="Maximize editor" aria-label="Maximize editor" className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg border border-periwinkle-2/70 bg-white/35 text-text-secondary hover:text-text-primary">
              <Maximize2 size={13} />
            </button>
          )}
        </div>
      </div>
      <div className={cn('grid grid-cols-[44px_1fr]', edExpanded && 'min-h-0 flex-1')}>
        <div className="select-none border-r border-periwinkle-2/70 py-3 text-right font-mono text-[12px] leading-[21px] text-text-muted/30">
          {currentCode.split('\n').map((_, i) => <div key={i} className="pr-3">{i + 1}</div>)}
        </div>
        <textarea
          ref={taRef}
          value={currentCode}
          onChange={(e) => setCodeFor(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Tab') {
              e.preventDefault();
              const el = taRef.current!;
              const s = el.selectionStart;
              setCodeFor(currentCode.slice(0, s) + '  ' + currentCode.slice(el.selectionEnd));
              requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = s + 2; });
            }
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void executeSuite('run');
          }}
          spellCheck={false}
          aria-label="Code editor"
          title={edExpanded ? undefined : 'Click to expand the editor'}
          onClick={() => { if (!edExpanded) expandEditor(); }}
          className={edExpanded
            ? 'h-full min-h-0 w-full resize-none bg-transparent px-3 py-3 font-mono text-[12.5px] leading-[21px] text-text-primary outline-none placeholder:text-text-muted'
            : 'min-h-[300px] w-full resize-y bg-transparent px-3 py-3 font-mono text-[12.5px] leading-[21px] text-text-primary outline-none placeholder:text-text-muted'}
          placeholder="# write your solution…  (⌘/Ctrl + Enter to run)"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-periwinkle-2/70 bg-white/40 px-4 py-3">
        <GlassButton
          variant="primary" icon={<Play size={14} />} disabled={busy}
          onClick={() => void executeSuite('run')}
          className="border! border-periwinkle-2/70!"
        >
          {phase === 'queued' ? 'Queued…' : phase === 'running' ? 'Running…' : 'Run'}
        </GlassButton>
        <button
          onClick={() => void executeSuite('submit')} disabled={busy}
          className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-periwinkle-2/70 bg-periwinkle-3 px-4 text-sm font-semibold text-text-primary transition-all hover:-translate-y-[1px] disabled:opacity-50"
        >
          <Send size={14} /> Submit
        </button>
        {busy && (
          <button
            onClick={() => void cancelActive()}
            className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-error/40 bg-white/40 px-4 text-sm font-semibold text-error transition-all hover:-translate-y-[1px]"
          >
            <Square size={14} /> Cancel
          </button>
        )}
        <span className="ml-auto hidden font-mono text-[10.5px] text-text-muted sm:inline">⌘↵ run · autosaved</span>
      </div>
    </div>
  );

  return (
    <div className="animate-fade-up space-y-5">
      {/* Stats strip */}
      <div className="grid gap-5 sm:grid-cols-4">
        {[
          { icon: <Trophy size={16} />, l: 'Solved', v: `${solved.size}/${LAB_PROBLEMS.length}` },
          { icon: <FlaskConical size={16} />, l: 'Contest rank', v: '#14' },
          { icon: <Clock size={16} />, l: 'Streak', v: `${elabStreak} days` },
          { icon: <ListChecks size={16} />, l: 'House pts', v: String(ramanPoints) },
        ].map((s) => (
          <GlassCard key={s.l} hover pad className="p-4!">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl border border-periwinkle-2/50 bg-white/35 text-text-primary">{s.icon}</span>
              <div>
                <p className="font-display text-[18px] leading-none font-bold text-text-primary">{s.v}</p>
                <p className="mt-1 font-mono text-[10px] tracking-wider text-text-secondary uppercase">{s.l}</p>
              </div>
            </div>
          </GlassCard>
        ))}
      </div>

      <div className="space-y-5">
        {/* Problems — collapsed by default; the editor sits directly below. */}
        <GlassCard pad className="p-3.5!">
          <button
            onClick={() => setProblemsOpen((o) => !o)}
            aria-expanded={problemsOpen}
            aria-controls="elab-problem-list"
            className="flex w-full cursor-pointer items-center gap-3 px-1.5 py-1 text-left"
          >
            <h3 className="font-display shrink-0 text-[15px] font-bold text-text-primary">Problems</h3>
            <span className="shrink-0 font-mono text-[11px] text-text-secondary">{visible.length} shown</span>
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-text-secondary">
              <span className="font-mono font-semibold text-text-primary">{problem.code}</span>
              <span className="mx-1.5 text-text-muted">·</span>{problem.title}
            </span>
            <ChevronDown size={16} className={cn('shrink-0 text-text-secondary transition-transform duration-300', problemsOpen && 'rotate-180')} />
          </button>
          <div id="elab-problem-list" className={cn('tree-children', problemsOpen && 'open')}>
            <div>
              <div className={cn('transition-opacity duration-300', problemsOpen ? 'opacity-100' : 'opacity-0')}>
                <div className="flex items-center justify-between gap-2 px-1.5 pt-2">
                  <p className="font-mono text-[10.5px] tracking-[0.1em] text-text-secondary uppercase">select a problem</p>
                  <GlassSelect value={filter} onChange={(e) => setFilter(e.target.value)} className="h-8! text-[12px]!" aria-label="Filter problems">
                    <option value="all">All</option>
                    <option value="todo">Todo</option>
                    <option value="solved">Solved</option>
                    <option value="Easy">Easy</option>
                    <option value="Medium">Medium</option>
                    <option value="Hard">Hard</option>
                  </GlassSelect>
                </div>
                <div className="mt-2 max-h-[320px] space-y-1.5 overflow-y-auto px-0.5 pb-1">
                  {visible.map((p) => {
                    const active = p.id === problemId;
                    const done = solved.has(p.id);
                    return (
                      <button
                        key={p.id}
                        onClick={() => { setProblemId(p.id); setTestResults(null); if (!busy) setPhase('idle'); }}
                        className={cn(
                          'w-full cursor-pointer rounded-2xl border p-3 text-left transition-all duration-300',
                          active ? 'border-periwinkle-3/60 bg-periwinkle/50 shadow-lift' : 'border-periwinkle-2/35 bg-white/35 hover:bg-lavender-2/70',
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[10.5px] font-semibold text-text-secondary">{p.code}</span>
                          {done ? <CheckCircle2 size={14} className="text-success" /> : p.attempted ? <Clock size={13} className="text-text-secondary" /> : <ChevronRight size={13} className="text-text-secondary" />}
                        </div>
                        <p className="mt-1 text-[13px] leading-snug font-bold text-text-primary">{p.title}</p>
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <StatusBadge tone={DIFF_TONE[p.difficulty]}>{p.difficulty}</StatusBadge>
                          <span className="font-mono text-[10px] text-text-secondary">{p.topic} · {p.acceptance}%</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* Description + editor */}
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Description */}
          <GlassCard>
            <div className="flex items-center justify-between gap-2">
              <div className="flex gap-1.5">
                <button onClick={() => setDescTab('desc')} className={descTab === 'desc' ? 'rounded-lg bg-periwinkle-3 px-3 py-1.5 text-[12px] font-semibold text-text-primary' : 'cursor-pointer rounded-lg px-3 py-1.5 text-[12px] font-semibold text-text-secondary hover:bg-lavender-2/70'}>Description</button>
                <button onClick={() => setDescTab('tests')} className={descTab === 'tests' ? 'rounded-lg bg-periwinkle-3 px-3 py-1.5 text-[12px] font-semibold text-text-primary' : 'cursor-pointer rounded-lg px-3 py-1.5 text-[12px] font-semibold text-text-secondary hover:bg-lavender-2/70'}>Tests · {problem.tests.length}</button>
                <button onClick={() => { setDescTab('history'); if (!historyLoaded) void refreshHistory(); }} className={descTab === 'history' ? 'rounded-lg bg-periwinkle-3 px-3 py-1.5 text-[12px] font-semibold text-text-primary' : 'cursor-pointer rounded-lg px-3 py-1.5 text-[12px] font-semibold text-text-secondary hover:bg-lavender-2/70'}>History</button>
              </div>
              <StatusBadge tone={DIFF_TONE[problem.difficulty]}>{problem.difficulty}</StatusBadge>
            </div>
            <h2 className="font-display mt-3 text-[20px] font-bold tracking-tight text-text-primary">{problem.title}</h2>
            <p className="mt-0.5 font-mono text-[11px] text-text-secondary">{problem.code} · {problem.topic} · acceptance {problem.acceptance}%</p>

            {descTab === 'desc' ? (
              <div className="mt-3 space-y-3 text-[13.5px] leading-relaxed text-text-secondary">
                <p>{problem.description}</p>
                {problem.examples.map((e, i) => (
                  <div key={i} className="rounded-2xl border border-periwinkle-2/40 bg-white/35 p-3.5 font-mono text-[12px]">
                    <p className="font-semibold text-text-primary">Example {i + 1}</p>
                    <p className="mt-1.5"><span className="text-text-secondary">Input: </span>{e.input}</p>
                    <p><span className="text-text-secondary">Output: </span>{e.output}</p>
                    <p className="mt-1 text-text-secondary">{e.explanation}</p>
                  </div>
                ))}
                <div>
                  <p className="font-semibold text-text-primary">Constraints</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 font-mono text-[12px] text-text-secondary">
                    {problem.constraints.map((c) => <li key={c}>{c}</li>)}
                  </ul>
                </div>
              </div>
            ) : descTab === 'tests' ? (
              <div className="mt-3 space-y-2">
                {testResults ? testResults.map((t, i) => (
                  <div key={i} className={cn('rounded-2xl border p-3 font-mono text-[12px]', t.pass ? 'border-success/40 bg-white/30' : 'border-error/40 bg-white/30')}>
                    <p className="flex items-center gap-1.5 font-semibold">
                      {t.pass ? <CheckCircle2 size={13} className="text-success" /> : <XCircle size={13} className="text-error" />}
                      Test {i + 1} · {t.pass ? 'passed' : 'failed'}
                    </p>
                    <p className="mt-1 text-text-secondary">in: {t.input}</p>
                    <p>expected: {t.expected} · got: {t.got}</p>
                  </div>
                )) : (
                  <p className="rounded-2xl border border-dashed border-periwinkle-2/60 bg-white/35 p-4 text-center font-mono text-[12px] text-text-secondary">
                    No runs yet — press <span className="font-bold text-text-primary">Run</span> to execute {problem.tests.length} tests.
                  </p>
                )}
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {history.length === 0 && (
                  <p className="rounded-2xl border border-dashed border-periwinkle-2/60 bg-white/35 p-4 text-center font-mono text-[12px] text-text-secondary">
                    {historyLoaded ? 'No executions yet — your runs will appear here.' : 'Loading history…'}
                  </p>
                )}
                {history.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => void viewRun(r.id)}
                    title="Load this run into the console"
                    className="w-full cursor-pointer rounded-2xl border border-periwinkle-2/40 bg-white/35 p-3 text-left font-mono text-[12px] transition-all hover:bg-lavender-2/70"
                  >
                    <span className="flex items-center gap-2">
                      <StatusBadge tone={STATUS_TONE[r.status]}>{r.status}</StatusBadge>
                      <span className="text-text-secondary">{r.language} · {r.id.slice(0, 8)}</span>
                      <span className="ml-auto text-text-muted">
                        {r.runtime_ms != null ? `${r.runtime_ms}ms` : '—'} · {new Date(r.created_at).toLocaleTimeString()}
                      </span>
                    </span>
                    {(r.stdout.trim() || r.stderr.trim()) && (
                      <span className="mt-1.5 block truncate text-text-secondary">
                        {(r.stdout.trim() || r.stderr.trim()).split('\n')[0].slice(0, 80)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Execution status */}
            <div className="mt-4 flex items-center gap-2.5 rounded-2xl border border-periwinkle-2/40 bg-white/35 px-4 py-3">
              <span className={cn(
                'relative flex h-2.5 w-2.5',
                busy && 'animate-pulse',
              )}>
                <span className={cn(
                  'absolute inline-flex h-full w-full rounded-full opacity-60',
                  phase === 'completed' ? 'bg-success' : (phase === 'failed' || phase === 'timeout') ? 'bg-error' : busy ? 'bg-baby-blue-ice animate-ping' : 'bg-periwinkle-2',
                )} />
                <span className={cn(
                  'relative inline-flex h-2.5 w-2.5 rounded-full',
                  phase === 'completed' ? 'bg-success' : (phase === 'failed' || phase === 'timeout') ? 'bg-error' : busy ? 'bg-baby-blue-ice' : 'bg-periwinkle-2',
                )} />
              </span>
              <p className="font-mono text-[11.5px] font-semibold text-text-primary">
                {phase === 'idle' && 'idle · runner ready'}
                {phase === 'queued' && 'queued · waiting for a runner…'}
                {phase === 'running' && 'running in an isolated container…'}
                {phase === 'completed' && 'completed · exit 0'}
                {phase === 'failed' && 'failed · see console'}
                {phase === 'timeout' && 'timed out after 5s · see console'}
                {phase === 'cancelled' && 'cancelled'}
              </p>
              {(phase === 'failed' || phase === 'timeout') && <CircleAlert size={14} className="ml-auto text-text-primary" />}
              {phase === 'completed' && <CheckCircle2 size={14} className="ml-auto text-text-primary" />}
              {phase === 'cancelled' && <History size={14} className="ml-auto text-text-primary" />}
            </div>
          </GlassCard>

          {/* Code editor (dark technical surface) + console */}
          <div className="flex flex-col gap-5">
            <div ref={slotCallback} style={edExpanded && edSlotH != null ? { height: edSlotH } : undefined} aria-hidden={edExpanded || undefined} />
            {slotEl != null && createPortal(editorCard, edExpanded ? document.body : slotEl)}
            {edExpanded && createPortal(
              <div aria-hidden="true" className="fixed inset-0 z-[75] bg-text-primary/45 backdrop-blur-[6px] transition-opacity duration-300 ease-out" style={{ opacity: edDim ? 1 : 0 }} />,
              document.body,
            )}

            {/* Console */}
            <div className="code-panel overflow-hidden rounded-[27px]">
              <div className="flex items-center justify-between border-b border-periwinkle-2/70 px-4 py-2.5">
                <p className="font-mono text-[11px] tracking-[0.1em] text-text-muted uppercase">console</p>
                <button onClick={() => setLines([])} className="cursor-pointer font-mono text-[11px] text-text-secondary hover:text-text-primary">clear</button>
              </div>
              <div className="h-[168px] space-y-1 overflow-y-auto px-4 py-3 font-mono text-[11.5px] leading-relaxed" aria-live="polite">
                {lines.length === 0 && <p className="text-text-muted/30">— console cleared —</p>}
                {lines.map((l) => (
                  <p key={l.id} className={cn(
                    l.tone === 'dim' && 'text-text-muted',
                    l.tone === 'info' && 'text-text-secondary',
                    l.tone === 'cmd' && 'text-text-primary',
                    l.tone === 'ok' && 'text-success bg-white/40',
                    l.tone === 'err' && 'text-error bg-white/40',
                  )}>
                    {l.tone === 'cmd' ? l.text : <><span className="text-text-muted">› </span>{l.text}</>}
                  </p>
                ))}
                {busy && <p className="animate-pulse text-text-muted">› working…</p>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

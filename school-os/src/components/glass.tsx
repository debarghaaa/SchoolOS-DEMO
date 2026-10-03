import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, CloudUpload, SearchX, X } from 'lucide-react';
import { canDo, type Action } from '../lib/permissions';
import { useApp } from '../lib/store';
import { cn } from '../lib/utils';

/* ---------------- Can — permission-aware rendering ----------------
   Renders children ONLY when the current role holds the action.
   Unauthorized actions are absent from the tree (not disabled/hidden). */
export function Can({ do: action, children }: { do: Action; children: ReactNode }) {
  const { role } = useApp();
  if (!canDo(role, action)) return null;
  return <>{children}</>;
}

/* ---------------- GlassSurface: the single optical material ----------------
   GPU displacement/refraction of the LIVE backdrop: each variant bends what
   is really behind the pane (feTurbulence -> per-channel feDisplacementMap)
   with subtle periwinkle atmospheric dispersion, saturated + brightened in CSS and
   finished with a screen-blend baby-blue-ice light layer, a refractive rim and deep
   shadow-blue shadows. Content above the material always stays sharp.
   Mapping vs the reference (displace 0.5, distortionScale -180, RGB 0/8/16,
   brightness 50, opacity 0.93, screen): per-channel scale deltas so fringing
   grows with local refraction instead of a uniform RGB shift; brightness 50
   becomes saturate + brightness + the screen veil; opacity 0.93 becomes veil
   alpha <= 0.07 over an alice-blue grounding layer so the distorted backdrop
   stays clearly visible. */
export type GlassVariant = 'primary' | 'secondary' | 'controls' | 'floating';

/* Hidden SVG filter defs, mounted once at the app root (must NOT be
   display:none — url() references would break). */
const GLASS_FILTERS: { id: string; freq: string; seed: number; scales: [number, number, number] }[] = [
  { id: 'glass-primary', freq: '0.009 0.013', seed: 7, scales: [46, 48.5, 51] },
  { id: 'glass-secondary', freq: '0.011 0.015', seed: 11, scales: [34, 36, 38] },
  { id: 'glass-controls', freq: '0.02 0.028', seed: 3, scales: [14, 14.8, 15.6] },
  { id: 'glass-floating', freq: '0.008 0.012', seed: 5, scales: [42, 44, 46.5] },
  { id: 'glass-soft', freq: '0.012 0.016', seed: 9, scales: [18, 19, 20] },
];

export function GlassDefs() {
  return (
    <svg aria-hidden="true" focusable="false" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
      <defs>
        {GLASS_FILTERS.map((f) => (
          <filter key={f.id} id={f.id} x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency={f.freq} numOctaves={2} seed={f.seed} result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale={f.scales[0]} xChannelSelector="R" yChannelSelector="G" result="dispR" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale={f.scales[1]} xChannelSelector="R" yChannelSelector="G" result="dispG" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale={f.scales[2]} xChannelSelector="R" yChannelSelector="G" result="dispB" />
            <feColorMatrix in="dispR" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="chanR" />
            <feColorMatrix in="dispG" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="chanG" />
            <feColorMatrix in="dispB" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="chanB" />
            <feComposite in="chanR" in2="chanG" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="mergeRG" />
            <feComposite in="mergeRG" in2="chanB" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" />
          </filter>
        ))}
      </defs>
    </svg>
  );
}

/* The div primitive. Card/Panel/Modal/Drawer/Popover below render their own
   semantic tags with the identical glass-surface material (same class, same
   filter family) to avoid extra DOM. */
export function GlassSurface({ variant = 'primary', hover = false, className, children, ...rest }: {
  variant?: GlassVariant; hover?: boolean; className?: string; children: ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div data-glass={variant} {...rest} className={cn('glass-surface rounded-[28px]', hover && 'glass-hover', className)}>
      {children}
    </div>
  );
}

/* ---------------- RealisticGlassCard (primary surface) ---------------- */
export function RealisticGlassCard({
  children, className, level = 1, hover = false, sheen = false, pad = true, specular,
}: {
  children: ReactNode; className?: string; level?: 1 | 2 | 3; hover?: boolean; sheen?: boolean; pad?: boolean;
  /** Legacy: the GlassSurface material has no pointer-following glow. Accepted and ignored. */
  specular?: boolean;
}) {
  void specular;
  const variant: GlassVariant = level === 3 ? 'floating' : 'primary';
  return (
    <section
      data-glass={variant}
      className={cn(
        'glass-surface',
        'rounded-[28px]',
        (level === 2 || sheen) && 'glass-elevated',
        hover && 'glass-hover',
        pad && 'p-5 sm:p-6',
        className,
      )}
    >
      {children}
    </section>
  );
}

/* ---------------- RealisticGlassPanel (secondary / nested surface) ---------------- */
export function RealisticGlassPanel({ children, className, pad = true }: { children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <div data-glass="secondary" className={cn('glass-surface rounded-[20px]', pad && 'p-4', className)}>
      {children}
    </div>
  );
}

/* ---------------- RealisticGlassModal / GlassDrawer / GlassPopover (floating) ---------------- */
export function RealisticGlassModal({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div data-glass="floating" className={cn('glass-surface rounded-[40px]', className)}>
      {children}
    </div>
  );
}

export function GlassDrawer({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <aside data-glass="floating" className={cn('glass-surface rounded-l-[40px] rounded-r-none', className)}>
      {children}
    </aside>
  );
}

export function GlassPopover({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div data-glass="floating" className={cn('glass-surface rounded-[24px]', className)}>
      {children}
    </div>
  );
}

/* ---------------- RealisticGlassButton ---------------- */
type BtnVariant = 'primary' | 'glass' | 'ghost' | 'danger-ghost';
export function RealisticGlassButton({
  children, variant = 'glass', size = 'md', className, icon, onClick, disabled, type = 'button', title,
}: {
  children?: ReactNode; variant?: BtnVariant; size?: 'sm' | 'md' | 'lg';
  className?: string; icon?: ReactNode; onClick?: () => void; disabled?: boolean; type?: 'button' | 'submit'; title?: string;
}) {
  return (
    <button
      type={type} title={title} disabled={disabled} onClick={onClick}
      className={cn(
        'inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg font-medium select-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-baby-blue-ice/50',
        size === 'sm' && 'h-8 px-3 text-[13px]',
        size === 'md' && 'h-10 px-4 text-sm',
        size === 'lg' && 'h-11 px-5 text-[15px]',
        variant === 'primary' && 'btn-primary',
        variant === 'glass' && 'btn-glass',
        variant === 'ghost' && 'btn-ghost rounded-lg px-3',
        variant === 'danger-ghost' && 'text-text-primary hover:bg-error/15 rounded-lg px-3',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </button>
  );
}

/* ---------------- RealisticGlassInput / Select / Textarea ---------------- */
export function RealisticGlassInput(props: React.InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode }) {
  const { icon, className, ...rest } = props;
  return (
    <div className={cn('relative', className)}>
      {icon && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary">{icon}</span>}
      <input
        {...rest}
        className={cn(
          'field h-10 w-full rounded-lg px-3 text-sm text-text-primary',
          icon ? 'pl-9' : '',
        )}
      />
    </div>
  );
}

export function GlassSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn('field h-10 cursor-pointer rounded-lg px-3 text-sm text-text-primary', props.className)}
    />
  );
}

export function GlassTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn('field w-full rounded-lg px-3 py-2.5 text-sm text-text-primary', props.className)} />;
}

export function FieldLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return <label htmlFor={htmlFor} className="mb-1.5 block text-[12px] font-semibold tracking-wide text-text-secondary">{children}</label>;
}

/* ---------------- StatusBadge ---------------- */
const BADGE_TONES: Record<string, string> = {
  active: 'bg-periwinkle/50 text-text-primary border-periwinkle-3/50',
  present: 'bg-white/30 text-success border-success/40',
  'on-time': 'bg-white/30 text-success border-success/40',
  graded: 'bg-white/30 text-success border-success/40',
  enrolled: 'bg-white/30 text-success border-success/40',
  published: 'bg-white/30 text-success border-success/40',
  success: 'bg-white/30 text-success border-success/40',
  late: 'bg-white/30 text-warning border-warning/40',
  probation: 'bg-white/30 text-warning border-warning/40',
  pending: 'bg-white/30 text-warning border-warning/40',
  leave: 'bg-white/30 text-warning border-warning/40',
  draft: 'bg-white/30 text-warning border-warning/40',
  overdue: 'bg-white/30 text-error border-error/40',
  absent: 'bg-white/30 text-error border-error/40',
  missing: 'bg-white/30 text-error border-error/40',
  error: 'bg-white/30 text-error border-error/40',
  closed: 'bg-lavender/70 text-text-muted border-periwinkle-2/50',
  neutral: 'bg-lavender-2/60 text-text-secondary border-periwinkle-2/50',
};
export function StatusBadge({ tone, children, dot = false }: { tone: string; children: ReactNode; dot?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap', BADGE_TONES[tone] ?? BADGE_TONES.neutral)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/* ---------------- Avatar ---------------- */
const AVATAR_BG = ['bg-periwinkle-3 text-text-primary', 'bg-periwinkle-2 text-text-primary', 'bg-lavender-2 text-text-secondary', 'bg-baby-blue-ice text-text-primary ring-1 ring-periwinkle-3/40'];
export function Avatar({ initials, index = 0, size = 'md', className }: { initials: string; index?: number; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  return (
    <span className={cn(
      'inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold shadow-line',
      AVATAR_BG[index % AVATAR_BG.length],
      size === 'sm' && 'h-7 w-7 text-[10px]',
      size === 'md' && 'h-9 w-9 text-[12px]',
      size === 'lg' && 'h-12 w-12 text-[15px]',
      className,
    )}>
      {initials}
    </span>
  );
}

/* ---------------- MetricCard ---------------- */
export function MetricCard({ label, value, delta, deltaTone = 'up', sub, icon, index = 0, onClick }: {
  label: string; value: string; delta?: string; deltaTone?: 'up' | 'down' | 'flat'; sub?: string; icon?: ReactNode; index?: number;
  /** When provided, the whole card (text and icon) opens a detail view. */
  onClick?: () => void;
}) {
  const card = (
    <RealisticGlassCard hover sheen className={cn('group relative', onClick && 'h-full')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold tracking-[0.04em] text-text-secondary uppercase">{label}</p>
          <p className="font-display mt-2 text-[30px] leading-none font-bold tracking-tight text-text-primary tabular-nums">{value}</p>
          {(delta || sub) && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {delta && (
                <span className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[11px] font-medium',
                  deltaTone === 'up' && 'bg-white/30 text-success',
                  deltaTone === 'down' && 'bg-white/30 text-error',
                  deltaTone === 'flat' && 'bg-lavender-2/60 text-text-muted',
                )}>
                  {deltaTone === 'up' ? <ArrowUp size={11} /> : deltaTone === 'down' ? <ArrowDown size={11} /> : null}
                  {delta}
                </span>
              )}
              {sub && <span className="text-[12px] text-text-secondary">{sub}</span>}
            </div>
          )}
        </div>
        {icon && (
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-periwinkle-3/50 bg-periwinkle-2/50 text-text-primary shadow-line">
            {icon}
          </span>
        )}
      </div>
      <span className="pointer-events-none absolute right-5 bottom-4 font-mono text-[10px] tracking-wider text-text-muted/30 transition-opacity duration-300 group-hover:text-text-secondary group-hover:opacity-100">
        {onClick ? 'VIEW DETAILS' : `${String(index + 1).padStart(2, '0')} / METRIC`}
      </span>
    </RealisticGlassCard>
  );
  if (!onClick) return card;
  return (
    <div
      role="button" tabIndex={0} onClick={onClick} title={`View ${label.toLowerCase()} details`}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      className="cursor-pointer rounded-[28px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-periwinkle-3"
    >
      {card}
    </div>
  );
}

/* ---------------- DataTable ---------------- */
export interface Column<T> {
  key: string;
  header: string;
  width?: string;
  sortable?: boolean;
  sortValue?: (row: T) => string | number;
  render: (row: T, index: number) => ReactNode;
}
export function DataTable<T extends { id: string }>({
  rows, columns, pageSize = 9, searchable = false, searchKeys = [], searchPlaceholder = 'Search…',
  onRowClick, emptyTitle = 'No records found', emptyBody = 'Try adjusting your search or filters.',
  loading = false,
}: {
  rows: T[]; columns: Column<T>[]; pageSize?: number;
  searchable?: boolean; searchKeys?: (keyof T)[]; searchPlaceholder?: string;
  onRowClick?: (row: T) => void;
  emptyTitle?: string; emptyBody?: string; loading?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    let out = rows;
    if (searchable && query.trim()) {
      const q = query.trim().toLowerCase();
      out = out.filter((r) => searchKeys.some((k) => String(r[k] ?? '').toLowerCase().includes(q)));
    }
    if (sortKey) {
      const col = columns.find((c) => c.key === sortKey);
      if (col?.sortValue) {
        out = [...out].sort((a, b) => {
          const va = col.sortValue!(a); const vb = col.sortValue!(b);
          if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sortDir;
          return String(va).localeCompare(String(vb)) * sortDir;
        });
      }
    }
    return out;
  }, [rows, query, sortKey, sortDir, columns, searchable, searchKeys]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);

  useEffect(() => { setPage(0); }, [query, rows]);

  const toggleSort = (col: Column<T>) => {
    if (!col.sortable) return;
    if (sortKey !== col.key) { setSortKey(col.key); setSortDir(1); }
    else setSortDir((d) => (d === 1 ? -1 : 1));
  };

  return (
    <div>
      {searchable && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <RealisticGlassInput
            icon={<SearchIcon />}
            value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder} className="min-w-[220px] flex-1" aria-label="Search table"
          />
          <span className="font-mono text-[11px] text-text-secondary">{filtered.length} / {rows.length} rows</span>
        </div>
      )}
      <div className="overflow-x-auto rounded-2xl">
        <table className="data-table w-full min-w-[640px] border-collapse text-left text-[13.5px]">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} style={{ width: c.width }} className="px-4 py-3">
                  {c.sortable ? (
                    <button onClick={() => toggleSort(c)} className="inline-flex cursor-pointer items-center gap-1.5 hover:text-text-primary">
                      {c.header}
                      {sortKey === c.key
                        ? (sortDir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)
                        : <ArrowUpDown size={12} className="opacity-40" />}
                    </button>
                  ) : c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c.key} className="px-4 py-3.5"><div className="skeleton h-4 w-3/4 rounded-md" /></td>
                  ))}
                </tr>
              ))
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-14 text-center">
                  <EmptyState title={emptyTitle} body={emptyBody} compact />
                </td>
              </tr>
            ) : (
              pageRows.map((row, i) => (
                <tr key={row.id} onClick={() => onRowClick?.(row)} className={cn(onRowClick && 'cursor-pointer')}>
                  {columns.map((c) => (
                    <td key={c.key} className="px-4 py-3 text-text-primary">{c.render(row, i)}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {pageCount > 1 && !loading && (
        <div className="mt-4 flex items-center justify-between">
          <p className="font-mono text-[11px] text-text-secondary">
            Page {safePage + 1} of {pageCount}
          </p>
          <div className="flex items-center gap-1.5">
            <RealisticGlassButton size="sm" variant="ghost" icon={<ChevronLeft size={15} />} onClick={() => setPage(Math.max(0, safePage - 1))} disabled={safePage === 0}>Prev</RealisticGlassButton>
            <div className="flex items-center gap-1">
              {Array.from({ length: pageCount }).slice(0, 5).map((_, i) => {
                const p = pageCount <= 5 ? i : Math.min(Math.max(safePage - 2, 0), pageCount - 5) + i;
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={cn(
                      'h-8 w-8 cursor-pointer rounded-lg font-mono text-[12px] transition-colors',
                      p === safePage ? 'bg-periwinkle-3 text-text-primary' : 'text-text-secondary hover:bg-lavender-2/70',
                    )}
                  >
                    {p + 1}
                  </button>
                );
              })}
            </div>
            <RealisticGlassButton size="sm" variant="ghost" icon={<ChevronRight size={15} />} onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))} disabled={safePage === pageCount - 1}>Next</RealisticGlassButton>
          </div>
        </div>
      )}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
  );
}

/* ---------------- Tabs ---------------- */
export function Tabs<T extends string>({ tabs, value, onChange }: {
  tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div data-glass="secondary" className="glass-surface flex flex-wrap items-center gap-1.5 rounded-[18px] p-1.5" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={cn(
            'flex cursor-pointer items-center gap-2 rounded-xl px-3.5 py-2 text-[13px] font-semibold transition-all duration-300',
            value === t.id
              ? 'bg-periwinkle-2 text-text-primary shadow-tab'
              : 'text-text-secondary hover:bg-lavender-2/70 hover:text-text-primary',
          )}
        >
          {t.label}
          {t.count !== undefined && (
            <span className={cn('rounded-full px-1.5 py-0.5 font-mono text-[10px]', value === t.id ? 'bg-periwinkle-3 text-text-primary' : 'bg-periwinkle-2/40 text-text-secondary')}>
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Modal ---------------- */
export function Modal({ open, onClose, title, subtitle, children, width = 'max-w-lg', footer }: {
  open: boolean; onClose: () => void; title: string; subtitle?: string; children: ReactNode; width?: string; footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', fn); document.body.style.overflow = ''; };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-3 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="animate-fade-in absolute inset-0 bg-text-primary/45 backdrop-blur-[6px]" onClick={onClose} />
      <RealisticGlassModal className={cn('animate-scale-in relative max-h-[90vh] w-full overflow-y-auto p-6 sm:p-7', width)}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h3 className="font-display text-[19px] font-bold tracking-tight text-text-primary">{title}</h3>
            {subtitle && <p className="mt-1 text-[13px] text-text-secondary">{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Close dialog" className="btn-glass grid h-9 w-9 cursor-pointer place-items-center rounded-xl">
            <X size={16} />
          </button>
        </div>
        {children}
        {footer && <div className="mt-6 flex flex-wrap justify-end gap-2.5 border-t border-periwinkle-2/20 pt-5">{footer}</div>}
      </RealisticGlassModal>
    </div>
  );
}

/* ---------------- Drawer ---------------- */
export function Drawer({ open, onClose, title, subtitle, children, footer }: {
  open: boolean; onClose: () => void; title: string; subtitle?: string; children: ReactNode; footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', fn); document.body.style.overflow = ''; };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label={title}>
      <div className="animate-fade-in absolute inset-0 bg-text-primary/45 backdrop-blur-[6px]" onClick={onClose} />
      <GlassDrawer className="animate-slide-in-right absolute top-0 right-0 flex h-full w-full max-w-[420px] flex-col p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h3 className="font-display text-[19px] font-bold tracking-tight text-text-primary">{title}</h3>
            {subtitle && <p className="mt-1 text-[13px] text-text-secondary">{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Close panel" className="btn-glass grid h-9 w-9 cursor-pointer place-items-center rounded-xl">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto pr-1">{children}</div>
        {footer && <div className="mt-5 flex justify-end gap-2.5 border-t border-periwinkle-2/20 pt-5">{footer}</div>}
      </GlassDrawer>
    </div>
  );
}

/* ---------------- Empty / Error / Loading states ---------------- */
export function EmptyState({ title, body, action, compact = false }: { title: string; body: string; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'py-2' : 'py-10')}>
      <span className="grid h-12 w-12 place-items-center rounded-2xl border border-periwinkle-2/50 bg-periwinkle-2/40 text-text-secondary">
        <SearchX size={20} />
      </span>
      <p className="font-display mt-3 text-[15px] font-bold text-text-primary">{title}</p>
      <p className="mt-1 max-w-[300px] text-[13px] text-text-secondary">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', body = 'We could not load this view. Please try again.', onRetry }: { title?: string; body?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl border border-error/50 bg-white/40 text-error">
        <X size={20} />
      </span>
      <p className="font-display mt-3 text-[15px] font-bold text-error">{title}</p>
      <p className="mt-1 max-w-[300px] text-[13px] text-text-secondary">{body}</p>
      {onRetry && <div className="mt-4"><RealisticGlassButton onClick={onRetry}>Try again</RealisticGlassButton></div>}
    </div>
  );
}

export function LoadingCards({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <RealisticGlassCard key={i}>
          <div className="skeleton h-4 w-1/3 rounded-md" />
          <div className="skeleton mt-3 h-8 w-2/3 rounded-lg" />
          <div className="skeleton mt-3 h-3 w-1/2 rounded-md" />
        </RealisticGlassCard>
      ))}
    </div>
  );
}

/* ---------------- ChartCard ---------------- */
export function ChartCard({ title, subtitle, action, children, className }: {
  title: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <RealisticGlassCard hover className={className}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-[16px] font-bold tracking-tight text-text-primary">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[12.5px] text-text-secondary">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </RealisticGlassCard>
  );
}

/* ---------------- FileUploader ---------------- */
export function FileUploader({ onFiles, compact = false }: { onFiles?: (files: File[]) => void; compact?: boolean }) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); onFiles?.(Array.from(e.dataTransfer.files)); }}
      className={cn(
        'flex w-full cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed transition-all duration-300',
        compact ? 'px-4 py-6' : 'px-6 py-10',
        drag ? 'border-baby-blue-ice bg-periwinkle-2/70 scale-[1.01]' : 'border-periwinkle-2/50 bg-white/35 hover:bg-lavender-2/70',
      )}
    >
      <span className="grid h-11 w-11 place-items-center rounded-2xl border border-periwinkle-3/50 bg-periwinkle-2/50 text-text-primary">
        <CloudUpload size={20} />
      </span>
      <p className="mt-3 text-[13.5px] font-semibold text-text-primary">Drop files here or <span className="underline underline-offset-2">browse</span></p>
      <p className="font-mono mt-1 text-[11px] text-text-secondary">PDF · DOCX · XLSX · PNG · MP4 · up to 200 MB</p>
      <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => onFiles?.(Array.from(e.target.files ?? []))} />
    </button>
  );
}

/* ---------------- Section heading ---------------- */
export function SectionHead({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="font-display text-[20px] font-bold tracking-tight text-text-primary">{title}</h2>
        {body && <p className="mt-1 text-[13.5px] text-text-secondary">{body}</p>}
      </div>
      {action && <div className="flex flex-wrap gap-2">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------
   Aliases: every component above is the same GlassSurface material,
   so pages may import either the Glass* or the Realistic* name.
------------------------------------------------------------------ */
export const GlassCard = RealisticGlassCard;
export const GlassPanel = RealisticGlassPanel;
export const GlassButton = RealisticGlassButton;
export const GlassInput = RealisticGlassInput;
export const GlassModal = RealisticGlassModal;
export const RealisticGlassSurface = GlassSurface;
export const RealisticGlassDrawer = GlassDrawer;
export const RealisticGlassPopover = GlassPopover;

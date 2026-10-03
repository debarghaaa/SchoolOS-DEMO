import { useMemo, useState } from 'react';
import {
  ChevronRight, FileCode2, FileImage, FileSpreadsheet, FileText, FileVideo2,
  Files as FilesIcon, Folder, LayoutGrid, List, Presentation, Star, Upload,
} from 'lucide-react';
import { FILES } from '../lib/data';
import { useApp } from '../lib/store';
import type { FileItem } from '../lib/types';
import { cn } from '../lib/utils';
import { Can, FieldLabel, FileUploader, GlassButton, GlassCard, GlassInput, Modal, SectionHead } from '../components/glass';

const KIND_ICON: Record<FileItem['kind'], React.ReactNode> = {
  folder: <Folder size={22} />,
  pdf: <FileText size={22} />,
  sheet: <FileSpreadsheet size={22} />,
  doc: <FileText size={22} />,
  slide: <Presentation size={22} />,
  image: <FileImage size={22} />,
  video: <FileVideo2 size={22} />,
  code: <FileCode2 size={22} />,
};
const KIND_LABEL: Record<FileItem['kind'], string> = {
  folder: 'Folder', pdf: 'PDF', sheet: 'Sheet', doc: 'Doc', slide: 'Slides', image: 'Image', video: 'Video', code: 'Code',
};

export function Files() {
  const { pushToast } = useApp();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [starred, setStarred] = useState<Set<string>>(new Set(FILES.filter((f) => f.starred).map((f) => f.id)));
  const [uploadOpen, setUploadOpen] = useState(false);
  const [path, setPath] = useState(['Drive']);

  const rows = useMemo(() => FILES.filter((f) =>
    (kind === 'all' || (kind === 'starred' ? starred.has(f.id) : f.kind === kind)) &&
    f.name.toLowerCase().includes(query.toLowerCase())
  ), [kind, query, starred]);

  const toggleStar = (id: string) => {
    setStarred((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const openItem = (f: FileItem) => {
    if (f.kind === 'folder') {
      setPath((p) => [...p, f.name]);
      pushToast({ title: f.name, body: 'Folder opened · 14 items inside.', tone: 'info' });
    } else {
      pushToast({ title: 'Preview opened', body: `${f.name} · ${f.size}`, tone: 'info' });
    }
  };

  return (
    <div className="animate-fade-up space-y-5">
      <div className="grid gap-5 xl:grid-cols-3">
        <GlassCard className="xl:col-span-2">
          {/* Breadcrumb + actions */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <nav className="flex items-center gap-1 font-mono text-[11.5px] text-text-secondary" aria-label="Path">
              {path.map((p, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight size={12} className="text-text-secondary" />}
                  <button
                    onClick={() => setPath(path.slice(0, i + 1))}
                    className={cn('cursor-pointer rounded-md px-1.5 py-0.5 hover:bg-lavender-2/70', i === path.length - 1 ? 'font-bold text-text-primary' : '')}
                  >
                    {p}
                  </button>
                </span>
              ))}
            </nav>
            <div className="flex gap-2">
              <div className="flex rounded-xl border border-periwinkle-2/50 bg-white/35 p-1">
                <button onClick={() => setView('grid')} aria-label="Grid view" className={view === 'grid' ? 'grid h-8 w-8 place-items-center rounded-lg bg-periwinkle-3 text-text-primary' : 'grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-text-secondary'}><LayoutGrid size={15} /></button>
                <button onClick={() => setView('list')} aria-label="List view" className={view === 'list' ? 'grid h-8 w-8 place-items-center rounded-lg bg-periwinkle-3 text-text-primary' : 'grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-text-secondary'}><List size={15} /></button>
              </div>
              <Can do="file.upload">
                <GlassButton variant="primary" icon={<Upload size={15} />} onClick={() => setUploadOpen(true)}>Upload</GlassButton>
              </Can>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <GlassInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search files…" className="min-w-[200px] flex-1" />
            <div className="flex flex-wrap gap-1.5">
              {['all', 'starred', 'folder', 'pdf', 'sheet', 'doc', 'slide', 'image', 'video', 'code'].map((k) => (
                <button
                  key={k} onClick={() => setKind(k)}
                  className={cn(
                    'cursor-pointer rounded-full px-3 py-1.5 font-mono text-[11px] font-semibold transition-all',
                    kind === k ? 'bg-periwinkle-3 text-text-primary' : 'border border-periwinkle-2/50 bg-white/35 text-text-secondary hover:bg-lavender-2/70',
                  )}
                >
                  {k === 'all' ? 'All' : k === 'starred' ? '★ Starred' : KIND_LABEL[k as FileItem['kind']]}
                </button>
              ))}
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-periwinkle-2/60 bg-white/35 p-10 text-center">
              <FilesIcon size={26} className="mx-auto text-text-secondary" />
              <p className="font-display mt-2 text-[15px] font-bold text-text-primary">Nothing here</p>
              <p className="mt-1 text-[13px] text-text-secondary">No files match “{query}”. Try another filter.</p>
            </div>
          ) : view === 'grid' ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((f) => (
                <div key={f.id} className="group relative rounded-[20px] border border-periwinkle-2/40 bg-white/35 p-4 transition-all duration-300 hover:-translate-y-[2px] hover:bg-lavender-2/70">
                  <button onClick={() => toggleStar(f.id)} aria-label={starred.has(f.id) ? 'Unstar' : 'Star'} className="absolute top-3 right-3 cursor-pointer text-text-secondary hover:text-text-primary">
                    <Star size={15} className={starred.has(f.id) ? 'fill-icon-accent text-icon-accent' : ''} />
                  </button>
                  <button onClick={() => openItem(f)} className="w-full cursor-pointer text-left">
                    <span className="grid h-12 w-12 place-items-center rounded-2xl border border-periwinkle-3/50 bg-periwinkle-2/50 text-text-primary">{KIND_ICON[f.kind]}</span>
                    <p className="mt-2.5 truncate text-[13px] font-bold text-text-primary">{f.name}</p>
                    <p className="mt-0.5 font-mono text-[10.5px] text-text-secondary">{KIND_LABEL[f.kind]} · {f.size} · {f.shared} shared</p>
                    <p className="mt-0.5 truncate font-mono text-[10.5px] text-text-secondary">{f.modified} · {f.owner}</p>
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-1.5">
              {rows.map((f) => (
                <div key={f.id} className="flex items-center gap-3 rounded-2xl border border-periwinkle-2/30 bg-white/35 px-3.5 py-2.5 transition-colors hover:bg-lavender-2/70">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-periwinkle-3/50 bg-periwinkle-2/50 text-text-primary">{KIND_ICON[f.kind]}</span>
                  <button onClick={() => openItem(f)} className="min-w-0 flex-1 cursor-pointer text-left">
                    <p className="truncate text-[13px] font-bold text-text-primary">{f.name}</p>
                    <p className="font-mono text-[10.5px] text-text-secondary">{f.modified} · {f.owner}</p>
                  </button>
                  <span className="hidden font-mono text-[11px] text-text-secondary sm:inline">{f.size}</span>
                  <button onClick={() => toggleStar(f.id)} aria-label="Star" className="cursor-pointer text-text-secondary hover:text-text-primary">
                    <Star size={15} className={starred.has(f.id) ? 'fill-icon-accent text-icon-accent' : ''} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </GlassCard>

        <div className="space-y-5">
          <GlassCard hover>
            <SectionHead title="Storage" body="Shared drive · Northview High" />
            <p className="font-display text-[32px] leading-none font-bold text-text-primary tabular-nums">68.4 <span className="text-[16px] text-text-secondary">/ 100 GB</span></p>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-periwinkle-2/40">
              <div className="h-full w-[68%] rounded-full bg-periwinkle-3" />
            </div>
            <div className="mt-3 space-y-1.5 text-[12.5px]">
              {[['Video & media', '41.2 GB'], ['Documents', '18.6 GB'], ['Backups', '8.6 GB']].map(([k, v]) => (
                <div key={k} className="flex justify-between"><span className="text-text-secondary">{k}</span><span className="font-mono font-semibold text-text-primary tabular-nums">{v}</span></div>
              ))}
            </div>
            <GlassButton className="mt-4 w-full" onClick={() => pushToast({ title: 'Cleanup suggested', body: '4.1 GB of duplicates found in Media Club folder.', tone: 'info' })}>Review storage</GlassButton>
          </GlassCard>

          <GlassCard hover>
            <h3 className="font-display text-[16px] font-bold tracking-tight text-text-primary">Shared with me</h3>
            <div className="mt-3 space-y-2">
              {FILES.slice(2, 6).map((f) => (
                <button key={f.id} onClick={() => openItem(f)} className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-periwinkle-2/30 bg-white/35 px-3 py-2 text-left hover:bg-lavender-2/70">
                  <span className="text-text-secondary">{KIND_ICON[f.kind]}</span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-text-primary">{f.name}</span>
                </button>
              ))}
            </div>
          </GlassCard>
        </div>
      </div>

      <Modal open={uploadOpen} onClose={() => setUploadOpen(false)} title="Upload files" subtitle={`Destination · ${path.join(' / ')}`}
        footer={<>
          <GlassButton variant="ghost" onClick={() => setUploadOpen(false)}>Done</GlassButton>
        </>}>
        <FieldLabel>Files</FieldLabel>
        <FileUploader onFiles={(fs) => pushToast({ title: `${fs.length} file${fs.length > 1 ? 's' : ''} uploading`, body: fs.map((f) => f.name).slice(0, 2).join(', ') + (fs.length > 2 ? ` +${fs.length - 2} more` : ''), tone: 'success' })} />
      </Modal>
    </div>
  );
}

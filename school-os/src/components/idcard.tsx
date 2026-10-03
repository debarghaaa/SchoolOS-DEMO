import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import { BadgeCheck, Copy, Download, Printer, QrCode, RefreshCw } from 'lucide-react';
import {
  canSeePrivate, resolveDemoVerification, SCHOOL, verifyDeepLink,
  type CardRelation, type IdCardData, type VerifiedProfile,
} from '../lib/idcard';
import { useIdToken, type IdCredential, type IdNaturalKey } from '../lib/idcard-live';
import { useApp } from '../lib/store';
import { drawIdCardPng, printIdCard } from '../lib/idcard-export';
import { Can, GlassButton, Modal, StatusBadge } from './glass';

/* =====================================================================
   Digital ID cards — front layout, QR preview modal, PNG export, print.

   Cards render canonical data only, in the Alice Blue / periwinkle system
   with the app's own fonts. Exports (PNG download, print window) redraw
   the same card — what you see is what you get.
   ===================================================================== */

/* ---------------- school brand mark (matches the app favicon) ---------------- */

export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-label={`${SCHOOL.name} logo`} role="img">
      <rect width="32" height="32" rx="9" fill="#EDF2FB" />
      <path d="M9 20.5 16 9l7 11.5" stroke="#182033" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="16" cy="22.6" r="1.6" fill="#ABC4FF" />
    </svg>
  );
}

/* ---------------- QR canvas ---------------- */

export function QrCanvas({ text, size, canvasRef, className }: {
  text: string;
  size: number;
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
  className?: string;
}) {
  const inner = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = canvasRef?.current ?? inner.current;
    if (!canvas) return;
    QRCode.toCanvas(canvas, text, {
      width: size, margin: 1, color: { dark: '#182033', light: '#ffffff' },
    }).then(() => undefined, () => undefined);
  }, [text, size, canvasRef]);
  return (
    <canvas
      ref={canvasRef ?? inner} className={className}
      role="img" aria-label="ID verification QR code"
    />
  );
}

/* ---------------- ID card front ---------------- */

const HUES = [225, 232, 222, 228, 218, 235];

export function IdCard({ card, showPrivate, qrText, version, onQr }: {
  card: IdCardData;
  showPrivate: boolean;
  qrText: string;
  version: number;
  onQr?: () => void;
}) {
  const hue = HUES[card.hue % HUES.length];
  const privates = [
    card.guardian !== '' ? { label: 'Guardian', value: card.guardian } : null,
    card.email !== '' ? { label: 'Email', value: card.email } : null,
    card.phone !== '' ? { label: 'Phone', value: card.phone } : null,
  ].filter((l): l is { label: string; value: string } => l !== null);
  return (
    <div
      className="relative overflow-hidden rounded-[22px] border border-periwinkle-2/60 shadow-lift"
      style={{ background: 'linear-gradient(135deg, #F8FBFF 0%, #EDF2FB 55%, #DCE7FB 100%)' }}
    >
      <div className="h-1.5 bg-[linear-gradient(90deg,#ABC4FF,#C1D3FE,#B6CCFE,#ABC4FF)]" />
      <div className="space-y-3.5 p-4 sm:p-5">
        {/* header */}
        <div className="flex items-center gap-3">
          <BrandMark size={40} />
          <div className="min-w-0 flex-1">
            <p className="font-display truncate text-[16px] leading-tight font-bold tracking-tight text-text-primary sm:text-[18px]">
              {SCHOOL.name}
            </p>
            <p className="font-mono text-[10px] tracking-[0.08em] text-text-secondary uppercase">
              {SCHOOL.trust} · {SCHOOL.code} · {SCHOOL.place}
            </p>
          </div>
          {card.session !== '' && (
            <span className="shrink-0 rounded-full border border-periwinkle-2/60 bg-white/50 px-2.5 py-1 font-mono text-[10.5px] font-semibold text-text-primary">
              {card.session}
            </span>
          )}
        </div>

        <div className="h-px bg-periwinkle-2/50" />

        {/* body */}
        <div className="flex items-center gap-3.5 sm:gap-4">
          <div
            className="grid h-[76px] w-[76px] shrink-0 place-items-center rounded-2xl border border-white/60 shadow-sm sm:h-[92px] sm:w-[92px]"
            style={{ background: `linear-gradient(140deg, hsl(${hue} 90% 82%), hsl(${hue} 85% 72%))` }}
            aria-label={`Photo placeholder for ${card.fullName}`}
          >
            <span className="font-display text-[26px] font-bold text-text-primary sm:text-[32px]">{card.initials}</span>
          </div>
          <div className="min-w-0">
            <p className="font-display truncate text-[20px] leading-tight font-bold tracking-tight text-text-primary sm:text-[24px]">
              {card.fullName}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <StatusBadge tone="active">{card.roleLabel}</StatusBadge>
              <span className="font-mono text-[12px] font-semibold text-text-primary sm:text-[13px]">{card.institutionalId}</span>
            </div>
          </div>
        </div>

        {/* details */}
        <dl className="grid grid-cols-3 gap-2">
          {card.lines.map((l) => (
            <div key={l.label} className="min-w-0 rounded-xl border border-periwinkle-2/40 bg-white/45 px-2.5 py-2">
              <dt className="truncate font-mono text-[9px] tracking-[0.08em] text-text-secondary uppercase sm:text-[9.5px]">{l.label}</dt>
              <dd className="truncate text-[12px] font-bold text-text-primary sm:text-[13px]" title={l.value}>{l.value}</dd>
            </div>
          ))}
        </dl>
        {showPrivate && privates.length > 0 && (
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {privates.map((l) => (
              <div key={l.label} className="flex min-w-0 items-baseline gap-2 rounded-xl bg-white/35 px-2.5 py-1.5">
                <dt className="shrink-0 font-mono text-[9.5px] tracking-[0.06em] text-text-secondary uppercase">{l.label}</dt>
                <dd className="truncate text-[12px] font-semibold text-text-primary" title={l.value}>{l.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {/* footer */}
        <div className="flex items-center gap-3 rounded-2xl border border-periwinkle-2/40 bg-white/40 p-2.5">
          {onQr ? (
            <button
              onClick={onQr} title="Open ID QR"
              className="shrink-0 cursor-pointer rounded-xl border border-periwinkle-2/50 bg-white p-1 transition-transform hover:scale-[1.03]"
            >
              <QrCanvas text={qrText} size={64} />
            </button>
          ) : (
            <span className="shrink-0 rounded-xl border border-periwinkle-2/50 bg-white p-1">
              <QrCanvas text={qrText} size={64} />
            </span>
          )}
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-text-primary">
              <BadgeCheck size={15} className="shrink-0 text-periwinkle-3" /> Scan to verify identity
            </p>
            <p className="mt-0.5 truncate font-mono text-[10px] text-text-secondary">
              {SCHOOL.code} · credential v{version} · {card.institutionalId}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- post-scan preview (shared by modal + verify page) ---------------- */

export function VerifyCard({ profile, compact = false }: { profile: VerifiedProfile; compact?: boolean }) {
  return (
    <div className="rounded-2xl border border-periwinkle-2/50 bg-white/50 p-4">
      <div className="flex items-center gap-3">
        <div
          className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-white/60 font-display text-[17px] font-bold text-text-primary"
          style={{ background: 'linear-gradient(140deg, #CCDBFD, #ABC4FF)' }}
        >
          {profile.initials}
        </div>
        <div className="min-w-0">
          <p className="truncate font-display text-[16px] font-bold text-text-primary">{profile.name}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <StatusBadge tone="success">Verified</StatusBadge>
            <StatusBadge tone="neutral">{profile.roleLabel}</StatusBadge>
          </div>
        </div>
      </div>
      {!compact && (
        <dl className="mt-3 space-y-1.5 text-[12.5px]">
          {profile.institutionalId !== '' && (
            <div className="flex justify-between gap-3">
              <dt className="text-text-secondary">ID</dt>
              <dd className="font-mono font-semibold text-text-primary">{profile.institutionalId}</dd>
            </div>
          )}
          <div className="flex justify-between gap-3">
            <dt className="text-text-secondary">{profile.role === 'student' ? 'Class' : 'Detail'}</dt>
            <dd className="text-right font-semibold text-text-primary">{profile.line1}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-text-secondary">{profile.role === 'student' ? 'House' : 'Status'}</dt>
            <dd className="text-right font-semibold text-text-primary">{profile.line2}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-text-secondary">School</dt>
            <dd className="text-right font-semibold text-text-primary">{profile.school}</dd>
          </div>
        </dl>
      )}
      <p className="mt-2.5 font-mono text-[10px] text-text-secondary">
        credential v{profile.version} · {profile.source === 'live' ? 'live record' : 'example credential'}
      </p>
    </div>
  );
}

/* ---------------- QR modal: preview + all actions ---------------- */

export function QrModal({ card, credential, showPrivate, preview, onClose }: {
  card: IdCardData;
  credential: IdCredential;
  showPrivate: boolean;
  preview: VerifiedProfile | null;
  onClose: () => void;
}) {
  const { pushToast } = useApp();
  const qrRef = useRef<HTMLCanvasElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingRegen, setConfirmingRegen] = useState(false);
  const link = verifyDeepLink(credential.token);

  const downloadDataUrl = (dataUrl: string, filename: string) => {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(card.institutionalId);
      pushToast({ title: 'ID copied', body: card.institutionalId, tone: 'success' });
    } catch {
      setError('Copy failed — select the ID manually.');
    }
  };

  const downloadQr = () => {
    if (!qrRef.current) return;
    downloadDataUrl(qrRef.current.toDataURL('image/png'), `${card.institutionalId}-qr.png`);
    pushToast({ title: 'QR downloaded', body: `${card.institutionalId}-qr.png`, tone: 'success' });
  };

  const downloadCard = async () => {
    setBusy(true);
    setError(null);
    try {
      const canvas = await drawIdCardPng(card, { qrText: link, version: credential.version, showPrivate });
      downloadDataUrl(canvas.toDataURL('image/png'), `${card.institutionalId}-id-card.png`);
      pushToast({ title: 'ID card downloaded', body: `${card.institutionalId}-id-card.png`, tone: 'success' });
    } catch {
      setError('Could not render the card image.');
    } finally {
      setBusy(false);
    }
  };

  const printCard = async () => {
    setBusy(true);
    setError(null);
    try {
      await printIdCard(card, { qrText: link, version: credential.version, showPrivate });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Print failed.');
    } finally {
      setBusy(false);
    }
  };

  const regenerate = async () => {
    setBusy(true);
    setError(null);
    try {
      await credential.regenerate();
      setConfirmingRegen(false);
      pushToast({ title: 'Credential rotated', body: 'Previously issued QR codes no longer verify.', tone: 'success' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rotation failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} width="max-w-2xl" title="Generate ID QR" subtitle={`${card.fullName} · ${card.institutionalId}`}>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-3">
          <div className="mx-auto w-fit rounded-2xl border border-periwinkle-2/50 bg-white p-3">
            <QrCanvas text={link} size={208} canvasRef={qrRef} />
          </div>
          <p className="rounded-xl bg-white/40 px-3 py-2 font-mono text-[10.5px] break-all text-text-secondary">{link}</p>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone="neutral">credential v{credential.version}</StatusBadge>
            <StatusBadge tone={credential.source === 'live' ? 'active' : 'pending'}>
              {credential.source === 'live' ? 'live' : 'example'}
            </StatusBadge>
          </div>
        </div>
        <div className="space-y-3">
          <p className="font-mono text-[10.5px] tracking-[0.08em] text-text-secondary uppercase">What a scan shows</p>
          {preview ? <VerifyCard profile={preview} /> : (
            <p className="rounded-2xl border border-dashed border-periwinkle-2/50 p-4 text-[12.5px] text-text-secondary">
              Live credentials preview after the record syncs.
            </p>
          )}
        </div>
      </div>
      {error && <p className="mt-3 text-[12.5px] text-error">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <GlassButton variant="glass" icon={<Copy size={15} />} onClick={() => void copyId()}>Copy ID</GlassButton>
        <GlassButton variant="glass" icon={<QrCode size={15} />} onClick={downloadQr}>Download QR</GlassButton>
        <GlassButton variant="glass" icon={<Download size={15} />} disabled={busy} onClick={() => void downloadCard()}>
          {busy ? 'Rendering…' : 'Download card'}
        </GlassButton>
        <Can do="idcard.manage">
          <GlassButton variant="glass" icon={<Printer size={15} />} disabled={busy} onClick={() => void printCard()}>Print</GlassButton>
          {confirmingRegen ? (
            <>
              <GlassButton variant="glass" disabled={busy} onClick={() => setConfirmingRegen(false)}>Keep v{credential.version}</GlassButton>
              <GlassButton variant="primary" disabled={busy} icon={<RefreshCw size={15} />} onClick={() => void regenerate()}>
                {busy ? 'Rotating…' : 'Confirm rotation'}
              </GlassButton>
            </>
          ) : (
            <GlassButton variant="glass" icon={<RefreshCw size={15} />} onClick={() => setConfirmingRegen(true)}>Regenerate QR</GlassButton>
          )}
        </Can>
      </div>
    </Modal>
  );
}

/* ---------------- profile surface wiring ----------------
   One line per profile surface: card + QR modal + credential plumbing. */

export function ProfileIdSection({ card, natural, relation }: {
  card: IdCardData;
  natural: IdNaturalKey;
  relation: CardRelation;
}) {
  const { role: viewer } = useApp();
  const credential = useIdToken(card.role, card.profileKey, natural);
  const [qrOpen, setQrOpen] = useState(false);
  const showPrivate = canSeePrivate(viewer, relation);
  const qrText = verifyDeepLink(credential.token);
  const preview = credential.source === 'demo'
    ? ((r) => (r.status === 'valid' ? r.profile : null))(resolveDemoVerification(credential.token))
    : null;
  return (
    <>
      <IdCard
        card={card} showPrivate={showPrivate}
        qrText={qrText} version={credential.version}
        onQr={() => setQrOpen(true)}
      />
      {/* Portalled: cards often live inside drawers, whose transformed
          ancestors would shrink a nested fixed-position modal. */}
      {qrOpen && createPortal(
        <QrModal
          card={card} credential={credential} showPrivate={showPrivate}
          preview={preview} onClose={() => setQrOpen(false)}
        />,
        document.body,
      )}
    </>
  );
}

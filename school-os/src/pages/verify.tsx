import { useEffect, useState } from 'react';
import { BadgeCheck, ShieldAlert } from 'lucide-react';
import { SCHOOL, type VerifyResult } from '../lib/idcard';
import { ID_LIVE, resolveVerification } from '../lib/idcard-live';
import { BrandMark, VerifyCard } from '../components/idcard';
import { GlassCard, LoadingCards } from '../components/glass';

/* =====================================================================
   Public ID verification — the /verify/<token> boot mode (see main.tsx).
   No login, no app chrome, no role state: the token resolves to the safe
   projection only. Renders outside <AppProvider> on purpose.
   ===================================================================== */

const REASONS: Record<string, { title: string; body: string }> = {
  malformed: { title: 'Not a School OS credential', body: 'This code was not issued as a School OS identity credential.' },
  tampered: { title: 'Signature check failed', body: 'This code appears altered. Only credentials issued by the school verify.' },
  unknown: { title: 'No matching profile', body: 'No school record matches this credential.' },
  revoked: { title: 'Credential replaced', body: 'A newer credential was issued for this profile. Ask the holder for the current QR.' },
  'live-unavailable': { title: 'Connection needed', body: 'Live verification needs a network connection. Retry when online.' },
  'live-error': { title: 'Verification unreachable', body: 'The verification service did not respond. Retry shortly.' },
};

export function VerifyApp({ token }: { token: string }) {
  const [result, setResult] = useState<VerifyResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    resolveVerification(token).then(
      (r) => { if (!cancelled) setResult(r); },
      () => { if (!cancelled) setResult({ status: 'invalid', reason: 'live-error' }); },
    );
    return () => { cancelled = true; };
  }, [token]);

  return (
    <div
      className="flex min-h-screen items-start justify-center px-4 py-10 sm:items-center"
      style={{ background: 'linear-gradient(160deg, #F8FBFF 0%, #EDF2FB 50%, #DCE7FB 100%)' }}
    >
      <div className="w-full max-w-[460px] space-y-4">
        <div className="flex items-center justify-center gap-3">
          <BrandMark size={44} />
          <div>
            <p className="font-display text-[19px] font-bold tracking-tight text-text-primary">{SCHOOL.name}</p>
            <p className="font-mono text-[10.5px] tracking-[0.08em] text-text-secondary uppercase">
              Identity verification{ID_LIVE ? '' : ' · example mode'}
            </p>
          </div>
        </div>

        {!result && <LoadingCards count={1} />}

        {result?.status === 'valid' && (
          <GlassCard>
            <div className="mb-3 flex items-center gap-2 rounded-2xl border border-success/40 bg-success/10 px-3.5 py-2.5">
              <BadgeCheck size={18} className="shrink-0 text-success" />
              <div>
                <p className="text-[13.5px] font-bold text-text-primary">Verified identity</p>
                <p className="font-mono text-[10.5px] text-text-secondary">
                  checked {new Date().toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
            <VerifyCard profile={result.profile} />
          </GlassCard>
        )}

        {result?.status === 'invalid' && (
          <GlassCard>
            <div className="flex flex-col items-center py-6 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-2xl border border-error/40 bg-error/10 text-error">
                <ShieldAlert size={22} />
              </span>
              <p className="font-display mt-3 text-[17px] font-bold text-text-primary">
                {REASONS[result.reason].title}
              </p>
              <p className="mt-1 max-w-[300px] text-[13px] text-text-secondary">
                {REASONS[result.reason].body}
              </p>
            </div>
          </GlassCard>
        )}

        <p className="text-center font-mono text-[10.5px] leading-relaxed text-text-secondary">
          Only public verification details appear here — never contact
          information, records, or history.
        </p>
      </div>
    </div>
  );
}

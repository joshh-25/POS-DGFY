import React, { useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { IMIN_POS_FEEDBACK_EVENT, isIminWrapperRuntime } from '@/src/utils/iminRuntimeFeedback.js';

const TONE_PRESENTATION = {
  success: { icon: CheckCircle2, className: 'border-emerald-200 bg-emerald-50 text-emerald-950', iconClassName: 'text-emerald-700' },
  error: { icon: AlertCircle, className: 'border-rose-200 bg-rose-50 text-rose-950', iconClassName: 'text-rose-700' },
  warning: { icon: AlertTriangle, className: 'border-amber-200 bg-amber-50 text-amber-950', iconClassName: 'text-amber-700' },
  info: { icon: Info, className: 'border-sky-200 bg-sky-50 text-sky-950', iconClassName: 'text-sky-700' }
};

// Errors used to persist forever (duration: 0) so they could never be missed
// -- but combined with the old inline layout that also meant they piled up
// and pushed the page down. As a floating, auto-dismissing overlay they no
// longer need to be permanent; the manual dismiss button remains for anyone
// who wants a failure gone sooner.
const defaultDuration = (tone) => (tone === 'error' ? 6_000 : 3_500);

export default function IminTerminalFeedback() {
  const [feedback, setFeedback] = useState([]);
  const isImin = isIminWrapperRuntime();

  useEffect(() => {
    if (!isImin || typeof window === 'undefined') return undefined;

    const onFeedback = (event) => {
      const next = event?.detail;
      if (!next?.id || !next?.message) return;
      // Capped at 2: as a floating overlay (rather than the old inline
      // section) a taller stack starts covering real terminal content.
      setFeedback((current) => [next, ...current.filter((entry) => entry.id !== next.id)].slice(0, 2));

      const duration = next.duration ?? defaultDuration(next.tone);
      if (duration > 0) {
        window.setTimeout(() => {
          setFeedback((current) => current.filter((entry) => entry.id !== next.id));
        }, duration);
      }
    };

    window.addEventListener(IMIN_POS_FEEDBACK_EVENT, onFeedback);
    return () => window.removeEventListener(IMIN_POS_FEEDBACK_EVENT, onFeedback);
  }, [isImin]);

  if (!isImin || feedback.length === 0) return null;

  // Fixed floating stack, not an inline section: an inline block pushed page
  // content down and, combined with duration:0 errors, meant repeated
  // failures kept growing the header. Floats above the workspace (and above
  // dialogs, which sit at z-[100]) instead. The outer layer stays
  // pointer-events-none so it never blocks touches to whatever is
  // underneath; only the cards themselves re-enable pointer events.
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[200] flex flex-col items-center gap-2 px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]"
      aria-live="polite"
      aria-label="Terminal feedback"
    >
      {feedback.map((entry) => {
        const presentation = TONE_PRESENTATION[entry.tone] || TONE_PRESENTATION.info;
        const Icon = presentation.icon;
        return (
          <div key={entry.id} className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border px-3 py-2.5 shadow-lg ${presentation.className}`} role={entry.tone === 'error' ? 'alert' : 'status'}>
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${presentation.iconClassName}`} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold leading-5">{entry.message}</p>
              {entry.description ? <p className="mt-0.5 text-xs leading-5 opacity-80">{entry.description}</p> : null}
            </div>
            <button type="button" onClick={() => setFeedback((current) => current.filter((item) => item.id !== entry.id))} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg opacity-70 hover:bg-white/60 hover:opacity-100" aria-label="Dismiss terminal message">
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

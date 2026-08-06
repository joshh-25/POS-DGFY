import React, { useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { IMIN_POS_FEEDBACK_EVENT, isIminWrapperRuntime } from '@/src/utils/iminRuntimeFeedback.js';

const TONE_PRESENTATION = {
  success: { icon: CheckCircle2, className: 'border-emerald-200 bg-emerald-50 text-emerald-950', iconClassName: 'text-emerald-700' },
  error: { icon: AlertCircle, className: 'border-rose-200 bg-rose-50 text-rose-950', iconClassName: 'text-rose-700' },
  warning: { icon: AlertTriangle, className: 'border-amber-200 bg-amber-50 text-amber-950', iconClassName: 'text-amber-700' },
  info: { icon: Info, className: 'border-sky-200 bg-sky-50 text-sky-950', iconClassName: 'text-sky-700' }
};

const defaultDuration = (tone) => (tone === 'error' ? 0 : 3_500);

export default function IminTerminalFeedback() {
  const [feedback, setFeedback] = useState([]);
  const isImin = isIminWrapperRuntime();

  useEffect(() => {
    if (!isImin || typeof window === 'undefined') return undefined;

    const onFeedback = (event) => {
      const next = event?.detail;
      if (!next?.id || !next?.message) return;
      setFeedback((current) => [next, ...current.filter((entry) => entry.id !== next.id)].slice(0, 3));

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

  return (
    <section className="mx-4 mt-3 space-y-2 sm:mx-5 lg:mx-7" aria-live="polite" aria-label="Terminal feedback">
      {feedback.map((entry) => {
        const presentation = TONE_PRESENTATION[entry.tone] || TONE_PRESENTATION.info;
        const Icon = presentation.icon;
        return (
          <div key={entry.id} className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 shadow-sm ${presentation.className}`} role={entry.tone === 'error' ? 'alert' : 'status'}>
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
    </section>
  );
}

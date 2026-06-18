import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const toneStyles = {
  info: {
    badge: 'border-sky-200 bg-sky-50 text-sky-800',
    icon: 'text-sky-700'
  },
  success: {
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    icon: 'text-emerald-700'
  },
  warning: {
    badge: 'border-amber-200 bg-amber-50 text-amber-800',
    icon: 'text-amber-700'
  },
  error: {
    badge: 'border-rose-200 bg-rose-50 text-rose-800',
    icon: 'text-rose-700'
  }
};

export default function PosHardwareMessageModal({
  open,
  message = null,
  onOpenChange = () => {}
}) {
  const tone = String(message?.tone || 'info').trim();
  const styles = toneStyles[tone] || toneStyles.info;
  const title = String(message?.title || 'Hardware message').trim();
  const body = String(message?.message || '').trim();
  const source = String(message?.source || 'iMin hardware').trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border border-slate-200 bg-white p-0 shadow-2xl sm:max-w-xl">
        <DialogHeader className="flex flex-row items-start gap-3 border-b border-slate-200 px-5 py-4">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border ${styles.badge}`}>
            <AlertTriangle className={`h-5 w-5 ${styles.icon}`} />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-lg font-black text-slate-950">{title}</DialogTitle>
            <DialogDescription className="mt-1 text-sm text-slate-600">
              {source}
            </DialogDescription>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
            aria-label="Close hardware message"
          >
            <X className="h-4 w-4" />
          </button>
        </DialogHeader>

        <div className="space-y-3 px-5 py-4">
          <div className={`rounded-xl border px-4 py-3 ${styles.badge}`}>
            <p className="text-sm font-semibold leading-6 text-slate-900">{body}</p>
          </div>

          {Array.isArray(message?.details) && message.details.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-black uppercase tracking-wide text-slate-500">Details</p>
              <ul className="mt-2 space-y-1 text-xs leading-5 text-slate-700">
                {message.details.map((entry, index) => (
                  <li key={`${entry}-${index}`}>{String(entry)}</li>
                ))}
              </ul>
            </div>
          )}

          {message?.details && !Array.isArray(message.details) && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-black uppercase tracking-wide text-slate-500">Details</p>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs leading-5 text-slate-700">
                {JSON.stringify(message.details, null, 2)}
              </pre>
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-slate-200 px-5 py-4">
          <Button
            type="button"
            onClick={() => onOpenChange(false)}
            className="min-w-28 bg-[#1A4E8D] font-bold text-white hover:bg-[#143F73]"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

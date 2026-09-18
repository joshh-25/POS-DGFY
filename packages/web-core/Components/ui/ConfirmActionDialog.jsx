import React, { useEffect, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog';
import { Button } from './button';

const getErrorMessage = (error) => (
  error?.response?.data?.message || error?.message || 'The action could not be completed. Please try again.'
);

export default function ConfirmActionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  reasonLabel = '',
  reasonPlaceholder = '',
  reasonRequired = false,
  reasonMinLength = 3,
  onConfirm,
  overlayClassName,
  confirmClassName = ''
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) {
      setError('');
      setReason('');
    }
  }, [open]);

  const handleOpenChange = (nextOpen) => {
    if (submitting) return;
    onOpenChange(nextOpen);
  };

  const handleConfirm = async () => {
    if (submitting) return;
    const normalizedReason = reason.trim();
    if (reasonRequired && normalizedReason.length < reasonMinLength) {
      setError(`${reasonLabel || 'Reason'} must be at least ${reasonMinLength} characters.`);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const result = await onConfirm?.(normalizedReason);
      if (result === false || result?.success === false) {
        setError(result?.message || 'The action could not be completed. Please try again.');
        return;
      }
      onOpenChange(false);
    } catch (actionError) {
      setError(getErrorMessage(actionError));
    } finally {
      setSubmitting(false);
    }
  };

  const destructive = variant === 'destructive';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange} overlayClassName={overlayClassName}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl shadow-slate-950/20 sm:w-full">
        <DialogHeader className="border-b border-slate-100 px-5 py-4 text-left sm:px-6">
          <div className={`mb-2 flex h-10 w-10 items-center justify-center rounded-full ${destructive ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </div>
          <DialogTitle className="text-[16px] font-extrabold text-[#0F172A]">{title}</DialogTitle>
          <DialogDescription className="mt-1 text-[12px] leading-5 text-[#64748B]">{description}</DialogDescription>
        </DialogHeader>
        {error || reasonLabel ? (
          <div className="space-y-4 px-5 py-5 sm:px-6">
            {error ? (
              <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700 sm:text-[14px]">
                {error}
              </div>
            ) : null}
            {reasonLabel ? (
              <label className="grid gap-1.5 text-[12px] font-bold text-slate-700">
                <span>{reasonLabel}{reasonRequired ? ' *' : ''}</span>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder={reasonPlaceholder}
                  rows={3}
                  maxLength={255}
                  disabled={submitting}
                  className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2 text-[16px] font-normal text-[#0F172A] outline-none focus:border-[#1A4E8D] focus:ring-2 focus:ring-[#1A4E8D]/20 sm:text-[14px]"
                />
              </label>
            ) : null}
          </div>
        ) : null}
        <DialogFooter className="flex-row items-center gap-2 border-t border-slate-100 px-5 py-4 sm:justify-end sm:px-6">
          <Button type="button" variant="outline" className="min-h-9 min-w-0 flex-1 text-[13px] font-bold sm:flex-none sm:text-[14px]" onClick={() => handleOpenChange(false)} disabled={submitting}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className={destructive ? 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-600' : confirmClassName}
          >
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {submitting ? 'Working...' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

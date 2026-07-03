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
  onConfirm
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) setError('');
  }, [open]);

  const handleOpenChange = (nextOpen) => {
    if (submitting) return;
    onOpenChange(nextOpen);
  };

  const handleConfirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const result = await onConfirm?.();
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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className={`mb-2 flex h-10 w-10 items-center justify-center rounded-full ${destructive ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </div>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="leading-6">{description}</DialogDescription>
        </DialogHeader>
        {error ? (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className={destructive ? 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-600' : ''}
          >
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {submitting ? 'Working...' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

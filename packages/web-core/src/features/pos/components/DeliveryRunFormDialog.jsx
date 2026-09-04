import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

// Phase 226 (#1273), extended Phase 260 (#1489). Create/edit dialog. Fields match POST/PATCH
// /pos/delivery-runs exactly: label (1-120, required), scheduled_date (date().iso(), sent as
// YYYY-MM-DD, cleared -> null on PATCH / omitted on POST), scheduled_date_end (same shape, an
// optional end date making the run span a range -- omitted/cleared means a single-day run), notes
// (<=2000, ''/null ok). status is edit-only and offers only the three values the PATCH validator
// accepts (draft/scheduled/cancelled) -- dispatched/completed are Phase 228's job and are never
// offered here.

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'cancelled', label: 'Cancelled' }
];

const emptyForm = { label: '', scheduledDate: '', scheduledDateEnd: '', notes: '', status: 'draft' };

export default function DeliveryRunFormDialog({
  open,
  onOpenChange,
  run = null,
  saving = false,
  onSubmit = async () => false
}) {
  const isEdit = Boolean(run?.delivery_run_id);
  const [form, setForm] = React.useState(emptyForm);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!open) return;
    setError('');
    setForm(run
      ? {
        label: run.label || '',
        scheduledDate: run.scheduled_date ? String(run.scheduled_date).slice(0, 10) : '',
        scheduledDateEnd: run.scheduled_date_end ? String(run.scheduled_date_end).slice(0, 10) : '',
        notes: run.notes || '',
        status: STATUS_OPTIONS.some((option) => option.value === run.status) ? run.status : 'draft'
      }
      : emptyForm);
  }, [open, run]);

  const handleSubmit = async () => {
    const trimmedLabel = form.label.trim();
    if (!trimmedLabel || trimmedLabel.length > 120) {
      setError('Label is required and must be 120 characters or fewer.');
      return;
    }
    // Mirror the server's `.with()`/`.min(ref)` range rules client-side so a bad range never
    // round-trips to a 422.
    if (form.scheduledDateEnd && !form.scheduledDate) {
      setError('An end date requires a start date.');
      return;
    }
    if (form.scheduledDate && form.scheduledDateEnd && form.scheduledDateEnd < form.scheduledDate) {
      setError('End date must be on or after the start date.');
      return;
    }
    const payload = {
      label: trimmedLabel,
      notes: form.notes.trim() || null
    };
    if (isEdit) {
      payload.scheduled_date = form.scheduledDate || null;
      payload.scheduled_date_end = form.scheduledDateEnd || null;
      payload.status = form.status;
    } else if (form.scheduledDate) {
      payload.scheduled_date = form.scheduledDate;
      if (form.scheduledDateEnd) payload.scheduled_date_end = form.scheduledDateEnd;
    }
    const succeeded = await onSubmit(payload);
    if (succeeded !== false) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit delivery run' : 'New delivery run'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update this run\'s label, schedule, notes, or status.' : 'Create a new run to group orders for one delivery trip.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Label *</Label>
            <Input
              value={form.label}
              maxLength={120}
              disabled={saving}
              placeholder="e.g. Afternoon Batch 1"
              onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Scheduled date (optional)</Label>
            <input
              type="date"
              value={form.scheduledDate}
              disabled={saving}
              onChange={(event) => setForm((current) => ({ ...current, scheduledDate: event.target.value }))}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold"
            />
          </div>
          <div className="space-y-1.5">
            <Label>End date (optional)</Label>
            <input
              type="date"
              value={form.scheduledDateEnd}
              disabled={saving}
              min={form.scheduledDate || undefined}
              onChange={(event) => setForm((current) => ({ ...current, scheduledDateEnd: event.target.value }))}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold"
            />
          </div>
          {isEdit ? (
            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-slate-700">Status</span>
              <select
                value={form.status}
                disabled={saving}
                onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold"
              >
                {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          ) : null}
          <div className="space-y-1.5">
            <Label>Notes (optional)</Label>
            <Textarea
              value={form.notes}
              maxLength={2000}
              disabled={saving}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            />
          </div>
          {error ? <p className="text-xs font-bold text-rose-700">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={handleSubmit} disabled={saving} className="!bg-[#1A4E8D] text-white hover:!bg-[#123B6D]">
            {saving ? 'Saving...' : isEdit ? 'Save changes' : 'Create run'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

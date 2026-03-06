import React, { useState, useMemo, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { canBeDispatched } from '../utils/categoryHelpers.js';

const emptyLine = () => ({ item_id: '', qty_ordered: '', notes: '' });

/**
 * DOCreateModal — create a new draft DO or edit an existing draft.
 *
 * Props:
 *   open        {boolean}
 *   onClose     {function}
 *   onSave      {function(payload)} — receives validated payload, must return a promise
 *   items       {Array}  — full item list for line item picker
 *   existingDO  {Object|null} — when editing a draft; null for create
 */
export default function DOCreateModal({ open, onClose, onSave, items = [], existingDO = null }) {
  const isEdit = !!existingDO;

  const [recipientName, setRecipientName] = useState(existingDO?.recipient_name || '');
  const [recipientType, setRecipientType] = useState(existingDO?.recipient_type || 'external');
  const [referenceJo, setReferenceJo] = useState(existingDO?.reference_jo || '');
  const [referencePo, setReferencePo] = useState(existingDO?.reference_po || '');
  const [dispatchDate, setDispatchDate] = useState(
    existingDO?.dispatch_date
      ? existingDO.dispatch_date.slice(0, 10)
      : new Date().toISOString().slice(0, 10)
  );
  const [notes, setNotes] = useState(existingDO?.notes || '');
  const [lines, setLines] = useState(
    existingDO?.lines?.length
      ? existingDO.lines.map(l => ({
        item_id: String(l.item_id),
        qty_ordered: String(l.qty_ordered),
        notes: l.notes || ''
      }))
      : [emptyLine()]
  );
  const [submitting, setSubmitting] = useState(false);

  // Sync form state when existingDO or open changes (handles re-open for edit)
  useEffect(() => {
    if (open) {
      setRecipientName(existingDO?.recipient_name || '');
      setRecipientType(existingDO?.recipient_type || 'external');
      setReferenceJo(existingDO?.reference_jo || '');
      setReferencePo(existingDO?.reference_po || '');
      setDispatchDate(
        existingDO?.dispatch_date
          ? existingDO.dispatch_date.slice(0, 10)
          : new Date().toISOString().slice(0, 10)
      );
      setNotes(existingDO?.notes || '');
      setLines(
        existingDO?.lines?.length
          ? existingDO.lines.map(l => ({
            item_id: String(l.item_id),
            qty_ordered: String(l.qty_ordered),
            notes: l.notes || ''
          }))
          : [emptyLine()]
      );
    }
  }, [open, existingDO]);

  const dispatchableItems = useMemo(() => {
    // 1. Base list of items that can be dispatched
    const activeDispatchable = items.filter(i =>
      canBeDispatched(i) && i.status === 'active'
    );

    // 2. We MUST ensure items already in the lines are included, 
    // even if they are inactive, so the display name shows up.
    const selectedIds = new Set(lines.map(l => l.item_id).filter(Boolean));
    const extraItems = items.filter(i =>
      selectedIds.has(String(i.item_id)) &&
      !activeDispatchable.some(ad => String(ad.item_id) === String(i.item_id))
    );

    return [...activeDispatchable, ...extraItems];
  }, [items, lines]);

  const addLine = () => setLines(prev => [...prev, emptyLine()]);

  const removeLine = (idx) => {
    if (lines.length === 1) return;
    setLines(prev => prev.filter((_, i) => i !== idx));
  };

  const updateLine = (idx, field, value) => {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  };

  const validate = () => {
    if (!recipientName.trim()) { toast.error('Recipient name is required'); return false; }
    if (!dispatchDate) { toast.error('Dispatch date is required'); return false; }
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!l.item_id) { toast.error(`Line ${i + 1}: select an item`); return false; }
      const qty = parseFloat(l.qty_ordered);
      if (!qty || qty <= 0) { toast.error(`Line ${i + 1}: quantity must be positive`); return false; }
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const payload = {
        recipient_name: recipientName.trim(),
        recipient_type: recipientType,
        reference_jo: referenceJo.trim() || null,
        reference_po: referencePo.trim() || null,
        dispatch_date: dispatchDate,
        notes: notes.trim() || null,
        lines: lines.map(l => ({
          item_id: parseInt(l.item_id),
          qty_ordered: parseFloat(l.qty_ordered),
          notes: l.notes.trim() || null
        }))
      };
      await onSave(payload);
      handleClose();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to save dispatch order');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isEdit) {
      setRecipientName('');
      setRecipientType('external');
      setReferenceJo('');
      setReferencePo('');
      setDispatchDate(new Date().toISOString().slice(0, 10));
      setNotes('');
      setLines([emptyLine()]);
    }
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto pb-8">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Dispatch Order' : 'New Dispatch Order'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Header fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label>Recipient Name <span className="text-red-500">*</span></Label>
              <Input
                placeholder="Customer or branch name"
                value={recipientName}
                onChange={e => setRecipientName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Recipient Type</Label>
              <Select value={recipientType} onValueChange={setRecipientType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="external">External (Customer)</SelectItem>
                  <SelectItem value="internal">Internal (Branch)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Dispatch Date <span className="text-red-500">*</span></Label>
              <Input
                type="date"
                value={dispatchDate}
                onChange={e => setDispatchDate(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>JO Reference</Label>
              <Input
                placeholder="e.g. JO-2026-0001"
                value={referenceJo}
                onChange={e => setReferenceJo(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>PO Reference</Label>
              <Input
                placeholder="Optional"
                value={referencePo}
                onChange={e => setReferencePo(e.target.value)}
              />
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label>Notes</Label>
              <Textarea
                placeholder="Optional notes about this dispatch"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          {/* Line items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Items to Dispatch</Label>
              <Button variant="outline" size="sm" onClick={addLine}>
                <Plus className="w-4 h-4 mr-1" /> Add Line
              </Button>
            </div>

            {dispatchableItems.length === 0 && (
              <p className="text-sm text-slate-500 bg-amber-50 border border-amber-200 rounded-lg p-3">
                No finished goods items found. Only active finished goods can be dispatched.
              </p>
            )}

            {lines.map((line, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-start p-3 border border-slate-200 rounded-lg bg-slate-50">
                <div className="col-span-5 space-y-1">
                  {idx === 0 && <Label className="text-xs text-slate-500">Item</Label>}
                  <Select value={line.item_id} onValueChange={v => updateLine(idx, 'item_id', v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select item…" />
                    </SelectTrigger>
                    <SelectContent>
                      {dispatchableItems.map(item => (
                        <SelectItem key={item.item_id} value={String(item.item_id)}>
                          {item.name} ({item.sku_code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="col-span-2 space-y-1 relative">
                  {idx === 0 && <Label className="text-xs text-slate-500">Qty</Label>}
                  <div className="relative">
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="Qty"
                      value={line.qty_ordered}
                      onChange={e => updateLine(idx, 'qty_ordered', e.target.value)}
                      className="pr-10"
                    />
                    {line.item_id && (
                      <div className="absolute right-8 top-1/2 -translate-y-1/2 pointer-events-none">
                        <span className="text-sm text-slate-400 font-medium uppercase">
                          {dispatchableItems.find(i => String(i.item_id) === line.item_id)?.unit_of_measure}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="col-span-4 space-y-1">
                  {idx === 0 && <Label className="text-xs text-slate-500">Notes</Label>}
                  <Input
                    placeholder="Optional"
                    value={line.notes}
                    onChange={e => updateLine(idx, 'notes', e.target.value)}
                  />
                </div>

                <div className={`col-span-1 flex ${idx === 0 ? 'mt-5' : 'items-center'}`}>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeLine(idx)}
                    disabled={lines.length === 1}
                    className="text-slate-400 hover:text-red-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isEdit ? 'Save Changes' : 'Create Draft'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

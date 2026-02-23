import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { AlertTriangle, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { formatNumber } from '../../src/lib/numberUtils.js';
import { lossReasons } from '../utils/movementConfig.js';
import { createStockMovement } from '../../src/services/stockMovementService.js';

export default function WriteOffBatchDialog({ open, onClose, batch, item, onSuccess }) {
  const [lossReason, setLossReason] = useState('spoilage');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!batch || !item) return null;

  const remaining = parseFloat(batch.quantity) - parseFloat(batch.quantity_consumed || 0);
  const expiryFormatted = batch.expiry_date
    ? format(new Date(batch.expiry_date), 'MMM d, yyyy')
    : 'Unknown';
  const defaultNote = `Expiry write-off: Batch #${batch.batch_id} expired on ${expiryFormatted}`;

  const projectedStock = Math.max(0, parseFloat(item.current_stock || 0) - remaining);

  const handleOpen = () => {
    // Reset state each time dialog opens
    setLossReason('spoilage');
    setNotes('');
    setError(null);
    setLoading(false);
  };

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    try {
      await createStockMovement({
        item_id: item.item_id || item.id,
        movement_type: 'calculated_loss',
        loss_reason: lossReason,
        batch_id: batch.batch_id,
        quantity: remaining,
        notes: notes.trim() || defaultNote,
        reference_type: 'MANUAL',
      });
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Failed to write off batch. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); else handleOpen(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-700">
            <Trash2 className="w-5 h-5" />
            Write Off Expired Batch
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Batch summary */}
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-1">
            <p className="font-semibold text-slate-900">
              Batch #{batch.batch_id} &middot; {item.name}
            </p>
            <p className="text-sm text-red-700">
              Expired: {expiryFormatted}
            </p>
            {batch.po_number && (
              <p className="text-xs text-slate-500">PO: {batch.po_number}</p>
            )}
          </div>

          {/* Quantity — read only */}
          <div className="space-y-1">
            <Label>Quantity to write off</Label>
            <div className="bg-slate-100 border border-slate-200 rounded-md px-3 py-2 text-sm font-medium text-slate-700">
              {formatNumber(remaining, 2)} {item.unit_of_measure}
            </div>
            <p className="text-xs text-slate-500">Full remaining quantity of this batch will be written off.</p>
          </div>

          {/* Loss reason */}
          <div className="space-y-1">
            <Label>Loss Reason</Label>
            <Select value={lossReason} onValueChange={setLossReason}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {lossReasons.map(r => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <Label>Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={defaultNote}
              rows={2}
            />
          </div>

          {/* Stock impact */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Stock Impact</p>
            <div className="flex items-center justify-between text-sm">
              <div className="text-center">
                <p className="text-xs text-slate-400">Current</p>
                <p className="font-semibold text-slate-900">{formatNumber(item.current_stock, 2)}</p>
              </div>
              <div className="text-red-500 font-bold text-lg">→</div>
              <div className="text-center">
                <p className="text-xs text-slate-400">Change</p>
                <p className="font-semibold text-red-600">-{formatNumber(remaining, 2)}</p>
              </div>
              <div className="text-red-500 font-bold text-lg">→</div>
              <div className="text-center">
                <p className="text-xs text-slate-400">After</p>
                <p className="font-semibold text-slate-900">{formatNumber(projectedStock, 2)}</p>
              </div>
            </div>
            <p className="text-xs text-slate-400 text-center mt-1">{item.unit_of_measure}</p>
          </div>

          {/* Warning notice */}
          <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>This creates a <strong>Calculated Loss</strong> stock movement. It can be voided from the Stock Movements page if needed.</span>
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={loading}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {loading ? 'Writing off...' : 'Confirm Write Off'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

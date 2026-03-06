import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, PackageCheck, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { formatNumber } from '../../src/lib/numberUtils.js';

/**
 * DODispatchModal — execute dispatch (stock deduction) for one or more lines.
 *
 * Props:
 *   open        {boolean}
 *   onClose     {function}
 *   onDispatch  {function(lines[])} — receives array of {line_id, qty_to_dispatch}; must return a promise
 *   do_         {Object} — the Dispatch Order with .lines array
 */
export default function DODispatchModal({ open, onClose, onDispatch, do: doOrder }) {
  const [quantities, setQuantities] = useState({});
  const [submitting, setSubmitting] = useState(false);

  if (!doOrder) return null;

  // Dispatchable lines — those that still have remaining qty
  const dispatchableLines = (doOrder.lines || []).filter(l => {
    const remaining = parseFloat(l.qty_ordered) - parseFloat(l.qty_dispatched || 0);
    return remaining > 0;
  });

  const getQty = (lineId) => quantities[lineId] ?? '';

  const setQty = (lineId, value) => {
    setQuantities(prev => ({ ...prev, [lineId]: value }));
  };

  const getRemaining = (line) => {
    return parseFloat(line.qty_ordered) - parseFloat(line.qty_dispatched || 0);
  };

  const handleSetMax = (line) => {
    setQty(line.line_id, String(getRemaining(line)));
  };

  const validate = () => {
    const entries = dispatchableLines.filter(l => {
      const q = parseFloat(getQty(l.line_id));
      return !isNaN(q) && q > 0;
    });
    if (entries.length === 0) {
      toast.error('Enter a quantity to dispatch for at least one line');
      return false;
    }
    for (const l of entries) {
      const q = parseFloat(getQty(l.line_id));
      const remaining = getRemaining(l);
      if (q > remaining) {
        toast.error(`Line for "${l.item?.name}" exceeds remaining qty (${formatNumber(remaining)})`);
        return false;
      }
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const lines = dispatchableLines
        .filter(l => {
          const q = parseFloat(getQty(l.line_id));
          return !isNaN(q) && q > 0;
        })
        .map(l => ({
          line_id: l.line_id,
          qty_to_dispatch: parseFloat(getQty(l.line_id))
        }));
      await onDispatch(lines);
      setQuantities({});
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Dispatch failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (submitting) return;
    setQuantities({});
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="w-5 h-5 text-teal-600" />
            Execute Dispatch — {doOrder.do_number}
          </DialogTitle>
          <DialogDescription>
            Enter quantities to dispatch for this run. Partial dispatch is supported.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="text-sm text-slate-600">
            <span className="font-medium">Recipient:</span> {doOrder.recipient_name}
          </div>

          {dispatchableLines.length === 0 ? (
            <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3">
              All lines have been fully dispatched.
            </p>
          ) : (
            <div className="space-y-3">
              {dispatchableLines.map(line => {
                const remaining = getRemaining(line);
                const itemName = line.item?.name || `Item #${line.item_id}`;
                const currentStock = parseFloat(line.item?.current_stock || 0);
                const qtyInput = getQty(line.line_id);
                const qtyNum = parseFloat(qtyInput);
                const insufficientStock = !isNaN(qtyNum) && qtyNum > currentStock;

                return (
                  <div key={line.line_id} className="border border-slate-200 rounded-lg p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-slate-900">{itemName}</p>
                        <p className="text-xs text-slate-500">{line.item?.sku_code}</p>
                      </div>
                      <div className="text-right text-sm">
                        <p className="text-slate-500">Ordered: <span className="font-medium text-slate-700">{formatNumber(line.qty_ordered)}</span></p>
                        <p className="text-slate-500">Dispatched: <span className="font-medium text-slate-700">{formatNumber(line.qty_dispatched || 0)}</span></p>
                        <p className="text-teal-600 font-medium">Remaining: {formatNumber(remaining)}</p>
                      </div>
                    </div>

                    {insufficientStock && (
                      <div className="flex items-center gap-2 text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-xs">
                        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                        Current stock ({formatNumber(currentStock)}) may be insufficient
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <div className="flex-1 space-y-1">
                        <Label className="text-xs">Qty to dispatch now</Label>
                        <Input
                          type="number"
                          min="0.001"
                          max={remaining}
                          step="any"
                          placeholder={`Max: ${formatNumber(remaining)}`}
                          value={qtyInput}
                          onChange={e => setQty(line.line_id, e.target.value)}
                        />
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-5 text-xs"
                        onClick={() => handleSetMax(line)}
                      >
                        Full
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          {dispatchableLines.length > 0 && (
            <Button onClick={handleSubmit} disabled={submitting} className="bg-teal-600 hover:bg-teal-700">
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Dispatch
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

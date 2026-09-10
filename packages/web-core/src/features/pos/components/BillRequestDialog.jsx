import React from 'react';
import { Receipt } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const money = (value) => Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatQuantity = (value) => {
  const quantity = Number(value || 0);
  if (!Number.isFinite(quantity)) return '0';
  return quantity.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

export default function BillRequestDialog({ open = false, draft = null, onClose }) {
  const lines = Array.isArray(draft?.lines) ? draft.lines : [];

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose?.()}>
      <DialogContent
        className="w-[calc(100vw-1.5rem)] max-w-lg rounded-xl border border-slate-200 bg-white p-0 shadow-2xl shadow-slate-950/25 sm:w-full"
        data-testid="pos-bill-request-dialog"
      >
        <DialogHeader className="border-b border-slate-200 px-5 py-4 text-left">
          <DialogTitle className="flex items-center gap-2 text-lg font-black text-slate-900">
            <Receipt className="h-5 w-5 text-[#1A4E8D]" />
            Bill Request
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-600">
            Order summary only. No payment has been recorded.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-3 border-b border-slate-200 pb-2 text-[11px] font-black uppercase tracking-wide text-slate-500">
            <span>Item</span>
            <span>Qty</span>
            <span className="text-right">Price</span>
          </div>
          <div className="divide-y divide-slate-100">
            {lines.map((line) => (
              <div
                key={line.lineKey || line.itemId || line.itemName}
                className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 py-3 text-sm"
              >
                <span className="min-w-0 truncate font-semibold text-slate-900">{line.itemName || 'Item'}</span>
                <span className="tabular-nums text-slate-600">{formatQuantity(line.quantity)}</span>
                <span className="text-right font-bold tabular-nums text-slate-900">₱{money(line.unitPrice)}</span>
              </div>
            ))}
            {lines.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-500">No items in this order.</p>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-300 pt-3">
            <span className="font-black text-slate-900">Overall price</span>
            <span className="text-lg font-black tabular-nums text-[#1A4E8D]">₱{money(draft?.total)}</span>
          </div>
        </div>

        <DialogFooter className="border-t border-slate-200 px-5 py-4 sm:justify-end">
          <Button type="button" onClick={onClose} className="bg-[#1A4E8D] font-extrabold text-white hover:bg-[#143F73]">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

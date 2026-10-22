import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';

export default function DeliveryCompletionDialog({
  order = null,
  method = 'cash',
  cashInput = '',
  confirmed = false,
  saving = false,
  onOpenChange = () => {},
  onMethodChange = () => {},
  onCashInputChange = () => {},
  onConfirmedChange = () => {},
  onSubmit = () => {}
}) {
  const amountDue = Number(order?.balance_due || order?.total_amount || 0);
  const isUnpaidCod = order?.payment_status === 'unpaid';
  return (
    <Dialog open={Boolean(order)} onOpenChange={(open) => {
      if (!open && !saving) onOpenChange(false);
    }}>
      <DialogContent className="border border-slate-200 bg-white shadow-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Complete delivery</DialogTitle>
          <DialogDescription>
            Confirm the store received the remaining payment. This action settles the balance and completes the order together.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="font-semibold">Amount due: ₱{amountDue.toFixed(2)}</p>
          <Label htmlFor="delivery-completion-method">Payment method</Label>
          <select id="delivery-completion-method" value={method}
            onChange={(event) => onMethodChange(event.target.value)}
            disabled={saving || isUnpaidCod}
            className="h-9 w-full rounded-md border border-slate-300 bg-white px-2">
            {['cash', 'gcash', 'maya', 'card', 'bank_transfer', 'cheque', 'employee_credit'].map((value) => (
              <option key={value} value={value}>{value.replace(/_/g, ' ')}</option>
            ))}
          </select>
          {method === 'cash' ? (
            <>
              <Label htmlFor="delivery-completion-cash">Cash received</Label>
              <Input id="delivery-completion-cash" type="number" min="0" step="0.01"
                value={cashInput}
                onChange={(event) => onCashInputChange(event.target.value)}
                disabled={saving} />
            </>
          ) : (
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={confirmed}
                onChange={(event) => onConfirmedChange(event.target.checked)} />
              I confirm the store received this payment.
            </label>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button type="button" disabled={saving
            || (method === 'cash' ? Number(cashInput) < amountDue : !confirmed)}
            onClick={() => onSubmit({
              method,
              amount: method === 'cash' ? Number(cashInput) : Number(order?.balance_due || 0),
              manual_payment_received: method !== 'cash' ? confirmed : undefined
            })}>
            {saving ? 'Completing…' : 'Confirm Delivered'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import React, { useEffect, useRef, useState } from 'react';
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

// Phase 148 (#825): balance settlement for a partially-paid downpayment order. A SEPARATE dialog
// from Collect Cash (TerminalPageDialogLayer.jsx), deliberately -- different amount basis
// (balance_due, not total_amount), different method set, different endpoint, different server
// guard. Keeping the live COD dialog byte-identical is worth the duplicated shell.
//
// Its own component file rather than more inline JSX in the dialog layer, matching the precedent
// set by DeliveryAssignmentControl.jsx / POSRefundWorkflowDialog.jsx: it takes plain props instead
// of reaching into the terminal's whole `model` object, so its guard behaviour is testable without
// standing up every other dialog in the layer.

// ADR 0063 clause 4 [binding]'s merchant-owned V1 tender set, plus cash, plus `cheque` (Phase 202,
// #1085) -- ADR 0077 scoped-supersedes clause 4 for this widening only; the rest of ADR 0063 is
// unchanged. `card` is a store-owned card terminal, never PayMongo card -- no balance leg ever
// routes through a provider (ADR 0069 clause 2 [binding], carried forward verbatim by ADR 0070;
// ADR 0063 clause 12 [binding]). Mirrors BALANCE_SETTLEMENT_METHODS in posUseCases.js; the server
// is the authority, this is the picker.
export const BALANCE_SETTLEMENT_METHOD_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'gcash', label: 'GCash' },
  { value: 'maya', label: 'Maya' },
  { value: 'card', label: 'Card terminal' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cheque', label: 'Cheque' }
];

export default function BalanceSettlementDialog({
  order,
  method,
  cashInput,
  reference,
  confirmed,
  saving,
  onClose,
  onMethodChange,
  onCashInputChange,
  onReferenceChange,
  onConfirmedChange,
  onSubmit,
  // Phase 204 (#965): proof-of-payment capture, additive alongside the reference field --
  // "alongside not instead of" (Pat's framing on #965). Optional and never gates canSubmit below;
  // the balance settlement itself must never depend on whether staff chose to attach a photo.
  proofFile,
  onProofFileChange,
  proofUploading,
  proofError
}) {
  const balanceDue = Number(order?.balance_due || 0);
  const isCash = method === 'cash';
  const isCheque = method === 'cheque';
  // The UI half of ADR 0063 clause 6 [binding]'s fail-closed rule: a merchant-owned method cannot
  // be submitted until the attestation is ticked. The server enforces the same thing independently
  // (BALANCE_SETTLEMENT_CONFIRMATION_REQUIRED); this only stops the request from being made, it is
  // not the guard.
  const canSubmit = isCash
    ? balanceDue > 0 && Number(cashInput || 0) >= balanceDue
    : confirmed === true;
  const changeAmount = Math.max(0, Number(cashInput || 0) - balanceDue);

  // Local preview only -- the file itself is uploaded by the caller AFTER the settlement succeeds
  // (TerminalPage.jsx's handleSettleBalance), never as part of this dialog's own submit. The
  // object URL is scoped to this component and revoked on every change/unmount so a stale blob
  // URL never lingers past the file it points at.
  const [previewUrl, setPreviewUrl] = useState(null);
  const fileInputRef = useRef(null);
  useEffect(() => {
    if (!proofFile) {
      setPreviewUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(proofFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [proofFile]);

  const handleFileInputChange = (event) => {
    const file = event.target.files?.[0] || null;
    onProofFileChange?.(file);
  };
  const handleClearProofFile = () => {
    onProofFileChange?.(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <Dialog open={Boolean(order)} onOpenChange={(open) => { if (!open && !saving) onClose?.(); }}>
      <DialogContent className="border border-slate-200 bg-white shadow-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-black text-slate-950">Settle Balance</DialogTitle>
          <DialogDescription className="text-sm leading-6 text-slate-600">
            Record the remaining balance on this downpayment order. The full remaining balance is settled in one action.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-semibold">Balance due: ₱{balanceDue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            <p>Already paid: ₱{Number(order?.amount_paid || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} of ₱{Number(order?.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
          <div className="space-y-1.5">
            <Label>Payment method</Label>
            <div className="grid grid-cols-2 gap-2">
              {BALANCE_SETTLEMENT_METHOD_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${method === option.value ? 'border-[#1A4E8D] bg-blue-50 text-[#1A4E8D]' : 'border-slate-200 bg-white text-slate-700'}`}
                >
                  <input
                    type="radio"
                    name="balance-settlement-method"
                    value={option.value}
                    checked={method === option.value}
                    onChange={() => onMethodChange?.(option.value)}
                    disabled={saving}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </div>
          {isCash ? (
            <div className="space-y-1.5">
              <Label htmlFor="balance-cash-received">Amount received</Label>
              <Input
                id="balance-cash-received"
                inputMode="decimal"
                type="number"
                min="0"
                step="0.01"
                value={cashInput}
                onChange={(event) => onCashInputChange?.(event.target.value)}
                disabled={saving}
              />
              <p className="text-sm text-slate-600">Change: ₱{changeAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="balance-payment-reference">{isCheque ? 'Cheque number (optional)' : 'Reference number (optional)'}</Label>
                <Input
                  id="balance-payment-reference"
                  type="text"
                  value={reference}
                  onChange={(event) => onReferenceChange?.(event.target.value)}
                  disabled={saving}
                />
                {/* ADR 0063 clause 7 [default]: a merchant-owned reference is an audit aid, not
                    proof DGFY verified anything -- and the copy has to say so, because a printed
                    store QR may not even expose a usable reference at the counter. For cheque
                    (Phase 202, #1085) the same clause applies: the number proves a cheque was
                    presented bearing it, not that it will clear or that DGFY verified anything. */}
                <p className="text-xs text-slate-500">
                  {isCheque
                    ? 'An audit aid only. It proves a cheque was presented bearing this number -- not that it will clear, and not that DGFY verified anything.'
                    : 'An audit aid only. It is not proof that DGFY verified the payment.'}
                </p>
              </div>
              {/* Phase 204 (#965): an audit aid only -- extends ADR 0063 clause 7 [default]'s
                  framing verbatim, it does not become independent verification (clause 5
                  [binding] stays unweakened). Optional, additive, and never gates canSubmit. */}
              <div className="space-y-1.5">
                <Label htmlFor="balance-proof-file">Attach proof (optional)</Label>
                <input
                  id="balance-proof-file"
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileInputChange}
                  disabled={saving || proofUploading}
                  className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-slate-700"
                />
                {previewUrl ? (
                  <div className="flex items-center gap-3">
                    <img src={previewUrl} alt="Proof of payment preview" className="h-16 w-16 rounded-md border border-slate-200 object-cover" />
                    <Button type="button" variant="outline" size="sm" onClick={handleClearProofFile} disabled={saving || proofUploading}>
                      Remove
                    </Button>
                  </div>
                ) : null}
                {proofError ? <p className="text-xs text-red-600">{proofError}</p> : null}
                <p className="text-xs text-slate-500">
                  An audit aid only. An attached photo is evidence the store captured at the counter -- it is not proof that DGFY verified the payment.
                </p>
              </div>
              {/* ADR 0063 clause 6 [binding] requires the confirmation to be explicit in the UI as
                  well as the request: this checkbox is the UI half, `manual_payment_received` the
                  request half. Clause 5 [binding] is what it attests to -- that the STORE received
                  the money. DGFY verifies nothing here, and the copy says so plainly rather than
                  letting staff assume otherwise. */}
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={confirmed === true}
                  onChange={(event) => onConfirmedChange?.(event.target.checked)}
                  disabled={saving}
                />
                <span>
                  {isCheque
                    ? `I confirm the store received a cheque for ₱${balanceDue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. This is recorded as a store-attested payment, not verified by DGFY, and is not confirmation that the cheque has cleared.`
                    : `I confirm the store received ₱${balanceDue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} through its own account. This is recorded as a store-attested payment, not verified by DGFY.`}
                </span>
              </label>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2 sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onClose?.()} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={onSubmit} disabled={saving || !canSubmit}>
            {saving ? 'Recording...' : 'Record Payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { resolvePosRefundReason } from '../utils/posVoidAudit.js';

const money = (value, currency = '₱') => `${String(currency).toUpperCase() === 'PHP' ? '₱' : currency}${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const normalize = (value) => String(value || '').trim().toLowerCase();

const parsePaymentBreakdown = (value) => {
    let parsed = value;
    if (typeof parsed === 'string') {
        try {
            parsed = JSON.parse(parsed);
        } catch {
            parsed = [];
        }
    }
    return Array.isArray(parsed) ? parsed : [];
};

export const resolvePosRefundWorkflow = (transaction = {}) => {
    const outcome = transaction?.financial_outcome || {};
    const primaryPaymentType = normalize(transaction.payment_type);
    const paymentTypes = [...new Set(
        parsePaymentBreakdown(transaction.payment_breakdown)
            .filter((entry) => Number(entry?.amount) > 0)
            .map((entry) => normalize(entry?.payment_type))
            .filter(Boolean)
    )];
    if (paymentTypes.length > 1) return 'split';
    if ((paymentTypes.length === 1 ? paymentTypes[0] : primaryPaymentType) === 'cash') return 'cash';

    const nextAction = normalize(outcome.next_action);
    if (nextAction === 'record_cash_refund_with_cash_drawer_event') return 'cash';
    if (nextAction === 'record_external_reversal_reference') return 'external';
    if (nextAction === 'confirm_provider_ownership_and_refund') return 'provider';
    if (nextAction === 'reverse_each_successful_allocation') return 'split';
    return 'review';
};

const workflowCopy = {
    cash: {
        title: 'Record cash refund',
        description: 'Return the cash from the currently open drawer. The POS will record the drawer-out event and the acting shift.'
    },
    external: {
        title: 'Record external reversal',
        description: 'Enter the GCash, Maya, card-terminal, or bank reversal reference. Confirm completion only after the external system shows success.'
    },
    provider: {
        title: 'Request provider refund',
        description: 'The server will verify provider ownership and submit the refund. Do not create a separate manual reversal.'
    },
    split: {
        title: 'Reverse split payment allocation',
        description: 'Reverse one successful allocation at a time. The server keeps the transaction pending until every funded allocation is resolved.'
    },
    review: {
        title: 'Refund review required',
        description: 'The server has not authorized an automatic refund action. Review the recorded evidence and current payment status.'
    }
};

export default function POSRefundWorkflowDialog({
    transaction = null,
    open = false,
    loading = false,
    submitting = false,
    hasActiveShift = false,
    onOpenChange = () => {},
    onOpenShiftControls = () => {},
    onSubmit = async () => {}
}) {
    const workflow = resolvePosRefundWorkflow(transaction);
    const copy = workflowCopy[workflow];
    const outcome = transaction?.financial_outcome || {};
    const allocations = useMemo(() => (
        (Array.isArray(transaction?.payment_allocations) ? transaction.payment_allocations : [])
            .filter((allocation) => normalize(allocation?.status) === 'successful' && normalize(allocation?.reversal_status) !== 'completed')
    ), [transaction]);
    const inheritedReason = resolvePosRefundReason(transaction);
    const reasonInherited = Boolean(inheritedReason);
    const [reason, setReason] = useState(inheritedReason);
    const [externalReference, setExternalReference] = useState('');
    const [completionConfirmed, setCompletionConfirmed] = useState(false);
    const [allocationId, setAllocationId] = useState(() => (
        allocations[0]?.pos_payment_allocation_id
            ? String(allocations[0].pos_payment_allocation_id)
            : ''
    ));
    useEffect(() => {
        setReason(inheritedReason);
    }, [inheritedReason]);
    const selectedAllocation = allocations.find((allocation) => String(allocation.pos_payment_allocation_id) === String(allocationId)) || null;
    const selectedAllocationNeedsReference = workflow === 'split'
        && selectedAllocation
        && normalize(selectedAllocation.payment_method) !== 'cash'
        && normalize(selectedAllocation.payment_handoff_mode) !== 'internal';

    const reasonValid = reason.trim().length >= 3;
    const referenceRequired = workflow === 'external' || selectedAllocationNeedsReference;
    const canSubmit = reasonValid
        && workflow !== 'review'
        && (!referenceRequired || externalReference.trim().length >= 3)
        && (workflow !== 'cash' || hasActiveShift)
        && (workflow !== 'split' || Boolean(selectedAllocation));

    const openShiftControls = () => {
        if (submitting) return;
        onOpenChange(false);
        onOpenShiftControls();
    };

    const submit = async () => {
        if (!canSubmit) return;
        try {
            await onSubmit({
                workflow,
                reason: reason.trim(),
                externalReference: externalReference.trim(),
                completionConfirmed,
                allocationId: selectedAllocation?.pos_payment_allocation_id || null,
                amount: selectedAllocation?.applied_amount || null
            });
        } catch {
            // The action handler reports the server error and keeps this dialog open for correction.
        }
    };

    return (
        <Dialog open={open} onOpenChange={(nextOpen) => !submitting && onOpenChange(nextOpen)}>
            <DialogContent className="sm:max-w-lg" data-testid="pos-refund-workflow-dialog">
                <DialogHeader>
                    <DialogTitle>{loading ? 'Loading refund requirements…' : copy.title}</DialogTitle>
                    <DialogDescription>{copy.description}</DialogDescription>
                </DialogHeader>
                {!loading && transaction ? (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
                            <div><p className="font-bold text-slate-500">Invoice</p><p className="mt-1 font-black text-slate-900">{transaction.invoice_number || transaction.pos_transaction_id}</p></div>
                            <div><p className="font-bold text-slate-500">Required amount</p><p className="mt-1 font-black text-slate-900">{money(outcome.refund_amount ?? transaction.total_amount, outcome.currency)}</p></div>
                            <div><p className="font-bold text-slate-500">Payment status</p><p className="mt-1 font-semibold capitalize text-slate-800">{normalize(transaction.payment_status).replace(/_/g, ' ') || 'Unknown'}</p></div>
                            <div><p className="font-bold text-slate-500">Server decision</p><p className="mt-1 font-semibold text-slate-800">{outcome.reason_code || 'Manual review'}</p></div>
                        </div>

                        {workflow === 'cash' && !hasActiveShift ? (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert" data-testid="pos-refund-shift-required">
                                <p className="font-extrabold">Cash refund pending: no acting cashier shift is active.</p>
                                <p className="mt-1 font-semibold text-amber-800">
                                    The void is recorded, but cash can only be returned from an open shift with drawer permission. Resume the owning cashier shift or open the approved refunding shift, then resolve this transaction from History.
                                </p>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="mt-3 border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
                                    onClick={openShiftControls}
                                    disabled={submitting}
                                >
                                    Go to Shift Controls
                                </Button>
                            </div>
                        ) : null}

                        {workflow === 'split' ? (
                            <label className="block text-sm font-semibold text-slate-900">
                                Allocation to reverse
                                <select
                                    className="mt-2 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                                    value={allocationId}
                                    onChange={(event) => setAllocationId(event.target.value)}
                                    disabled={submitting}
                                >
                                    {allocations.length === 0 ? <option value="">No reversible allocations</option> : null}
                                    {allocations.map((allocation) => (
                                        <option key={allocation.pos_payment_allocation_id} value={allocation.pos_payment_allocation_id}>
                                            {String(allocation.payment_method || 'payment').toUpperCase()} · {money(allocation.applied_amount)} · {allocation.reversal_status || 'not reversed'}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        ) : null}

                        {(workflow === 'external' || selectedAllocationNeedsReference) ? (
                            <label className="block text-sm font-semibold text-slate-900">
                                External reversal reference
                                <Input
                                    className="mt-2"
                                    value={externalReference}
                                    onChange={(event) => setExternalReference(event.target.value)}
                                    minLength={3}
                                    maxLength={255}
                                    placeholder="Required provider or terminal reference"
                                    disabled={submitting}
                                />
                            </label>
                        ) : null}

                        <label className="block text-sm font-semibold text-slate-900">
                            {reasonInherited ? 'Void/refund reason' : 'Refund reason'}
                            <Input
                                className={`mt-2 ${reasonInherited ? 'bg-slate-50' : ''}`}
                                value={reason}
                                onChange={(event) => setReason(event.target.value)}
                                minLength={3}
                                maxLength={255}
                                placeholder={reasonInherited ? undefined : 'Required accountability reason'}
                                readOnly={reasonInherited}
                                aria-readonly={reasonInherited}
                                disabled={submitting || workflow === 'review'}
                            />
                            {reasonInherited ? (
                                <p className="mt-1 text-xs font-medium text-slate-500">
                                    Reused from the original void reason and recorded with this refund.
                                </p>
                            ) : null}
                        </label>

                        {(workflow === 'external' || selectedAllocationNeedsReference) ? (
                            <label className="flex items-start gap-2 text-sm text-slate-700">
                                <input
                                    type="checkbox"
                                    className="mt-1"
                                    checked={completionConfirmed}
                                    onChange={(event) => setCompletionConfirmed(event.target.checked)}
                                    disabled={submitting}
                                />
                                <span>I verified the external reversal is completed. Leave unchecked to record pending evidence.</span>
                            </label>
                        ) : null}
                    </div>
                ) : null}
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
                    <Button type="button" onClick={submit} disabled={!canSubmit || loading || submitting}>
                        {submitting ? 'Recording…' : workflow === 'review' ? 'No action available' : 'Confirm refund action'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

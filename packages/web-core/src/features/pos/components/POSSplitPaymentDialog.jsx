import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Banknote, Ban, CreditCard, Loader2, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { posToast as toast } from '@/src/utils/iminRuntimeFeedback.js';
import {
    addPosPaymentAllocation,
    cancelPosPaymentAllocation,
    createPosPaymentSession,
    fetchActivePosPaymentSession,
    fetchPosPaymentSession
} from '../services/posService.js';
import {
    buildPosSplitPaymentStorageKey,
    clearPosSplitPaymentSessionPointer,
    isTerminalPosPaymentSession,
    persistPosSplitPaymentSessionPointer,
    readPosSplitPaymentSessionPointer
} from '../services/posSplitPaymentSessionStore.js';
import {
    formatSplitPaymentMethod,
    resolvePaymentMethodColorStyles
} from '../utils/posCheckoutTerminalUtils.js';

const PAYMENT_METHODS = [
    { value: 'cash', label: 'Cash' },
    { value: 'gcash', label: 'GCash', entryLabel: 'GCash (Store QR)' },
    { value: 'maya', label: 'Maya', entryLabel: 'Maya (Store QR)' },
    { value: 'card', label: 'Card', entryLabel: 'Card (Store Terminal)' },
    { value: 'bank_transfer', label: 'Bank Transfer', entryLabel: 'Bank Transfer (Store Account)' }
];
const MAX_PAYMENT_ROWS = PAYMENT_METHODS.length;
const createPaymentRow = (id, method) => ({
    id,
    method,
    amount: ''
});
const createDefaultPaymentRows = () => [
    createPaymentRow('payment-row-1', 'gcash'),
    createPaymentRow('payment-row-2', 'cash')
];
const money = (value) => Number(value || 0).toFixed(2);
const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;
const createIdempotencyKey = (prefix) => (
    `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
);
const getSessionId = (session) => Number(session?.pos_payment_session_id || session?.id || 0);
const getAllocationId = (allocation) => Number(allocation?.pos_payment_allocation_id || allocation?.id || 0);

const statusLabel = (status) => ({
    successful: 'Successful',
    pending: 'Pending confirmation',
    failed: 'Failed',
    cancelled: 'Cancelled',
    reversed: 'Reversed'
}[status] || status || 'Unknown');

const statusClassName = (status) => ({
    successful: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    pending: 'border-amber-200 bg-amber-50 text-amber-700',
    failed: 'border-rose-200 bg-rose-50 text-rose-700',
    cancelled: 'border-slate-200 bg-slate-100 text-slate-500',
    reversed: 'border-slate-200 bg-slate-100 text-slate-500'
}[status] || 'border-slate-200 bg-slate-100 text-slate-600');

const buildSnapshot = (cart, checkoutSnapshot = null) => ({
    ...(checkoutSnapshot && typeof checkoutSnapshot === 'object' ? checkoutSnapshot : {}),
    lines: (Array.isArray(cart) ? cart : []).map((line) => ({
        item_id: Number(line?.item_id),
        quantity: Number(line?.quantity),
        sale_price: Number(line?.sale_price),
        price_override_reason: String(line?.price_override_reason || '').trim() || null,
        course: line?.course || null,
        line_modifiers: Array.isArray(line?.line_modifiers) ? line.line_modifiers : [],
        special_instructions: String(line?.special_instructions || '').trim() || null,
        kitchen_station_id: line?.kitchen_station_id || null,
        selected_option_ids: Array.isArray(line?.service_option_ids) ? line.service_option_ids : [],
        scan_metadata: line?.scan_metadata || null
    }))
});

export default function POSSplitPaymentDialog({
    open = false,
    onOpenChange,
    cart = [],
    totalAmount = 0,
    shiftId = null,
    locationId = null,
    terminalId = '',
    parkedSaleId = null,
    storageScopeKey = '',
    checkoutSnapshot = null,
    onSessionStateChange = null,
    onReadyToComplete = null
}) {
    const storageKey = useMemo(
        () => buildPosSplitPaymentStorageKey(storageScopeKey),
        [storageScopeKey]
    );
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');
    const [paymentRows, setPaymentRows] = useState(createDefaultPaymentRows);
    const [cancelTarget, setCancelTarget] = useState(null);
    const [cancelReason, setCancelReason] = useState('');
    const [recoveredFromStorage, setRecoveredFromStorage] = useState(false);
    const nextPaymentRowIdRef = useRef(3);
    const paymentRowIdempotencyKeysRef = useRef(new Map());
    const sessionOpenAttemptRef = useRef(false);
    const recoveredCompletionAttemptRef = useRef(false);

    const remainingAmount = round4(session?.remaining_amount ?? totalAmount);
    const paidAmount = round4(session?.paid_amount);
    const normalizedPaymentRows = paymentRows.map((row) => ({
        ...row,
        enteredAmount: round4(Math.max(0, Number(row.amount) || 0)),
        isCash: row.method === 'cash'
    }));
    const activePaymentRows = normalizedPaymentRows.filter((row) => row.enteredAmount > 0);
    const activeNonCashRows = activePaymentRows.filter((row) => !row.isCash);
    const activeCashRows = activePaymentRows.filter((row) => row.isCash);
    const nonCashEnteredAmount = round4(activeNonCashRows.reduce((sum, row) => sum + row.enteredAmount, 0));
    const cashReceivedAmount = round4(activeCashRows.reduce((sum, row) => sum + row.enteredAmount, 0));
    const selectedMethodValues = paymentRows.map((row) => row.method);
    const duplicatePaymentMethod = selectedMethodValues.some((method, index) => selectedMethodValues.indexOf(method) !== index);
    const nonCashAmountTooHigh = nonCashEnteredAmount > remainingAmount;
    const remainingAfterNonCash = round4(Math.max(0, remainingAmount - nonCashEnteredAmount));
    const cashAppliedPreview = round4(Math.min(cashReceivedAmount, remainingAfterNonCash));
    const cashChangePreview = round4(Math.max(cashReceivedAmount - cashAppliedPreview, 0));
    const enteredAppliedAmount = round4(nonCashEnteredAmount + cashAppliedPreview);
    const liveAppliedAmount = round4(Math.min(remainingAmount, nonCashEnteredAmount) + cashAppliedPreview);
    const livePaidAmount = round4(paidAmount + liveAppliedAmount);
    const liveRemainingAmount = round4(Math.max(0, remainingAmount - liveAppliedAmount));
    const amountStillDue = round4(Math.max(0, remainingAmount - enteredAppliedAmount));
    const cashHasNoBalance = cashReceivedAmount > 0 && remainingAfterNonCash <= 0;
    const hasEnteredPayment = activePaymentRows.length > 0;
    const canCompletePaymentRows = Boolean(session)
        && hasEnteredPayment
        && !duplicatePaymentMethod
        && !nonCashAmountTooHigh
        && !cashHasNoBalance
        && amountStillDue === 0;
    const isReadyToComplete = session?.status === 'ready_to_complete';
    const allocations = Array.isArray(session?.allocations) ? session.allocations : [];

    useEffect(() => {
        if (!session) return;
        const active = !['completed', 'cancelled'].includes(String(session.status || '').toLowerCase());
        onSessionStateChange?.({ active, recovered: recoveredFromStorage, session });
    }, [onSessionStateChange, recoveredFromStorage, session]);

    const applySession = useCallback((nextSession) => {
        setSession(nextSession || null);
    }, []);

    const sessionScope = useMemo(() => ({
        shift_id: shiftId,
        terminal_id: terminalId,
        ...(locationId ? { location_id: locationId } : {})
    }), [locationId, shiftId, terminalId]);

    const loadSession = useCallback(async (sessionId) => {
        setRefreshing(true);
        setError('');
        try {
            const nextSession = await fetchPosPaymentSession(sessionId, sessionScope);
            if (isTerminalPosPaymentSession(nextSession)) {
                clearPosSplitPaymentSessionPointer(storageKey);
                setSession(null);
                setRecoveredFromStorage(false);
                onSessionStateChange?.({ active: false, recovered: false, session: nextSession });
                onOpenChange?.(false);
                return nextSession;
            }
            applySession(nextSession);
            persistPosSplitPaymentSessionPointer(storageKey, {
                session_id: getSessionId(nextSession),
                idempotency_key: readPosSplitPaymentSessionPointer(storageKey)?.idempotencyKey || ''
            });
            return nextSession;
        } catch (requestError) {
            if (requestError?.response?.status === 404) {
                clearPosSplitPaymentSessionPointer(storageKey);
                setSession(null);
                setRecoveredFromStorage(false);
                onSessionStateChange?.({ active: false, recovered: false, session: null });
            }
            throw requestError;
        } finally {
            setRefreshing(false);
        }
    }, [applySession, onOpenChange, onSessionStateChange, sessionScope, storageKey]);

    const openOrResumeSession = useCallback(async () => {
        if (!open || !storageKey || sessionOpenAttemptRef.current) return;
        sessionOpenAttemptRef.current = true;
        setLoading(true);
        setError('');
        try {
            const stored = readPosSplitPaymentSessionPointer(storageKey);
            if (stored?.sessionId) {
                setRecoveredFromStorage(true);
                await loadSession(stored.sessionId);
                return;
            }
            const activeSession = await fetchActivePosPaymentSession(sessionScope);
            if (activeSession) {
                setRecoveredFromStorage(true);
                applySession(activeSession);
                persistPosSplitPaymentSessionPointer(storageKey, {
                    session_id: getSessionId(activeSession),
                    idempotency_key: ''
                });
                return;
            }
            setRecoveredFromStorage(false);
            const idempotencyKey = stored?.idempotencyKey || createIdempotencyKey('split-session');
            const created = await createPosPaymentSession({
                idempotency_key: idempotencyKey,
                shift_id: shiftId,
                terminal_id: terminalId,
                location_id: locationId || undefined,
                parked_sale_id: parkedSaleId || undefined,
                snapshot: buildSnapshot(cart, checkoutSnapshot)
            });
            applySession(created);
            persistPosSplitPaymentSessionPointer(storageKey, {
                session_id: getSessionId(created),
                idempotency_key: idempotencyKey
            });
        } catch (requestError) {
            const message = requestError?.response?.data?.message || requestError?.message || 'Unable to open split payment.';
            setError(message);
            toast.error(message);
        } finally {
            setLoading(false);
        }
    }, [applySession, cart, checkoutSnapshot, loadSession, locationId, open, parkedSaleId, sessionScope, shiftId, storageKey, terminalId]);

    useEffect(() => {
        if (!open) return undefined;
        openOrResumeSession();
        return undefined;
    }, [open, openOrResumeSession]);

    useEffect(() => {
        if (open) return;
        sessionOpenAttemptRef.current = false;
        setPaymentRows(createDefaultPaymentRows());
        nextPaymentRowIdRef.current = 3;
        paymentRowIdempotencyKeysRef.current.clear();
    }, [open]);

    const updatePaymentRow = (rowId, updates) => {
        setPaymentRows((currentRows) => currentRows.map((row) => {
            if (row.id !== rowId) return row;
            return {
                ...row,
                ...updates
            };
        }));
        setError('');
    };

    const handleAddPaymentRow = () => {
        const selectedMethods = new Set(paymentRows.map((row) => row.method));
        const nextMethod = PAYMENT_METHODS.find((method) => !selectedMethods.has(method.value));
        if (!nextMethod || paymentRows.length >= MAX_PAYMENT_ROWS) return;
        const nextId = `payment-row-${nextPaymentRowIdRef.current}`;
        nextPaymentRowIdRef.current += 1;
        setPaymentRows((currentRows) => [
            ...currentRows,
            createPaymentRow(nextId, nextMethod.value)
        ]);
        setError('');
    };

    const handleRemovePaymentRow = (rowId) => {
        setPaymentRows((currentRows) => currentRows.filter((row) => row.id !== rowId));
        setError('');
    };

    const finishReadySession = async (readySession) => {
        setLoading(true);
        setError('');
        try {
            applySession(readySession);
            onSessionStateChange?.({ active: true, recovered: recoveredFromStorage, session: readySession });
            if (typeof onReadyToComplete !== 'function') {
                setError('Payment is recorded, but sale completion is unavailable. Keep this payment saved and try again from the POS.');
                return false;
            }
            try {
                const completed = await onReadyToComplete(readySession);
                if (!completed) {
                    setError('Payment was recorded, but the sale was not completed and no receipt was created.');
                    return false;
                }
                return true;
            } catch (completionError) {
                setError(completionError?.message || 'Payment was recorded, but the sale was not completed.');
                return false;
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!open) {
            recoveredCompletionAttemptRef.current = false;
            return;
        }
        if (loading || !recoveredFromStorage || !session || round4(session?.remaining_amount) !== 0 || recoveredCompletionAttemptRef.current) return;
        recoveredCompletionAttemptRef.current = true;
        onOpenChange?.(false);
        void finishReadySession(session);
    }, [loading, onOpenChange, open, recoveredFromStorage, session]);

    const handleCompletePaymentRows = async () => {
        const sessionId = getSessionId(session);
        if (!sessionId || !hasEnteredPayment) {
            setError('Enter an amount for at least one payment method.');
            return;
        }
        if (duplicatePaymentMethod) {
            setError('Use each payment method only once.');
            return;
        }
        if (nonCashAmountTooHigh) {
            setError(`Non-cash payments cannot exceed the remaining PHP ${money(remainingAmount)}.`);
            return;
        }
        if (cashHasNoBalance) {
            setError('Remove the extra cash row or reduce the non-cash amount so cash has a balance to cover.');
            return;
        }
        if (amountStillDue > 0) {
            setError(`Enter PHP ${money(amountStillDue)} more before completing payment.`);
            return;
        }

        const orderedRows = [...activeNonCashRows, ...activeCashRows];
        const completedRowIds = [];
        let latestSession = session;
        let inFlightRow = null;
        let inFlightKeySignature = '';
        setLoading(true);
        setError('');
        try {
            for (const row of orderedRows) {
                const keySignature = [sessionId, row.id, row.method, row.enteredAmount].join(':');
                let idempotencyKey = paymentRowIdempotencyKeysRef.current.get(keySignature);
                if (!idempotencyKey) {
                    idempotencyKey = createIdempotencyKey(`split-${row.method}`);
                    paymentRowIdempotencyKeysRef.current.set(keySignature, idempotencyKey);
                }
                const isCash = row.method === 'cash';
                inFlightRow = row;
                inFlightKeySignature = keySignature;
                const result = await addPosPaymentAllocation(sessionId, {
                    idempotency_key: idempotencyKey,
                    shift_id: shiftId,
                    terminal_id: terminalId,
                    location_id: locationId || undefined,
                    payment_method: row.method,
                    amount: row.enteredAmount,
                    payment_handoff_mode: isCash ? 'internal' : 'external',
                    ...(!isCash ? {
                        payment_provider: 'merchant_owned',
                        manual_payment_received: true
                    } : {})
                });
                completedRowIds.push(row.id);
                paymentRowIdempotencyKeysRef.current.delete(keySignature);
                latestSession = result?.session || latestSession;
                applySession(latestSession);
                inFlightRow = null;
                inFlightKeySignature = '';
            }

            setPaymentRows(createDefaultPaymentRows());
            nextPaymentRowIdRef.current = 3;
            if (round4(latestSession?.remaining_amount) === 0) {
                onOpenChange?.(false);
                await finishReadySession(latestSession);
                return;
            }
        } catch (requestError) {
            let recoveredSession = latestSession;
            try {
                recoveredSession = await loadSession(sessionId);
            } catch {
                // Keep the last confirmed server response visible when refresh also fails.
            }

            const recoveredRemaining = round4(recoveredSession?.remaining_amount ?? remainingAmount);
            const latestConfirmedPaid = round4(latestSession?.paid_amount ?? paidAmount);
            const recoveredPaid = round4(recoveredSession?.paid_amount ?? latestConfirmedPaid);
            if (inFlightRow && recoveredPaid > latestConfirmedPaid && !completedRowIds.includes(inFlightRow.id)) {
                completedRowIds.push(inFlightRow.id);
                paymentRowIdempotencyKeysRef.current.delete(inFlightKeySignature);
            }
            if (recoveredSession && recoveredRemaining === 0) {
                applySession(recoveredSession);
                setPaymentRows(createDefaultPaymentRows());
                nextPaymentRowIdRef.current = 3;
                paymentRowIdempotencyKeysRef.current.clear();
                await finishReadySession(recoveredSession);
                return;
            }

            if (completedRowIds.length > 0) {
                setPaymentRows((currentRows) => currentRows.map((row) => (
                    completedRowIds.includes(row.id)
                        ? { ...row, amount: '' }
                        : row
                )));
            }
            const savedLabels = completedRowIds.map((rowId) => {
                const savedRow = paymentRows.find((row) => row.id === rowId);
                return PAYMENT_METHODS.find((method) => method.value === savedRow?.method)?.label;
            }).filter(Boolean);
            const requestMessage = requestError?.response?.data?.message || requestError?.message || 'Unable to record payment.';
            const message = savedLabels.length > 0
                ? `${savedLabels.join(' + ')} was recorded, but the remaining payment was not completed. The saved payment remains visible; review the remaining rows and try again. ${requestMessage}`
                : requestMessage;
            setError(message);
            toast.error(message);
        } finally {
            setLoading(false);
        }
    };

    const handleCancelAllocation = async () => {
        const sessionId = getSessionId(session);
        const allocationId = getAllocationId(cancelTarget);
        const reason = String(cancelReason).trim();
        if (!sessionId || !allocationId || reason.length < 3) {
            setError('Enter a cancellation reason of at least 3 characters.');
            return;
        }
        setLoading(true);
        setError('');
        try {
            const result = await cancelPosPaymentAllocation(sessionId, allocationId, {
                shift_id: shiftId,
                terminal_id: terminalId,
                location_id: locationId || undefined,
                reason
            });
            applySession(result?.session);
            setCancelTarget(null);
            setCancelReason('');
            toast.success('Payment allocation cancelled.');
        } catch (requestError) {
            const message = requestError?.response?.data?.message || requestError?.message || 'Unable to cancel payment.';
            setError(message);
            toast.error(message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(nextOpen) => {
            if (!nextOpen && loading) return;
            onOpenChange?.(nextOpen);
        }}>
            <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-1.5rem)] max-w-lg flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-0 shadow-2xl shadow-slate-950/25 sm:w-full" data-testid="pos-split-payment-dialog">
                <DialogHeader className="shrink-0 border-b border-slate-200 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-600">
                                <CreditCard className="h-5 w-5" aria-hidden="true" />
                            </div>
                            <div>
                                <DialogTitle className="text-[17px] font-black text-[#0F172A]">Split Payment</DialogTitle>
                                <DialogDescription className="mt-0.5 text-[12px] font-medium text-[#475569]">
                                    Enter each payment amount. Record Payment saves the tenders and completes the sale.
                                </DialogDescription>
                            </div>
                        </div>
                        <button type="button" onClick={() => onOpenChange?.(false)} disabled={loading} className="rounded-md p-1 text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Close split payment">
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                </DialogHeader>

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                    {error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700" role="alert">{error}</p>}

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-live="polite" data-testid="pos-split-payment-summary">
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                            <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Total</p>
                            <p className="mt-1 text-base font-black text-[#1A4E8D]">PHP {money(session?.total_amount ?? totalAmount)}</p>
                        </div>
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3" data-testid="pos-split-payment-paid">
                            <p className="text-[10px] font-black uppercase tracking-wide text-emerald-700">Paid</p>
                            <p className="mt-1 text-base font-black text-emerald-700">PHP {money(livePaidAmount)}</p>
                        </div>
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3" data-testid="pos-split-payment-remaining">
                            <p className="text-[10px] font-black uppercase tracking-wide text-amber-700">Remaining</p>
                            <p className="mt-1 text-base font-black text-amber-700">PHP {money(liveRemainingAmount)}</p>
                        </div>
                        <div className="rounded-lg border border-sky-200 bg-sky-50 p-3" data-testid="pos-split-payment-change">
                            <p className="text-[10px] font-black uppercase tracking-wide text-sky-700">Change</p>
                            <p className="mt-1 text-base font-black text-sky-700">PHP {money(cashChangePreview)}</p>
                        </div>
                    </div>

                    {loading && !session && (
                        <div className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-6 text-sm font-semibold text-slate-500">
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Opening payment session...
                        </div>
                    )}

                    {allocations.length > 0 && (
                        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3" data-testid="pos-split-payment-allocations">
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">Payments received</p>
                                <Button type="button" variant="ghost" size="sm" onClick={() => loadSession(getSessionId(session))} disabled={refreshing || loading} className="h-7 px-2 text-xs">
                                    <RefreshCw className={`mr-1 h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" /> Refresh
                                </Button>
                            </div>
                            {allocations.map((allocation) => {
                                const paymentMethod = String(allocation.payment_method || '').trim().toLowerCase();
                                const paymentMethodColor = resolvePaymentMethodColorStyles(paymentMethod);
                                return (
                                    <div key={getAllocationId(allocation)} className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2 ${paymentMethodColor.rowClassName}`}>
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-extrabold ${paymentMethodColor.badgeClassName}`}>
                                                    <span className={`h-1.5 w-1.5 rounded-full ${paymentMethodColor.dotClassName}`} aria-hidden="true" />
                                                    {formatSplitPaymentMethod(paymentMethod)}
                                                </span>
                                                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusClassName(allocation.status)}`}>{statusLabel(allocation.status)}</span>
                                            </div>
                                            <p className="mt-1 text-[11px] text-slate-500">
                                                {allocation.payment_reference ? `Reference: ${allocation.payment_reference}` : (allocation.payment_provider === 'merchant_owned' ? 'Store-owned payment · no reference entered' : 'No provider reference')}
                                                {allocation.change_amount > 0 ? ` · Change PHP ${money(allocation.change_amount)}` : ''}
                                            </p>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-2">
                                            <span className={`text-sm font-black ${paymentMethodColor.amountClassName}`}>PHP {money(allocation.applied_amount)}</span>
                                            {!['cancelled', 'reversed'].includes(allocation.status) && session?.status !== 'completed' && (
                                                <Button type="button" variant="ghost" size="sm" onClick={() => setCancelTarget(allocation)} disabled={loading} className="h-7 px-2 text-rose-700 hover:bg-rose-50" aria-label={`Cancel ${allocation.payment_method} payment`}>
                                                    <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {!isReadyToComplete && session && (
                        <div className="space-y-3" data-testid="pos-split-payment-add-form">
                            <div className="space-y-4 rounded-xl border border-blue-200 bg-blue-50/40 p-3" data-testid="pos-payment-rows-form">
                                <div>
                                    <p className="text-[11px] font-black uppercase tracking-wide text-[#1A4E8D]">Payment Methods</p>
                                    <p className="mt-1 text-xs font-medium text-slate-600">Select a method and enter the amount for each part of the payment.</p>
                                </div>

                                <div className="space-y-3" data-testid="pos-payment-rows">
                                    {paymentRows.map((row, index) => {
                                        const selectedMethod = PAYMENT_METHODS.find((method) => method.value === row.method);
                                        const paymentMethodColor = resolvePaymentMethodColorStyles(selectedMethod?.value || row.method);
                                        return (
                                            <div key={row.id} className={`rounded-xl border p-3 ${paymentMethodColor.rowClassName}`} data-testid={`pos-payment-row-${index + 1}`}>
                                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                                                    <label className="block text-xs font-bold text-slate-700">
                                                        Method of Payment
                                                        <select
                                                            value={row.method}
                                                            onChange={(event) => updatePaymentRow(row.id, {
                                                                method: event.target.value
                                                            })}
                                                            disabled={loading}
                                                            aria-label={`Method of payment ${index + 1}`}
                                                            className={`mt-1 h-12 w-full rounded-lg border px-3 text-sm font-extrabold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 ${paymentMethodColor.selectClassName}`}
                                                            data-testid={`pos-payment-method-${index + 1}`}
                                                        >
                                                            {PAYMENT_METHODS.map((method) => (
                                                                <option
                                                                    key={method.value}
                                                                    value={method.value}
                                                                    disabled={method.value !== row.method && selectedMethodValues.includes(method.value)}
                                                                >
                                                                    {method.label}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </label>
                                                    <label className="block text-xs font-bold text-slate-700">
                                                        Amount
                                                        <Input
                                                            type="number"
                                                            min="0"
                                                            step="0.01"
                                                            value={row.amount}
                                                            onChange={(event) => updatePaymentRow(row.id, {
                                                                amount: event.target.value
                                                            })}
                                                            onFocus={(event) => {
                                                                if (event.currentTarget.value === '0') updatePaymentRow(row.id, { amount: '' });
                                                            }}
                                                            disabled={loading}
                                                            placeholder="0.00"
                                                            aria-label={`Amount for ${selectedMethod?.label || 'payment'}`}
                                                            className="mt-1 h-12 rounded-lg border border-slate-300 bg-white text-lg font-black text-slate-900"
                                                            data-testid={`pos-payment-amount-${index + 1}`}
                                                        />
                                                    </label>
                                                    {paymentRows.length > 2 && (
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            onClick={() => handleRemovePaymentRow(row.id)}
                                                            disabled={loading}
                                                            className="h-12 border-slate-300 px-3 text-xs font-bold text-slate-600"
                                                            aria-label={`Remove payment ${index + 1}`}
                                                        >
                                                            Remove
                                                        </Button>
                                                    )}
                                                </div>

                                            </div>
                                        );
                                    })}
                                </div>

                                {paymentRows.length < MAX_PAYMENT_ROWS && (
                                    <button
                                        type="button"
                                        onClick={handleAddPaymentRow}
                                        disabled={loading}
                                        className="w-full rounded-lg border border-dashed border-blue-300 bg-white px-3 py-2.5 text-xs font-extrabold text-[#1A4E8D] hover:bg-blue-50"
                                        data-testid="pos-add-payment-row"
                                    >
                                        + Add Another Payment
                                    </button>
                                )}

                                {duplicatePaymentMethod && (
                                    <p className="text-xs font-semibold text-rose-700" role="alert">Use each payment method only once.</p>
                                )}
                                {nonCashAmountTooHigh && (
                                    <p className="text-xs font-semibold text-rose-700" role="alert">Non-cash payments cannot exceed the remaining PHP {money(remainingAmount)}.</p>
                                )}
                                {cashHasNoBalance && (
                                    <p className="text-xs font-semibold text-rose-700" role="alert">Reduce non-cash payments so the cash row has a balance to cover.</p>
                                )}

                                <Button type="button" onClick={handleCompletePaymentRows} disabled={loading || !canCompletePaymentRows} className="h-12 w-full bg-[#1A4E8D] text-sm font-extrabold hover:bg-[#143F73]" data-testid="pos-complete-payment-rows">
                                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Banknote className="mr-2 h-4 w-4" aria-hidden="true" />}
                                    Record Payment
                                </Button>
                            </div>
                        </div>
                    )}

                    {cancelTarget && (
                        <div className="space-y-2 rounded-xl border border-rose-200 bg-rose-50 p-3" data-testid="pos-split-payment-cancel-allocation">
                            <p className="text-xs font-black text-rose-800">Cancel this allocation</p>
                            <Input value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="Reason" disabled={loading} className="h-10 border-rose-200 bg-white text-sm" />
                            <div className="flex justify-end gap-2">
                                <Button type="button" variant="ghost" size="sm" onClick={() => setCancelTarget(null)} disabled={loading}>Keep</Button>
                                <Button type="button" variant="outline" size="sm" onClick={handleCancelAllocation} disabled={loading} className="border-rose-300 text-rose-700 hover:bg-rose-100">Cancel allocation</Button>
                            </div>
                        </div>
                    )}

                </div>

            </DialogContent>
        </Dialog>
    );
}

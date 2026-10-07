import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Ban, Bookmark, CheckCircle2, Clock3, Eye, RefreshCcw, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog';
import { cancelPosParkedSale, claimPosParkedSale, fetchPosParkedSales } from '../services/posService.js';
import { formatParkedSaleDisplayName } from '../utils/posParkedSaleDisplay.js';

const money = (value) => Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDateTime = (value) => {
    if (!value) return 'Unknown time';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'Unknown time';
    return parsed.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
};

const normalizeTerminalId = (value) => String(value || '').trim().toUpperCase();

const statusClassName = {
    parked: 'border-amber-200 bg-amber-50 text-amber-800',
    claimed: 'border-blue-200 bg-blue-50 text-blue-800',
    cancel_pending: 'border-violet-200 bg-violet-50 text-violet-800'
};

export default function POSParkedSalesDialog({
    open = false,
    onOpenChange = () => {},
    activeShiftId = null,
    selectedLocationId = null,
    terminalId = '',
    currentUserId = null,
    cartHasItems = false,
    canView = true,
    canTransact = true,
    onBeforeClaim = () => ({ ok: true }),
    onClaimed = () => {},
    onCancelled = () => {}
}) {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [claimLoadingId, setClaimLoadingId] = useState(null);
    const [claimAction, setClaimAction] = useState(null);
    const [cancelLoadingId, setCancelLoadingId] = useState(null);
    const [cancelTarget, setCancelTarget] = useState(null);
    const [cancelReason, setCancelReason] = useState('');
    const [viewTarget, setViewTarget] = useState(null);
    const [error, setError] = useState('');
    const [actionError, setActionError] = useState('');
    const latestLoadRequestRef = useRef(0);
    const loadInFlightRef = useRef(false);
    const loadInFlightScopeRef = useRef('');

    const normalizedTerminalId = normalizeTerminalId(terminalId);
    const viewLines = Array.isArray(viewTarget?.snapshot?.lines) ? viewTarget.snapshot.lines : [];
    const activeRows = useMemo(
        () => (Array.isArray(rows) ? rows : []).filter((row) => ['parked', 'claimed', 'cancel_pending'].includes(String(row?.status || '').toLowerCase())),
        [rows]
    );

    const loadParkedSales = useCallback(async ({ background = false } = {}) => {
        if (!activeShiftId || !canView) {
            setRows([]);
            setError('');
            setLoading(false);
            return;
        }
        const loadScope = `${Number(activeShiftId)}:${selectedLocationId ? Number(selectedLocationId) : ''}`;
        if (loadInFlightRef.current && loadInFlightScopeRef.current === loadScope) return;
        loadInFlightRef.current = true;
        loadInFlightScopeRef.current = loadScope;
        const requestId = latestLoadRequestRef.current + 1;
        latestLoadRequestRef.current = requestId;
        if (!background) setLoading(true);
        setError('');
        try {
            const result = await fetchPosParkedSales({
                shift_id: Number(activeShiftId),
                location_id: selectedLocationId ? Number(selectedLocationId) : undefined,
                limit: 100
            });
            if (requestId !== latestLoadRequestRef.current) return;
            const nextRows = Array.isArray(result?.parked_sales) ? result.parked_sales : [];
            setRows(nextRows);
            setCancelTarget((target) => {
                if (!target) return target;
                return nextRows.some((row) => Number(row?.pos_parked_sale_id) === Number(target?.pos_parked_sale_id))
                    ? target
                    : null;
            });
        } catch (requestError) {
            if (requestId !== latestLoadRequestRef.current) return;
            setError(requestError?.response?.data?.message || requestError?.message || 'Unable to load parked sales.');
        } finally {
            if (requestId === latestLoadRequestRef.current && !background) setLoading(false);
            if (loadInFlightScopeRef.current === loadScope) {
                loadInFlightRef.current = false;
                loadInFlightScopeRef.current = '';
            }
        }
    }, [activeShiftId, canView, selectedLocationId]);

    useEffect(() => {
        if (!open) return undefined;
        loadParkedSales();
        return undefined;
    }, [loadParkedSales, open]);

    useEffect(() => {
        if (!open || typeof window === 'undefined') return undefined;
        const refreshVisibleParkedSales = () => {
            if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
            void loadParkedSales({ background: true });
        };
        const refreshTimer = window.setInterval(refreshVisibleParkedSales, 3000);
        window.addEventListener('focus', refreshVisibleParkedSales);
        return () => {
            window.clearInterval(refreshTimer);
            window.removeEventListener('focus', refreshVisibleParkedSales);
        };
    }, [loadParkedSales, open]);

    const handleClaim = async (row, action = 'pay') => {
        const parkedSaleId = Number(row?.pos_parked_sale_id);
        if (!Number.isInteger(parkedSaleId) || parkedSaleId <= 0) return;
        const normalizedAction = action === 'resume' ? 'resume' : 'pay';
        if (cartHasItems) {
            setActionError('Pay or Resume requires an empty current sale. Park or clear the current sale first.');
            return;
        }
        if (!canTransact) {
            setActionError('POS transact permission is required to resume a parked sale.');
            return;
        }
        const preflight = await onBeforeClaim(row, normalizedAction) || {};
        if (preflight.ok === false) {
            setActionError(preflight.message || 'This parked sale needs review before it can be resumed.');
            return;
        }

        setClaimLoadingId(parkedSaleId);
        setClaimAction(normalizedAction);
        setActionError('');
        try {
            const claimed = await claimPosParkedSale(parkedSaleId, {
                shift_id: Number(activeShiftId),
                terminal_id: normalizedTerminalId,
                location_id: selectedLocationId ? Number(selectedLocationId) : undefined
            });
            await onClaimed(claimed, normalizedAction, preflight.resumeContext);
            onOpenChange(false);
        } catch (requestError) {
            setActionError(requestError?.response?.data?.message || requestError?.message || 'Unable to resume this parked sale. It may already be claimed on another terminal.');
            await loadParkedSales();
        } finally {
            setClaimLoadingId(null);
            setClaimAction(null);
        }
    };

    const handleCancel = async (row) => {
        const parkedSaleId = Number(row?.pos_parked_sale_id);
        if (!Number.isInteger(parkedSaleId) || parkedSaleId <= 0) return;
        if (!canTransact) {
            setActionError('POS transact permission is required to cancel a parked sale.');
            return;
        }
        if (cancelReason.trim().length < 3) {
            setActionError('Enter a cancellation reason (at least 3 characters).');
            return;
        }
        setCancelLoadingId(parkedSaleId);
        setActionError('');
        try {
            const cancelled = await cancelPosParkedSale(parkedSaleId, {
                shift_id: Number(activeShiftId),
                terminal_id: normalizedTerminalId,
                location_id: selectedLocationId ? Number(selectedLocationId) : undefined,
                reason: cancelReason.trim()
            });
            await onCancelled(cancelled?.parked_sale || cancelled);
            setCancelTarget(null);
            setCancelReason('');
            await loadParkedSales();
        } catch (requestError) {
            setActionError(requestError?.response?.data?.message || requestError?.message || 'Unable to cancel this parked sale.');
        } finally {
            setCancelLoadingId(null);
        }
    };

    const closeDialog = () => {
        if (claimLoadingId !== null || cancelLoadingId !== null) return;
        setActionError('');
        setCancelTarget(null);
        setCancelReason('');
        setViewTarget(null);
        onOpenChange(false);
    };

    return (
        <>
            <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && closeDialog()}>
                <DialogContent className="flex max-h-[calc(100dvh-1rem)] min-h-0 max-w-2xl flex-col overflow-hidden p-0 sm:max-h-[90vh]" data-testid="pos-parked-sales-dialog">
                    <DialogHeader className="shrink-0 border-b border-slate-200 px-5 py-4">
                        <div className="flex items-start justify-between gap-3 pr-7">
                            <div>
                                <DialogTitle className="flex items-center gap-2 text-lg font-black text-slate-900">
                                    <Bookmark className="h-5 w-5 text-amber-600" />
                                    Parked Sales
                                </DialogTitle>
                                <DialogDescription className="mt-1 text-sm text-slate-600">
                                    Shared with authorized cashiers at this branch. Pay or resume a parked sale, or request cancellation with a reason.
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>

                    <div className="dgfy-pos-scrollbar-hidden min-h-0 flex-1 overflow-y-auto px-5 py-4" aria-busy={loading || claimLoadingId !== null || cancelLoadingId !== null}>
                    {cartHasItems && (
                        <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800" role="alert">
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>Pay or Resume requires an empty current sale. Park or clear the current sale first.</span>
                        </div>
                    )}
                    {actionError && (
                        <div className="mb-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800" role="alert">
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>{actionError}</span>
                        </div>
                    )}
                    {error && (
                        <div className="mb-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800" role="alert">
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}
                    {loading ? (
                        <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-sm font-semibold text-slate-600" aria-live="polite">
                            <RefreshCcw className="h-4 w-4 animate-spin" />
                            Loading parked sales...
                        </div>
                    ) : activeRows.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center" data-testid="pos-parked-sales-empty">
                            <RotateCcw className="mx-auto h-7 w-7 text-slate-400" />
                            <p className="mt-2 text-sm font-bold text-slate-800">No active parked sales</p>
                            <p className="mt-1 text-xs text-slate-500">Parked carts from this branch will appear here for any authorized cashier.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {activeRows.map((row) => {
                                const parkedSaleId = Number(row?.pos_parked_sale_id);
                                const status = String(row?.status || 'parked').toLowerCase();
                                const cancellationPending = status === 'cancel_pending';
                                const claimedByAnotherUser = Boolean(row?.claimed_by)
                                    && Number(row.claimed_by) !== Number(currentUserId);
                                const claimedElsewhere = status === 'claimed'
                                    && (claimedByAnotherUser
                                        || (Boolean(row?.claimed_terminal_id)
                                            && normalizeTerminalId(row.claimed_terminal_id) !== normalizedTerminalId));
                                const lines = Array.isArray(row?.snapshot?.lines) ? row.snapshot.lines : [];
                                const loadingThisRow = claimLoadingId === parkedSaleId;
                                return (
                                    <article key={parkedSaleId} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" data-testid={`pos-parked-sale-row-${parkedSaleId}`}>
                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <h3 className="truncate text-sm font-black text-slate-900">{formatParkedSaleDisplayName(row)}</h3>
                                                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${statusClassName[status] || statusClassName.parked}`}>
                                                        {status === 'claimed' ? <CheckCircle2 className="h-3 w-3" /> : <Clock3 className="h-3 w-3" />}
                                                        {status}
                                                    </span>
                                                </div>
                                                <p className="mt-1 text-xs text-slate-500">{formatDateTime(row?.created_at)} · {Number(row?.line_count || lines.length).toLocaleString('en-US')} line{Number(row?.line_count || lines.length) === 1 ? '' : 's'} · ₱{money(row?.total_amount)}</p>
                                            </div>
                                            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    onClick={() => setViewTarget(row)}
                                                    disabled={claimLoadingId !== null || cancelLoadingId !== null}
                                                    className="rounded-lg border-slate-300 px-3 text-xs font-extrabold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                                                    data-testid={`pos-parked-sale-view-${parkedSaleId}`}
                                                >
                                                    <Eye className="mr-1.5 h-3.5 w-3.5" />
                                                    View
                                                </Button>
                                                <Button
                                                    type="button"
                                                    onClick={() => handleClaim(row, 'pay')}
                                                    disabled={loadingThisRow || claimLoadingId !== null || cancelLoadingId !== null || cartHasItems || !canTransact || claimedElsewhere || cancellationPending || !normalizedTerminalId}
                                                    className="rounded-lg bg-[#1A4E8D] px-4 text-xs font-extrabold text-white hover:bg-[#143F73] disabled:cursor-not-allowed disabled:opacity-60"
                                                    data-testid={`pos-parked-sale-pay-${parkedSaleId}`}
                                                    title={cancellationPending ? 'This sale is awaiting Back Office cancellation approval.' : (claimedElsewhere ? 'This parked sale is claimed on another terminal.' : undefined)}
                                                >
                                                    {loadingThisRow && claimAction === 'pay' ? 'Opening...' : claimedElsewhere ? 'In use' : 'Pay'}
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    onClick={() => handleClaim(row, 'resume')}
                                                    disabled={loadingThisRow || claimLoadingId !== null || cancelLoadingId !== null || cartHasItems || !canTransact || claimedElsewhere || cancellationPending || !normalizedTerminalId}
                                                    className="rounded-lg border-blue-200 px-4 text-xs font-extrabold text-blue-800 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                                                    data-testid={`pos-parked-sale-resume-${parkedSaleId}`}
                                                    title={cancellationPending ? 'This sale is awaiting Back Office cancellation approval.' : (claimedElsewhere ? 'This parked sale is claimed on another terminal.' : undefined)}
                                                >
                                                    {loadingThisRow && claimAction === 'resume' ? 'Resuming...' : 'Resume'}
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    onClick={() => {
                                                        setCancelTarget(row);
                                                        setCancelReason('');
                                                        setActionError('');
                                                    }}
                                                    disabled={claimLoadingId !== null || cancelLoadingId !== null || !canTransact || status === 'cancel_pending' || !normalizedTerminalId}
                                                    className="rounded-lg border-rose-200 px-3 text-xs font-extrabold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                                                    data-testid={`pos-parked-sale-cancel-${parkedSaleId}`}
                                                    title={status === 'cancel_pending' ? 'Cancellation is awaiting Back Office approval.' : undefined}
                                                >
                                                    {status === 'cancel_pending' ? null : <Ban className="mr-1.5 h-3.5 w-3.5" />}
                                                    {status === 'cancel_pending' ? 'Awaiting approval' : 'Cancel'}
                                                </Button>
                                            </div>
                                        </div>
                                        {status === 'cancel_pending' && <p className="mt-3 text-xs font-semibold text-violet-800">Cancellation is awaiting Back Office approval. Stock remains deducted until it is approved.</p>}
                                        {cancelTarget && Number(cancelTarget?.pos_parked_sale_id) === parkedSaleId && (
                                            <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3">
                                                <p className="text-xs font-extrabold text-rose-900">Request cancellation approval</p>
                                                <p className="mt-1 text-xs text-rose-800">Stock was deducted when this sale was parked. It will be restored only after Back Office approves the request.</p>
                                                <label className="mt-2 block text-xs font-semibold text-rose-900" htmlFor={`parked-cancel-reason-${parkedSaleId}`}>Reason</label>
                                                <textarea
                                                    id={`parked-cancel-reason-${parkedSaleId}`}
                                                    value={cancelReason}
                                                    onChange={(event) => setCancelReason(event.target.value)}
                                                    maxLength={255}
                                                    rows={2}
                                                    placeholder="Why should this parked sale be cancelled?"
                                                    disabled={cancelLoadingId !== null}
                                                    className="mt-1 w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-rose-400"
                                                />
                                                <div className="mt-2 flex justify-end">
                                                    <Button
                                                        type="button"
                                                        onClick={() => handleCancel(row)}
                                                        disabled={cancelLoadingId !== null || cancelReason.trim().length < 3}
                                                        className="h-9 shrink-0 bg-rose-700 px-3 text-xs font-extrabold text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-60"
                                                    >
                                                        {cancelLoadingId === parkedSaleId ? 'Submitting...' : 'Request approval'}
                                                    </Button>
                                                </div>
                                            </div>
                                        )}
                                    </article>
                                );
                            })}
                        </div>
                    )}
                    </div>

                    <DialogFooter className="shrink-0 border-t border-slate-200 px-5 py-3">
                        <div className="flex w-full items-center justify-between gap-3">
                            <span className="text-xs font-semibold text-slate-500">{activeRows.length} active parked sale{activeRows.length === 1 ? '' : 's'}</span>
                            <Button type="button" variant="outline" onClick={closeDialog} disabled={claimLoadingId !== null || cancelLoadingId !== null}>Close</Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog
                open={Boolean(viewTarget)}
                onOpenChange={(nextOpen) => {
                    if (!nextOpen) setViewTarget(null);
                }}
            >
                <DialogContent className="flex max-h-[calc(100dvh-1rem)] min-h-0 max-w-xl flex-col overflow-hidden p-0 sm:max-h-[90vh]" data-testid="pos-parked-sale-view-dialog">
                    <DialogHeader className="shrink-0 border-b border-slate-200 px-5 py-4">
                        <DialogTitle className="text-lg font-black text-slate-900">
                            {viewTarget ? formatParkedSaleDisplayName(viewTarget) : 'Parked Sale Items'}
                        </DialogTitle>
                        <DialogDescription className="mt-1 text-sm text-slate-600">
                            {viewLines.length} item lines in this parked sale.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="dgfy-pos-scrollbar-hidden min-h-0 flex-1 overflow-y-auto px-5 py-4">
                        {viewLines.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-600">
                                No items available for this parked sale.
                            </div>
                        ) : (
                            <div className="space-y-2" data-testid="pos-parked-sale-view-items">
                                {viewLines.map((line, index) => {
                                    const quantity = Number(line?.quantity || 0);
                                    const unitPrice = Number(line?.sale_price || 0);
                                    return (
                                        <div
                                            key={`${line?.line_key || line?.item_id || 'line'}-${index}`}
                                            className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3"
                                            data-testid={`pos-parked-sale-view-line-${viewTarget?.pos_parked_sale_id || 'sale'}-${index}`}
                                        >
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-extrabold text-slate-900">{line?.item_name || `Item #${line?.item_id || ''}`}</p>
                                                <p className="mt-0.5 text-xs font-semibold text-slate-500">Qty {quantity} · ₱{money(unitPrice)} each</p>
                                            </div>
                                            <p className="shrink-0 text-sm font-black text-slate-900">₱{money(quantity * unitPrice)}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <DialogFooter className="shrink-0 border-t border-slate-200 px-5 py-3">
                        <Button type="button" variant="outline" onClick={() => setViewTarget(null)}>Close</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

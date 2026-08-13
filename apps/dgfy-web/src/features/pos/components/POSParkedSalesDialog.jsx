import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Ban, Bookmark, CheckCircle2, Clock3, RefreshCcw, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

const money = (value) => Number(value || 0).toFixed(2);

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
    claimed: 'border-blue-200 bg-blue-50 text-blue-800'
};

export default function POSParkedSalesDialog({
    open = false,
    onOpenChange = () => {},
    activeShiftId = null,
    selectedLocationId = null,
    terminalId = '',
    cartHasItems = false,
    canView = true,
    canTransact = true,
    onBeforeClaim = () => ({ ok: true }),
    onClaimed = () => {},
    onCancelled = () => {}
}) {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [claimLoadingId, setClaimLoadingId] = useState(null);
    const [cancelLoadingId, setCancelLoadingId] = useState(null);
    const [cancelTarget, setCancelTarget] = useState(null);
    const [cancelReason, setCancelReason] = useState('');
    const [error, setError] = useState('');
    const [actionError, setActionError] = useState('');

    const normalizedTerminalId = normalizeTerminalId(terminalId);
    const activeRows = useMemo(
        () => (Array.isArray(rows) ? rows : []).filter((row) => ['parked', 'claimed'].includes(String(row?.status || '').toLowerCase())),
        [rows]
    );

    const loadParkedSales = useCallback(async ({ silent = false } = {}) => {
        if (!activeShiftId || !canView) {
            setRows([]);
            setError('');
            return;
        }
        if (silent) setRefreshing(true);
        else setLoading(true);
        setError('');
        try {
            const result = await fetchPosParkedSales({
                shift_id: Number(activeShiftId),
                location_id: selectedLocationId ? Number(selectedLocationId) : undefined,
                limit: 100
            });
            setRows(Array.isArray(result?.parked_sales) ? result.parked_sales : []);
        } catch (requestError) {
            setRows([]);
            setError(requestError?.response?.data?.message || requestError?.message || 'Unable to load parked sales.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [activeShiftId, canView, selectedLocationId]);

    useEffect(() => {
        if (!open) return undefined;
        loadParkedSales();
        return undefined;
    }, [loadParkedSales, open]);

    const handleClaim = async (row) => {
        const parkedSaleId = Number(row?.pos_parked_sale_id);
        if (!Number.isInteger(parkedSaleId) || parkedSaleId <= 0) return;
        if (cartHasItems) {
            setActionError('Start with an empty sale before resuming a parked sale. Park or complete the current cart first.');
            return;
        }
        if (!canTransact) {
            setActionError('POS transact permission is required to resume a parked sale.');
            return;
        }
        const preflight = await onBeforeClaim(row) || {};
        if (preflight.ok === false) {
            setActionError(preflight.message || 'This parked sale needs review before it can be resumed.');
            return;
        }

        setClaimLoadingId(parkedSaleId);
        setActionError('');
        try {
            const claimed = await claimPosParkedSale(parkedSaleId, {
                shift_id: Number(activeShiftId),
                terminal_id: normalizedTerminalId,
                location_id: selectedLocationId ? Number(selectedLocationId) : undefined
            });
            await onClaimed(claimed);
            onOpenChange(false);
        } catch (requestError) {
            setActionError(requestError?.response?.data?.message || requestError?.message || 'Unable to resume this parked sale. It may already be claimed on another terminal.');
            await loadParkedSales({ silent: true });
        } finally {
            setClaimLoadingId(null);
        }
    };

    const handleCancel = async (row) => {
        const parkedSaleId = Number(row?.pos_parked_sale_id);
        if (!Number.isInteger(parkedSaleId) || parkedSaleId <= 0) return;
        if (!canTransact) {
            setActionError('POS transact permission is required to cancel a parked sale.');
            return;
        }
        const reason = String(cancelReason || '').trim();
        if (reason.length < 3) {
            setActionError('Enter a short cancellation reason (at least 3 characters).');
            return;
        }

        setCancelLoadingId(parkedSaleId);
        setActionError('');
        try {
            const cancelled = await cancelPosParkedSale(parkedSaleId, {
                shift_id: Number(activeShiftId),
                terminal_id: normalizedTerminalId,
                location_id: selectedLocationId ? Number(selectedLocationId) : undefined,
                reason
            });
            await onCancelled(cancelled);
            setCancelTarget(null);
            setCancelReason('');
            await loadParkedSales({ silent: true });
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
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && closeDialog()}>
            <DialogContent className="max-h-[90vh] max-w-2xl overflow-hidden p-0" data-testid="pos-parked-sales-dialog">
                <DialogHeader className="border-b border-slate-200 px-5 py-4">
                    <div className="flex items-start justify-between gap-3 pr-7">
                        <div>
                            <DialogTitle className="flex items-center gap-2 text-lg font-black text-slate-900">
                                <Bookmark className="h-5 w-5 text-amber-600" />
                                Parked Sales
                            </DialogTitle>
                            <DialogDescription className="mt-1 text-sm text-slate-600">
                                Choose a parked sale to resume it explicitly. Nothing is loaded into the active cart automatically.
                            </DialogDescription>
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={() => loadParkedSales({ silent: true })} disabled={loading || refreshing || claimLoadingId !== null || cancelLoadingId !== null} aria-label="Refresh parked sales">
                            <RefreshCcw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                            Refresh
                        </Button>
                    </div>
                </DialogHeader>

                <div className="dgfy-pos-scrollbar-hidden min-h-0 overflow-y-auto px-5 py-4" aria-busy={loading || claimLoadingId !== null || cancelLoadingId !== null}>
                    {cartHasItems && (
                        <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800" role="alert">
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>Park or complete the current cart before resuming a parked sale. The active cart will never be replaced.</span>
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
                            <p className="mt-1 text-xs text-slate-500">Parked carts from this open shift will appear here.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {activeRows.map((row) => {
                                const parkedSaleId = Number(row?.pos_parked_sale_id);
                                const status = String(row?.status || 'parked').toLowerCase();
                                const claimedElsewhere = status === 'claimed'
                                    && Boolean(row?.claimed_terminal_id)
                                    && normalizeTerminalId(row.claimed_terminal_id) !== normalizedTerminalId;
                                const lines = Array.isArray(row?.snapshot?.lines) ? row.snapshot.lines : [];
                                const linePreview = lines.slice(0, 3).map((line) => line?.item_name || `Item #${line?.item_id || ''}`).filter(Boolean).join(', ');
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
                                                <p className="mt-1 text-xs text-slate-500">{formatDateTime(row?.created_at)} · {Number(row?.line_count || lines.length)} line{Number(row?.line_count || lines.length) === 1 ? '' : 's'} · PHP {money(row?.total_amount)}</p>
                                                <p className="mt-2 line-clamp-2 text-sm font-medium text-slate-700">{linePreview || 'No line preview available.'}</p>
                                            </div>
                                            <div className="flex shrink-0 items-center gap-2">
                                                <Button
                                                    type="button"
                                                    onClick={() => handleClaim(row)}
                                                    disabled={loadingThisRow || claimLoadingId !== null || cancelLoadingId !== null || cartHasItems || !canTransact || claimedElsewhere || !normalizedTerminalId}
                                                    className="rounded-lg bg-[#1A4E8D] px-4 text-xs font-extrabold text-white hover:bg-[#143F73] disabled:cursor-not-allowed disabled:opacity-60"
                                                    data-testid={`pos-parked-sale-resume-${parkedSaleId}`}
                                                    title={claimedElsewhere ? 'This parked sale is claimed on another terminal.' : undefined}
                                                >
                                                    {loadingThisRow ? 'Resuming...' : claimedElsewhere ? 'In use' : 'Resume'}
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    onClick={() => {
                                                        setCancelTarget(row);
                                                        setCancelReason('');
                                                        setActionError('');
                                                    }}
                                                    disabled={claimLoadingId !== null || cancelLoadingId !== null || !canTransact || claimedElsewhere || !normalizedTerminalId}
                                                    className="rounded-lg border-rose-200 px-3 text-xs font-extrabold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                                                    data-testid={`pos-parked-sale-cancel-${parkedSaleId}`}
                                                >
                                                    <Ban className="mr-1.5 h-3.5 w-3.5" />
                                                    Cancel
                                                </Button>
                                            </div>
                                        </div>
                                        {cancelTarget && Number(cancelTarget?.pos_parked_sale_id) === parkedSaleId && (
                                            <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3">
                                                <label htmlFor={`pos-parked-sale-cancel-reason-${parkedSaleId}`} className="text-xs font-extrabold text-rose-900">Cancellation reason</label>
                                                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                                                    <Input
                                                        id={`pos-parked-sale-cancel-reason-${parkedSaleId}`}
                                                        value={cancelReason}
                                                        onChange={(event) => setCancelReason(event.target.value)}
                                                        placeholder="Customer left, duplicate cart, etc."
                                                        disabled={cancelLoadingId !== null}
                                                        maxLength={255}
                                                        className="h-9 bg-white text-xs"
                                                    />
                                                    <Button
                                                        type="button"
                                                        onClick={() => handleCancel(row)}
                                                        disabled={cancelLoadingId !== null || cancelReason.trim().length < 3}
                                                        className="h-9 shrink-0 bg-rose-700 px-3 text-xs font-extrabold text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-60"
                                                    >
                                                        {cancelLoadingId === parkedSaleId ? 'Cancelling...' : 'Confirm cancel'}
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

                <DialogFooter className="border-t border-slate-200 px-5 py-3">
                    <div className="flex w-full items-center justify-between gap-3">
                        <span className="text-xs font-semibold text-slate-500">{activeRows.length} active parked sale{activeRows.length === 1 ? '' : 's'}</span>
                        <Button type="button" variant="outline" onClick={closeDialog} disabled={claimLoadingId !== null || cancelLoadingId !== null}>Close</Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

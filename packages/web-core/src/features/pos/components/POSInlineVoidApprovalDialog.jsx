import React, { useEffect, useMemo, useState } from 'react';
import { Check, Clock3, RefreshCcw, ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog';

const getApprovalId = (request) => Number(request?.business_admin_approval_request_id || request?.id);

const getRequestPayload = (request) => {
    if (request?.payload && typeof request.payload === 'object') return request.payload;
    if (typeof request?.payload === 'string') {
        try {
            const parsed = JSON.parse(request.payload);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch {
            return {};
        }
    }
    return {};
};

const formatMoney = (value) => Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
});

const formatDateTime = (value) => {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
};

const isParkedSaleCancellation = (request) => request?.action_type === 'pos_parked_sale_cancel';

const getApprovalActionLabel = (request) => (
    isParkedSaleCancellation(request) ? 'Cancel parked sale' : 'Void transaction'
);

const getApprovalReference = (request, payload) => {
    if (isParkedSaleCancellation(request)) {
        const parkReference = String(payload?.park_reference || '').trim();
        return parkReference
            ? `Parked sale ${parkReference}`
            : `Parked sale #${request?.entity_id || '—'}`;
    }
    return payload?.invoice_number || `Transaction #${request?.entity_id || '—'}`;
};

const getApprovalAmountLabel = (request, payload) => (
    isParkedSaleCancellation(request) ? 'No payment captured' : `₱${formatMoney(payload?.amount)}`
);

const getRequesterLabel = (request) => (
    request?.requested_by_user?.username
    || request?.requested_by_user?.email
    || (request?.requested_by ? `User #${request.requested_by}` : 'Unknown user')
);

const mergeRequests = (selectedRequest, requests) => {
    const merged = [];
    const seen = new Set();
    [selectedRequest, ...(Array.isArray(requests) ? requests : [])].forEach((request) => {
        const id = getApprovalId(request);
        if (!Number.isInteger(id) || id <= 0 || seen.has(id)) return;
        seen.add(id);
        merged.push(request);
    });
    return merged;
};

export default function POSInlineVoidApprovalDialog({
    open = false,
    onOpenChange = () => {},
    requests = [],
    loading = false,
    error = '',
    decisionLoading = false,
    canReview = false,
    currentUserId = null,
    selectedRequest = null,
    onRefresh = async () => {},
    onDecision = async () => {}
}) {
    const displayRequests = useMemo(
        () => mergeRequests(selectedRequest, requests),
        [requests, selectedRequest]
    );
    const [activeRequestId, setActiveRequestId] = useState(null);
    const [approvalNote, setApprovalNote] = useState('');

    useEffect(() => {
        const selectedId = getApprovalId(selectedRequest);
        setActiveRequestId(Number.isInteger(selectedId) && selectedId > 0 ? selectedId : null);
        setApprovalNote('');
    }, [selectedRequest]);

    const activeRequest = displayRequests.find((request) => getApprovalId(request) === activeRequestId)
        || displayRequests[0]
        || null;
    const activePayload = getRequestPayload(activeRequest);
    const activeStatus = String(activeRequest?.status || 'pending').trim().toLowerCase();
    const isRequester = Boolean(
        activeRequest
        && currentUserId != null
        && Number(activeRequest.requested_by) === Number(currentUserId)
    );
    const canDecide = Boolean(canReview && activeRequest && activeStatus === 'pending' && !isRequester && !decisionLoading);

    const handleDecision = (decision) => {
        if (!canDecide) return;
        void onDecision(activeRequest, decision, approvalNote).catch(() => {});
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                data-testid="pos-inline-void-approval-dialog"
                className="flex max-h-[calc(100vh-2rem)] min-h-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
            >
                <DialogHeader className="shrink-0 border-b border-slate-200 px-5 py-4 sm:px-6">
                    <DialogTitle className="flex items-center gap-2 text-xl text-[#0F172A]">
                        <ShieldCheck className="h-5 w-5 text-[#1A4E8D]" aria-hidden="true" />
                        POS approval requests
                    </DialogTitle>
                    <DialogDescription>
                        Review pending POS void and parked-sale cancellation requests. Approval executes the internal POS action only; it does not refund captured customer money.
                    </DialogDescription>
                </DialogHeader>

                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6" data-testid="pos-inline-void-approval-body">
                    {error && (
                        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800" role="alert">
                            {error}
                        </p>
                    )}

                    {!canReview && (
                        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
                            This request is waiting for an authorized manager. The requester cannot approve their own POS action.
                        </p>
                    )}

                    {canReview && loading && (
                        <p className="flex items-center gap-2 text-sm text-slate-500" role="status">
                            <RefreshCcw className="h-4 w-4 animate-spin" aria-hidden="true" />
                            Loading pending POS approval requests…
                        </p>
                    )}

                    {canReview && !loading && displayRequests.length === 0 && (
                        <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
                            No pending POS approval requests.
                        </div>
                    )}

                    {displayRequests.length > 0 && (
                        <div className="space-y-2" aria-label="Pending POS approval requests">
                            {displayRequests.map((request) => {
                                const requestId = getApprovalId(request);
                                const payload = getRequestPayload(request);
                                const isActive = requestId === getApprovalId(activeRequest);
                                const status = String(request?.status || 'pending').trim().toLowerCase();
                                return (
                                    <button
                                        key={requestId}
                                        type="button"
                                        data-testid={`pos-inline-void-approval-request-${requestId}`}
                                        onClick={() => setActiveRequestId(requestId)}
                                        className={`w-full rounded-xl border px-3 py-3 text-left transition ${isActive ? 'border-[#1A4E8D] bg-blue-50/70' : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50'}`}
                                        aria-pressed={isActive}
                                    >
                                        <div className="flex min-w-0 items-start justify-between gap-3">
                                            <span className="min-w-0 truncate text-sm font-extrabold text-[#0F172A]">
                                                {getApprovalReference(request, payload)}
                                            </span>
                                            <span className={`shrink-0 text-[10px] font-black uppercase tracking-wide ${status === 'pending' ? 'text-amber-700' : status === 'rejected' ? 'text-rose-700' : 'text-emerald-700'}`}>
                                                {status}
                                            </span>
                                        </div>
                                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
                                            <span>{getApprovalActionLabel(request)}</span>
                                            <span>{getApprovalAmountLabel(request, payload)}</span>
                                            <span>Requested by {getRequesterLabel(request)}</span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {activeRequest && (
                        <section className="rounded-xl border border-slate-200 bg-slate-50 p-4" aria-label="Selected POS approval">
                            <div className="grid gap-3 text-sm sm:grid-cols-2">
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Type</p>
                                    <p className="mt-1 font-extrabold text-[#0F172A]">{getApprovalActionLabel(activeRequest)}</p>
                                </div>
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Reference</p>
                                    <p className="mt-1 font-extrabold text-[#0F172A]">{getApprovalReference(activeRequest, activePayload)}</p>
                                </div>
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Amount</p>
                                    <p className="mt-1 font-extrabold text-[#0F172A]">{getApprovalAmountLabel(activeRequest, activePayload)}</p>
                                </div>
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Requester</p>
                                    <p className="mt-1 text-slate-700">{getRequesterLabel(activeRequest)}</p>
                                </div>
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Requested</p>
                                    <p className="mt-1 text-slate-700">{formatDateTime(activeRequest.created_at)}</p>
                                </div>
                            </div>
                            <div className="mt-4 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                                <span className="font-bold text-[#0F172A]">Reason: </span>
                                {activeRequest.reason || activePayload.reason || 'No reason recorded'}
                            </div>

                            {activeStatus === 'pending' && canReview && !isRequester ? (
                                <div className="mt-4 space-y-3">
                                    <label htmlFor="pos-inline-void-approval-note" className="text-sm font-semibold text-slate-900">
                                        Review note <span className="font-normal text-slate-500">(optional)</span>
                                    </label>
                                    <Textarea
                                        id="pos-inline-void-approval-note"
                                        value={approvalNote}
                                        onChange={(event) => setApprovalNote(event.target.value)}
                                        maxLength={500}
                                        placeholder="Add a short audit note"
                                        disabled={decisionLoading}
                                        className="min-h-[72px]"
                                    />
                                    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            data-testid={`pos-inline-void-approval-reject-${getApprovalId(activeRequest)}`}
                                            onClick={() => handleDecision('reject')}
                                            disabled={!canDecide}
                                            className="h-10 w-full border-rose-200 text-rose-700 hover:bg-rose-50 sm:w-auto"
                                        >
                                            <X className="mr-2 h-4 w-4" aria-hidden="true" />
                                            Reject
                                        </Button>
                                        <Button
                                            type="button"
                                            data-testid={`pos-inline-void-approval-approve-${getApprovalId(activeRequest)}`}
                                            onClick={() => handleDecision('approve')}
                                            disabled={!canDecide}
                                            className="h-10 w-full bg-emerald-600 text-white hover:bg-emerald-700 sm:w-auto"
                                        >
                                            <Check className="mr-2 h-4 w-4" aria-hidden="true" />
                                            {decisionLoading
                                                ? 'Saving…'
                                                : isParkedSaleCancellation(activeRequest) ? 'Approve cancellation' : 'Approve void'}
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate-600" role="status">
                                    {activeStatus === 'pending'
                                        ? <><Clock3 className="h-4 w-4 text-amber-600" aria-hidden="true" /> Waiting for an authorized manager.</>
                                        : <>Decision recorded: {activeStatus}.</>}
                                </p>
                            )}
                        </section>
                    )}
                </div>

                <DialogFooter className="shrink-0 border-t border-slate-200 px-5 py-3 sm:px-6 sm:py-4">
                    <Button
                        type="button"
                        variant="outline"
                        data-testid="pos-inline-void-approval-refresh"
                        onClick={() => void onRefresh()}
                        disabled={loading || decisionLoading || !canReview}
                        className="h-10 w-full sm:w-auto"
                    >
                        <RefreshCcw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
                        Refresh
                    </Button>
                    <Button
                        type="button"
                        data-testid="pos-inline-void-approval-close"
                        onClick={() => onOpenChange(false)}
                        disabled={decisionLoading}
                        className="h-10 w-full sm:w-auto"
                    >
                        Done
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

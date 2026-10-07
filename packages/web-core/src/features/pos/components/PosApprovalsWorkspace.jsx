import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Clock3, RefreshCcw, ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { posToast as toast } from '@/src/utils/iminRuntimeFeedback.js';
import { decidePosVoidApproval, fetchPosVoidApprovals } from '../services/posService.js';

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
        return parkReference ? `Parked sale ${parkReference}` : `Parked sale #${request?.entity_id || '—'}`;
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

export default function PosApprovalsWorkspace({
    locked = false,
    isOnline = true,
    canReview = false,
    currentUserId = null
}) {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(false);
    const [decisionLoading, setDecisionLoading] = useState(false);
    const [error, setError] = useState('');
    const [selectedRequestId, setSelectedRequestId] = useState(null);
    const [approvalNote, setApprovalNote] = useState('');

    const loadApprovals = useCallback(async () => {
        if (locked || !isOnline || !canReview) {
            setRequests([]);
            setLoading(false);
            return [];
        }

        setLoading(true);
        setError('');
        try {
            const result = await fetchPosVoidApprovals({ status: 'pending', limit: 100 });
            const nextRequests = Array.isArray(result?.approvals) ? result.approvals : [];
            setRequests(nextRequests);
            return nextRequests;
        } catch (requestError) {
            const status = requestError?.response?.status;
            setError(status === 401 || status === 403
                ? 'Your POS account is not authorized to review approval requests.'
                : (requestError?.response?.data?.message || 'Failed to load POS approval requests.'));
            setRequests([]);
            return [];
        } finally {
            setLoading(false);
        }
    }, [canReview, isOnline, locked]);

    useEffect(() => {
        void loadApprovals();
    }, [loadApprovals]);

    useEffect(() => {
        if (!requests.some((request) => getApprovalId(request) === selectedRequestId)) {
            setSelectedRequestId(getApprovalId(requests[0]) || null);
            setApprovalNote('');
        }
    }, [requests, selectedRequestId]);

    const selectedRequest = useMemo(
        () => requests.find((request) => getApprovalId(request) === selectedRequestId) || requests[0] || null,
        [requests, selectedRequestId]
    );
    const selectedPayload = getRequestPayload(selectedRequest);
    const selectedStatus = String(selectedRequest?.status || 'pending').trim().toLowerCase();
    const isRequester = Boolean(
        selectedRequest
        && currentUserId != null
        && Number(selectedRequest.requested_by) === Number(currentUserId)
    );
    const canDecide = Boolean(canReview && selectedRequest && selectedStatus === 'pending' && !isRequester && !decisionLoading);

    const handleDecision = async (decision) => {
        if (!canDecide) return;
        setDecisionLoading(true);
        setError('');
        try {
            await decidePosVoidApproval(getApprovalId(selectedRequest), decision, {
                note: String(approvalNote || '').trim().slice(0, 500) || undefined
            });
            toast.success(decision === 'approve'
                ? (isParkedSaleCancellation(selectedRequest) ? 'Parked sale cancellation approved.' : 'POS void approved.')
                : 'POS approval request rejected.');
            setApprovalNote('');
            await loadApprovals();
        } catch (decisionError) {
            const message = decisionError?.response?.data?.message || 'The POS approval decision could not be saved.';
            setError(message);
            toast.error(message);
        } finally {
            setDecisionLoading(false);
        }
    };

    return (
        <section className="min-w-0 space-y-4" data-testid="pos-approvals-workspace">
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5 shrink-0 text-[#1A4E8D]" aria-hidden="true" />
                        <h1 className="text-xl font-black tracking-tight text-[#0F172A]">POS approval administration</h1>
                    </div>
                    <p className="mt-1 max-w-3xl text-sm leading-5 text-slate-600">
                        Review void and parked-sale cancellation requests inside POS. POS remains the canonical executor of the approved transaction and inventory change.
                    </p>
                </div>
                <Button
                    type="button"
                    variant="outline"
                    data-testid="pos-approvals-refresh"
                    onClick={() => void loadApprovals()}
                    disabled={loading || decisionLoading || locked || !isOnline || !canReview}
                    className="h-10 shrink-0 border-[#1A4E8D] font-extrabold text-[#1A4E8D] hover:bg-blue-50"
                >
                    <RefreshCcw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
                    Refresh
                </Button>
            </div>

            {locked ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">Unlock the POS terminal to open approval administration.</p>
            ) : !isOnline ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">Reconnect to the internet to load approval requests.</p>
            ) : !canReview ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">This POS account does not have approval-review permission.</p>
            ) : null}

            {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800" role="alert">{error}</p> : null}

            {canReview && isOnline && !locked && loading ? (
                <p className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-500" role="status">
                    <RefreshCcw className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading pending POS approval requests…
                </p>
            ) : null}

            {canReview && isOnline && !locked && !loading && requests.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
                    No pending POS approval requests.
                </div>
            ) : null}

            {requests.length > 0 ? (
                <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                    <div className="space-y-2" aria-label="Pending POS approval requests">
                        {requests.map((request) => {
                            const requestId = getApprovalId(request);
                            const payload = getRequestPayload(request);
                            const active = requestId === getApprovalId(selectedRequest);
                            return (
                                <button
                                    key={requestId}
                                    type="button"
                                    data-testid={`pos-approval-request-${requestId}`}
                                    onClick={() => {
                                        setSelectedRequestId(requestId);
                                        setApprovalNote('');
                                    }}
                                    aria-pressed={active}
                                    className={`w-full rounded-xl border px-4 py-3 text-left transition ${active ? 'border-[#1A4E8D] bg-blue-50/70 shadow-sm' : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50'}`}
                                >
                                    <div className="flex min-w-0 items-start justify-between gap-3">
                                        <span className="min-w-0 truncate text-sm font-extrabold text-[#0F172A]">{getApprovalReference(request, payload)}</span>
                                        <span className="shrink-0 text-[10px] font-black uppercase tracking-wide text-amber-700">{request.status || 'pending'}</span>
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

                    {selectedRequest ? (
                        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Selected POS approval request">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-xs font-black uppercase tracking-wide text-[#1A4E8D]">Selected request</p>
                                    <h2 className="mt-1 text-lg font-black text-[#0F172A]">{getApprovalActionLabel(selectedRequest)}</h2>
                                </div>
                                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-amber-800">{selectedStatus}</span>
                            </div>
                            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                                <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Reference</p><p className="mt-1 font-extrabold text-[#0F172A]">{getApprovalReference(selectedRequest, selectedPayload)}</p></div>
                                <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Amount</p><p className="mt-1 font-extrabold text-[#0F172A]">{getApprovalAmountLabel(selectedRequest, selectedPayload)}</p></div>
                                <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Requester</p><p className="mt-1 text-slate-700">{getRequesterLabel(selectedRequest)}</p></div>
                                <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Requested</p><p className="mt-1 text-slate-700">{formatDateTime(selectedRequest.created_at)}</p></div>
                            </div>
                            <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"><span className="font-bold text-[#0F172A]">Reason: </span>{selectedRequest.reason || selectedPayload.reason || 'No reason recorded'}</p>

                            {selectedStatus === 'pending' && canReview && !isRequester ? (
                                <div className="mt-4 space-y-3">
                                    <label htmlFor="pos-approval-note" className="text-sm font-semibold text-slate-900">Review note <span className="font-normal text-slate-500">(optional)</span></label>
                                    <Textarea id="pos-approval-note" value={approvalNote} onChange={(event) => setApprovalNote(event.target.value)} maxLength={500} placeholder="Add a short audit note" disabled={decisionLoading} className="min-h-[76px]" />
                                    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                                        <Button type="button" variant="outline" data-testid={`pos-approval-reject-${getApprovalId(selectedRequest)}`} onClick={() => void handleDecision('reject')} disabled={!canDecide} className="h-10 w-full border-rose-200 text-rose-700 hover:bg-rose-50 sm:w-auto"><X className="mr-2 h-4 w-4" aria-hidden="true" />Reject</Button>
                                        <Button type="button" data-testid={`pos-approval-approve-${getApprovalId(selectedRequest)}`} onClick={() => void handleDecision('approve')} disabled={!canDecide} className="h-10 w-full bg-emerald-600 text-white hover:bg-emerald-700 sm:w-auto"><Check className="mr-2 h-4 w-4" aria-hidden="true" />{decisionLoading ? 'Saving…' : (isParkedSaleCancellation(selectedRequest) ? 'Approve cancellation' : 'Approve void')}</Button>
                                    </div>
                                </div>
                            ) : (
                                <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate-600" role="status">
                                    {isRequester ? <><Clock3 className="h-4 w-4 text-amber-600" aria-hidden="true" /> The requester cannot approve their own request.</> : <>Decision recorded: {selectedStatus}.</>}
                                </p>
                            )}
                        </section>
                    ) : null}
                </div>
            ) : null}
        </section>
    );
}

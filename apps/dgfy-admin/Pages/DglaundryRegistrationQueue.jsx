import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, Clock, FileText, RefreshCw, Search, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import * as adminService from '@/services/adminService';

const STATUS_LABELS = {
    pending: 'Pending review',
    approved: 'Approved',
    rejected: 'Rejected',
    correction_required: 'Correction requested',
    expired: 'Expired',
    consumed: 'Consumed'
};

const STATUS_STYLES = {
    pending: 'border-amber-200 bg-amber-50 text-amber-800',
    approved: 'border-green-200 bg-green-50 text-green-800',
    rejected: 'border-red-200 bg-red-50 text-red-800',
    correction_required: 'border-blue-200 bg-blue-50 text-blue-800',
    expired: 'border-slate-200 bg-slate-100 text-slate-700',
    consumed: 'border-slate-200 bg-slate-100 text-slate-700'
};

const formatDate = (value) => value
    ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : '—';

const envelopeData = (response) => response?.data ?? response;

export default function DglaundryRegistrationQueue() {
    const [intents, setIntents] = useState([]);
    const [total, setTotal] = useState(0);
    const [status, setStatus] = useState('pending');
    const [search, setSearch] = useState('');
    const [offset, setOffset] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selected, setSelected] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [decisionReason, setDecisionReason] = useState('');
    const [decisionBusy, setDecisionBusy] = useState(false);
    const [decisionError, setDecisionError] = useState('');
    const [decisionNotice, setDecisionNotice] = useState('');

    const loadQueue = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const data = envelopeData(await adminService.listDglaundryRegistrationIntents({ search: search.trim(), status, limit: 20, offset }));
            setIntents(Array.isArray(data?.items) ? data.items : []);
            setTotal(Number(data?.total || 0));
        } catch (loadError) {
            setError(loadError?.response?.data?.message || 'Could not load DGLaundry registrations.');
        } finally {
            setLoading(false);
        }
    }, [offset, search, status]);

    useEffect(() => {
        const timer = window.setTimeout(() => { void loadQueue(); }, search ? 250 : 0);
        return () => window.clearTimeout(timer);
    }, [loadQueue, search]);

    const loadDetail = useCallback(async (intentId) => {
        setDetailLoading(true);
        setDecisionError('');
        try {
            const data = envelopeData(await adminService.getDglaundryRegistrationIntent(intentId));
            setSelected(data);
        } catch (loadError) {
            setDecisionError(loadError?.response?.data?.message || 'Could not load this registration for review.');
        } finally {
            setDetailLoading(false);
        }
    }, []);

    const openReview = async (intentId) => {
        setSelected({ intentId });
        setDecisionReason('');
        setDecisionNotice('');
        setDecisionError('');
        await loadDetail(intentId);
    };

    const submitDecision = async (decision) => {
        if (!selected?.intentId || selected.status !== 'pending' || decisionBusy) return;
        const reason = decisionReason.trim();
        if (decision !== 'approve' && !reason) {
            setDecisionError('Enter a reason before rejecting or requesting a correction.');
            return;
        }
        if (decision === 'approve' && !selected.applicant?.identityVerified) {
            setDecisionError('Approval is disabled because the exact DGFY applicant identity is not verified.');
            return;
        }
        setDecisionBusy(true);
        setDecisionError('');
        setDecisionNotice('');
        try {
            const result = envelopeData(await adminService.decideDglaundryRegistrationIntent(selected.intentId, {
                decision,
                expectedStatusVersion: selected.statusVersion,
                reason: reason || null
            }));
            setDecisionNotice(result?.idempotentReplay ? 'This decision was already recorded.' : 'Decision recorded.');
            await Promise.all([loadQueue(), loadDetail(selected.intentId)]);
        } catch (decisionFailure) {
            if (decisionFailure?.response?.status === 409) {
                await Promise.all([loadQueue(), loadDetail(selected.intentId)]);
                setDecisionError('This registration changed while it was open. The latest review is loaded below; verify it before deciding again.');
            } else {
                setDecisionError(decisionFailure?.response?.data?.message || 'The decision could not be recorded.');
            }
        } finally {
            setDecisionBusy(false);
        }
    };

    return (
        <section className="mb-6 rounded-xl border border-teal-200 bg-teal-50/50 p-5" aria-labelledby="dglaundry-registrations-heading">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-teal-800">
                        <FileText className="h-4 w-4" aria-hidden="true" />
                        Provider approval queue
                    </div>
                    <h2 id="dglaundry-registrations-heading" className="mt-1 text-lg font-bold text-slate-900">DGLaundry registrations</h2>
                    <p className="mt-1 max-w-3xl text-sm text-slate-600">Review DGLaundry company applications here. Approval creates the DGFY company, owner membership, and provider location; DGLaundry activates its local workspace after checking this decision.</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => void loadQueue()} disabled={loading}>
                    <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
                    Refresh queue
                </Button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto]">
                <label className="relative block">
                    <span className="sr-only">Search DGLaundry registrations</span>
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                    <input
                        value={search}
                        onChange={(event) => { setOffset(0); setSearch(event.target.value); }}
                        maxLength={160}
                        placeholder="Search company, applicant email, or intent ID"
                        className="w-full rounded-md border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                    />
                </label>
                <label>
                    <span className="sr-only">Filter DGLaundry registrations by status</span>
                    <select value={status} onChange={(event) => { setOffset(0); setStatus(event.target.value); }} className="w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100">
                        <option value="pending">Pending review</option>
                        <option value="correction_required">Correction requested</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                        <option value="all">All statuses</option>
                    </select>
                </label>
                <span className="inline-flex items-center rounded-full border border-white bg-white px-3 py-2 text-xs font-semibold text-slate-600">{loading ? 'Loading…' : `${total === 0 ? 0 : offset + 1}–${Math.min(offset + intents.length, total)} of ${total}`}</span>
            </div>

            {error ? (
                <div role="alert" className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    <span>{error}</span>
                    <Button type="button" variant="outline" size="sm" onClick={() => void loadQueue()}>Retry</Button>
                </div>
            ) : null}

            {loading && intents.length === 0 ? (
                <div className="mt-4 flex items-center gap-2 rounded-lg border border-white bg-white/70 px-4 py-5 text-sm text-slate-600"><RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />Loading registrations…</div>
            ) : !loading && intents.length === 0 ? (
                <div className="mt-4 rounded-lg border border-white bg-white/70 px-4 py-5 text-sm text-slate-600">No DGLaundry registrations match this status and search.</div>
            ) : (
                <div className="mt-4 space-y-2">
                    {intents.map((intent) => {
                        const label = STATUS_LABELS[intent.status] || intent.status;
                        const Icon = intent.status === 'approved' ? CheckCircle : intent.status === 'rejected' ? XCircle : Clock;
                        return (
                            <div key={intent.intentId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-teal-100 bg-white px-4 py-3">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="truncate font-semibold text-slate-900">{intent.organizationName || 'Company registration'}</span>
                                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[intent.status] || STATUS_STYLES.pending}`}>
                                            <Icon className="h-3.5 w-3.5" aria-hidden="true" />{label}
                                        </span>
                                    </div>
                                    <div className="mt-1 truncate text-xs text-slate-500">{intent.applicant?.email || 'Applicant identity not verified'} · {intent.branchName || 'First location pending'} · Submitted {formatDate(intent.createdAt)}</div>
                                </div>
                                <Button type="button" variant="outline" size="sm" onClick={() => void openReview(intent.intentId)}>Review</Button>
                            </div>
                        );
                    })}
                </div>
            )}

            {total > 20 ? (
                <nav aria-label="DGLaundry registration queue pages" className="mt-4 flex items-center justify-between rounded-lg border border-teal-100 bg-white px-4 py-3">
                    <span className="text-xs text-slate-500">Page {Math.floor(offset / 20) + 1} of {Math.ceil(total / 20)}</span>
                    <div className="flex gap-2">
                        <Button type="button" variant="outline" size="sm" disabled={offset === 0 || loading} onClick={() => setOffset((value) => Math.max(0, value - 20))}>Previous</Button>
                        <Button type="button" variant="outline" size="sm" disabled={offset + 20 >= total || loading} onClick={() => setOffset((value) => value + 20)}>Next</Button>
                    </div>
                </nav>
            ) : null}

            {selected ? (
                <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !decisionBusy) setSelected(null); }}>
                    <section role="dialog" aria-modal="true" aria-labelledby="dglaundry-review-title" className="my-auto max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-2xl sm:p-6">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-800">DGLaundry provider application</p>
                                <h3 id="dglaundry-review-title" className="mt-1 text-xl font-bold text-slate-900">{selected.payload?.organizationName || 'Review registration'}</h3>
                                {selected.status ? <span className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[selected.status] || STATUS_STYLES.pending}`}>{STATUS_LABELS[selected.status] || selected.status}</span> : null}
                            </div>
                            <Button type="button" variant="outline" size="sm" onClick={() => setSelected(null)} disabled={decisionBusy} aria-label="Close DGLaundry registration review">Close</Button>
                        </div>

                        {detailLoading ? <div className="mt-5 flex items-center gap-2 text-sm text-slate-600"><RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />Loading review details…</div> : selected.payload ? (
                            <>
                                <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><dt className="text-xs font-medium uppercase text-slate-500">First location</dt><dd className="mt-1 font-semibold text-slate-900">{selected.payload.branchName || '—'} {selected.payload.branchCode ? `(${selected.payload.branchCode})` : ''}</dd></div>
                                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><dt className="text-xs font-medium uppercase text-slate-500">Applicant</dt><dd className="mt-1 font-semibold text-slate-900">{selected.applicant?.name || 'DGFY account'}</dd><dd className="break-all text-sm text-slate-600">{selected.applicant?.email || 'No matching active account'}</dd></div>
                                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><dt className="text-xs font-medium uppercase text-slate-500">DGFY identity</dt><dd className="mt-1 text-sm text-slate-800">{selected.applicant?.identityVerified ? 'Verified against the DGFY issuer' : 'Not verified; approval is disabled'}</dd><dd className="mt-1 break-all font-mono text-xs text-slate-500">{selected.applicant?.subject || 'No subject'}</dd></div>
                                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><dt className="text-xs font-medium uppercase text-slate-500">Submitted</dt><dd className="mt-1 text-sm text-slate-800">{formatDate(selected.createdAt)}</dd><dd className="mt-1 text-xs text-slate-500">Status version {selected.statusVersion}</dd></div>
                                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><dt className="text-xs font-medium uppercase text-slate-500">Timezone / currency</dt><dd className="mt-1 text-sm text-slate-800">{selected.payload.timezone || '—'} · {selected.payload.currency || '—'}</dd></div>
                                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><dt className="text-xs font-medium uppercase text-slate-500">Public listing</dt><dd className="mt-1 break-all text-sm text-slate-800">{selected.payload.publicStorefrontHandle || 'DGFY default'}</dd></div>
                                </dl>
                                <p className="mt-3 break-all text-xs text-slate-400">Intent ID: {selected.intentId}</p>
                                {selected.reason ? <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Previous review: {selected.reason}</p> : null}
                                {selected.status === 'pending' ? (
                                    <div className="mt-5 border-t border-slate-200 pt-4">
                                        <label className="block text-sm font-medium text-slate-800" htmlFor="dglaundry-decision-reason">Review reason <span className="font-normal text-slate-500">(required for rejection or correction)</span></label>
                                        <textarea id="dglaundry-decision-reason" value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)} maxLength={1000} rows={3} className="mt-2 w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100" placeholder="Explain what needs to change or why this application cannot be approved." />
                                        <div className="mt-3 flex flex-wrap justify-end gap-2">
                                            <Button type="button" variant="outline" onClick={() => void submitDecision('request_correction')} disabled={decisionBusy}>{decisionBusy ? 'Saving…' : 'Request correction'}</Button>
                                            <Button type="button" variant="outline" onClick={() => void submitDecision('reject')} disabled={decisionBusy}>{decisionBusy ? 'Saving…' : 'Reject'}</Button>
                                            <Button type="button" onClick={() => void submitDecision('approve')} disabled={decisionBusy || !selected.applicant?.identityVerified} className="bg-teal-800 text-white hover:bg-teal-900">{decisionBusy ? 'Saving…' : 'Approve registration'}</Button>
                                        </div>
                                    </div>
                                ) : selected.status ? <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">This registration already has a decision. The status refresh in DGLaundry will reconcile the local workspace.</div> : null}
                            </>
                        ) : null}
                        {decisionError ? <div role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{decisionError}</div> : null}
                        {decisionNotice ? <div role="status" className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{decisionNotice}</div> : null}
                    </section>
                </div>
            ) : null}
        </section>
    );
}

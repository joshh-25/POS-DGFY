import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, Download, FileArchive, FileText, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import * as adminService from '@/services/adminService';
import { toast } from 'sonner';
import { normalizeApiError } from '../../../packages/web-core/src/utils/errorHandler.js';

const formatBytes = (value) => {
    const bytes = Number(value) || 0;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (value) => {
    if (!value) return 'Not available';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleString();
};

const fileNameFromResponse = (response, fallback) => {
    const disposition = response?.headers?.['content-disposition'] || '';
    const match = disposition.match(/filename="([^"]+)"/i);
    return match?.[1] || fallback;
};

const downloadBlobResponse = (response, fallbackName) => {
    const blob = response?.data;
    if (!blob) throw new Error('The download was empty.');
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileNameFromResponse(response, fallbackName);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
};

const draftCompanyName = (draft) => draft?.company_name
    || draft?.payload?.business?.company_name
    || draft?.payload?.business?.name
    || 'Company registration';

const statusClass = (status) => {
    if (['processed', 'passed', 'succeeded'].includes(status)) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    if (['failed', 'rejected'].includes(status)) return 'border-rose-200 bg-rose-50 text-rose-700';
    if (['ready_for_review', 'pending_review', 'pending'].includes(status)) return 'border-amber-200 bg-amber-50 text-amber-700';
    return 'border-slate-200 bg-slate-50 text-slate-600';
};

export default function RegistrationUploadsModal({ subject, onClose, onChanged }) {
    const isDraft = subject?.type === 'draft';
    const draftId = isDraft ? subject?.id : null;
    const tenantId = !isDraft ? subject?.id : null;
    const [review, setReview] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [downloadLoading, setDownloadLoading] = useState('');
    const [actionLoading, setActionLoading] = useState('');
    const dialogRef = useRef(null);
    const closeButtonRef = useRef(null);

    useEffect(() => {
        if (!subject) return undefined;

        const previousActiveElement = document.activeElement;
        const previousBodyOverflow = document.body.style.overflow;
        const dialog = dialogRef.current;
        const focusableSelector = [
            'button:not([disabled])',
            '[href]',
            'input:not([disabled])',
            'select:not([disabled])',
            'textarea:not([disabled])',
            '[tabindex]:not([tabindex="-1"])'
        ].join(',');

        document.body.style.overflow = 'hidden';
        const focusTimer = window.setTimeout(() => {
            closeButtonRef.current?.focus();
        }, 0);

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
                return;
            }
            if (event.key !== 'Tab' || !dialog) return;

            const focusableElements = Array.from(dialog.querySelectorAll(focusableSelector))
                .filter((element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true');
            if (focusableElements.length === 0) {
                event.preventDefault();
                dialog.focus();
                return;
            }

            const firstElement = focusableElements[0];
            const lastElement = focusableElements[focusableElements.length - 1];
            if (event.shiftKey && document.activeElement === firstElement) {
                event.preventDefault();
                lastElement.focus();
            } else if (!event.shiftKey && document.activeElement === lastElement) {
                event.preventDefault();
                firstElement.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            window.clearTimeout(focusTimer);
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = previousBodyOverflow;
            if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
                previousActiveElement.focus();
            }
        };
    }, [onClose, subject]);

    const loadReview = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const response = await adminService.listCompanyRegistrationUploads({ tenantId, draftId });
            setReview(response.data || null);
        } catch (requestError) {
            const normalized = normalizeApiError(requestError);
            setError(normalized.message || 'Failed to load registration uploads.');
        } finally {
            setLoading(false);
        }
    }, [draftId, tenantId]);

    useEffect(() => {
        void loadReview();
    }, [loadReview]);

    const rawUploads = review?.uploads;
    const uploads = useMemo(() => (Array.isArray(rawUploads) ? rawUploads : []), [rawUploads]);
    const menuUploads = useMemo(() => uploads.filter((upload) => upload.category === 'menu_upload'), [uploads]);
    const draft = review?.draft || subject;
    const materializationFailed = draft?.materialization_status === 'failed';

    const downloadUpload = async (upload) => {
        setDownloadLoading(upload.id);
        try {
            const response = await adminService.downloadCompanyRegistrationUpload({ tenantId, draftId, uploadId: upload.id });
            downloadBlobResponse(response, upload.sanitized_name || upload.original_name || 'registration-file');
        } catch (requestError) {
            const normalized = normalizeApiError(requestError);
            toast.error(normalized.message || 'Failed to download the registration file.');
        } finally {
            setDownloadLoading('');
        }
    };

    const downloadArchive = async () => {
        setDownloadLoading('archive');
        try {
            const response = await adminService.downloadCompanyRegistrationMenuArchive({ tenantId, draftId });
            downloadBlobResponse(response, 'registration-menu-originals.zip');
        } catch (requestError) {
            const normalized = normalizeApiError(requestError);
            toast.error(normalized.message || 'Failed to download the menu archive.');
        } finally {
            setDownloadLoading('');
        }
    };

    const runDraftAction = async (action) => {
        const message = action === 'approve'
            ? 'Approve this registration and start tenant setup?'
            : 'Retry materialization for this registration?';
        if (!window.confirm(message)) return;
        setActionLoading(action);
        try {
            if (action === 'approve') {
                await adminService.approveCompanyRegistrationDraft(draft.id);
            } else {
                await adminService.retryCompanyRegistrationDraftMaterialization(draft.id);
            }
            toast.success(action === 'approve' ? 'Registration approval accepted.' : 'Materialization retry accepted.');
            await loadReview();
            onChanged?.();
        } catch (requestError) {
            const normalized = normalizeApiError(requestError);
            toast.error(normalized.message || 'Registration action failed.');
        } finally {
            setActionLoading('');
        }
    };

    if (!subject) return null;

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4" role="presentation">
            <div
                className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
                role="dialog"
                aria-modal="true"
                aria-labelledby="registration-uploads-title"
                aria-describedby="registration-uploads-description"
                aria-busy={loading || Boolean(downloadLoading) || Boolean(actionLoading)}
                ref={dialogRef}
                tabIndex={-1}
            >
                <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
                    <div>
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-blue-700">
                            <FileText className="h-4 w-4" aria-hidden="true" />
                            Registration review
                        </div>
                        <h2 id="registration-uploads-title" className="mt-1 text-xl font-bold text-slate-900">
                            {draftCompanyName(draft)}
                        </h2>
                        <p className="mt-1 text-sm text-slate-600">
                            {draft?.registration_email || 'Registration account email unavailable'}
                        </p>
                    </div>
                    <button ref={closeButtonRef} type="button" onClick={onClose} className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close registration review">
                        <X className="h-5 w-5" aria-hidden="true" />
                    </button>
                </div>

                <p id="registration-uploads-description" className="sr-only">
                    Review submitted registration details and privately download supporting files.
                    Press Escape to close this dialog.
                </p>

                <div className="flex-1 overflow-y-auto p-6">
                    {error ? (
                        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700" role="alert">
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                            <div>{error}</div>
                        </div>
                    ) : null}

                    {loading ? (
                        <div className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-10 text-sm text-slate-600">
                            <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
                            Loading registration uploads...
                        </div>
                    ) : (
                        <>
                            <div className="mb-5 grid gap-3 sm:grid-cols-3">
                                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Registration status</div>
                                    <div className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${statusClass(draft?.status)}`}>{draft?.status || 'Unknown'}</div>
                                </div>
                                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Submitted</div>
                                    <div className="mt-2 text-sm font-semibold text-slate-800">{formatDate(draft?.submitted_at)}</div>
                                </div>
                                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Files available</div>
                                    <div className="mt-2 text-sm font-semibold text-slate-800">{uploads.length} total / {menuUploads.length} menu</div>
                                </div>
                            </div>

                            {draft?.materialization_error ? (
                                <div className="mb-5 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                                    <div className="font-semibold">Materialization error</div>
                                    <div className="mt-1">{draft.materialization_error}</div>
                                </div>
                            ) : null}

                            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <h3 className="text-base font-bold text-slate-900">Registration uploads</h3>
                                    <p className="mt-1 text-xs text-slate-500">Original files remain private and are available only to authorized platform administrators.</p>
                                </div>
                                <Button type="button" variant="outline" onClick={downloadArchive} disabled={!menuUploads.length || Boolean(downloadLoading)}>
                                    {downloadLoading === 'archive' ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <FileArchive className="mr-2 h-4 w-4" aria-hidden="true" />}
                                    Download menu ZIP
                                </Button>
                            </div>

                            {uploads.length === 0 ? (
                                <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-600">No active registration uploads were found.</div>
                            ) : (
                                <div className="overflow-x-auto rounded-lg border border-slate-200">
                                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                                        <caption className="sr-only">Submitted registration upload details</caption>
                                        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                                            <tr>
                                                <th className="px-4 py-3 font-semibold">File</th>
                                                <th className="px-4 py-3 font-semibold">Category</th>
                                                <th className="px-4 py-3 font-semibold">Status</th>
                                                <th className="px-4 py-3 font-semibold">Metadata</th>
                                                <th className="px-4 py-3 text-right font-semibold">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 bg-white">
                                            {uploads.map((upload) => (
                                                <tr key={upload.id}>
                                                    <td className="max-w-[240px] px-4 py-3">
                                                        <div className="truncate font-semibold text-slate-800" title={upload.original_name}>{upload.sanitized_name || upload.original_name}</div>
                                                        <div className="mt-1 text-xs text-slate-500">{upload.mime_type}</div>
                                                    </td>
                                                    <td className="px-4 py-3 text-slate-700">{upload.category.replace(/_/g, ' ')}</td>
                                                    <td className="px-4 py-3">
                                                        <div className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${statusClass(upload.upload_status)}`}>{upload.upload_status}</div>
                                                        {upload.extraction_status !== 'not_applicable' ? <div className="mt-1 text-xs text-slate-500">Extraction: {upload.extraction_status}</div> : null}
                                                    </td>
                                                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">
                                                        <div>{formatBytes(upload.file_size)}</div>
                                                        <div className="mt-1">{formatDate(upload.uploaded_at)}</div>
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        <Button type="button" variant="outline" size="sm" onClick={() => downloadUpload(upload)} disabled={Boolean(downloadLoading)}>
                                                            {downloadLoading === upload.id ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />}
                                                            Download
                                                        </Button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
                    <div className="text-xs text-slate-500">Administrative downloads are recorded in the audit trail.</div>
                    <div className="flex flex-wrap gap-2">
                        {isDraft && draft?.status === 'pending_review' ? (
                            <Button type="button" onClick={() => runDraftAction('approve')} disabled={Boolean(actionLoading) || loading} className="bg-emerald-600 text-white hover:bg-emerald-700">
                                {actionLoading === 'approve' ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="mr-2 h-4 w-4" aria-hidden="true" />}
                                Approve registration
                            </Button>
                        ) : null}
                        {isDraft && materializationFailed ? (
                            <Button type="button" onClick={() => runDraftAction('retry')} disabled={Boolean(actionLoading) || loading} variant="outline">
                                {actionLoading === 'retry' ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />}
                                Retry materialization
                            </Button>
                        ) : null}
                        <Button type="button" variant="outline" onClick={onClose} disabled={Boolean(actionLoading)}>Close</Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

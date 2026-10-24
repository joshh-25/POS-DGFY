import React, { useCallback, useEffect, useState } from 'react';
import { Download, Eye, FileArchive, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useOutletContext } from 'react-router-dom';
import { toast } from 'sonner';
import { normalizeApiError } from '../../../packages/web-core/src/utils/errorHandler.js';
import * as adminService from '@/services/adminService';
import RegistrationUploadsModal from './RegistrationUploadsModal.jsx';
import TenantActionDialog from '../src/features/admin/tenantDetail/TenantActionDialog.jsx';

const responseData = (response) => response?.data?.data || response?.data || response || {};
const fileNameFromResponse = (response, fallback) => response?.headers?.['content-disposition']?.match(/filename="([^"]+)"/i)?.[1] || fallback;
const toSnapshot = (value) => {
    if (value && typeof value === 'object') return value;
    if (typeof value !== 'string') return {};
    try { return JSON.parse(value); } catch { return {}; }
};
const firstValue = (source, ...keys) => keys.map((key) => source?.[key]).find((value) => value !== undefined && value !== null && value !== '');
const present = (value) => {
    if (value === undefined || value === null || value === '') return 'Not provided';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) return value.map((entry) => typeof entry === 'object' ? JSON.stringify(entry) : String(entry)).join(', ') || 'Not provided';
    return String(value);
};

function RegistrationSubmissionDetails({ snapshot }) {
    const submitted = toSnapshot(snapshot);
    const storefront = toSnapshot(firstValue(submitted, 'storefront_profile', 'storefrontProfile'));
    const location = toSnapshot(firstValue(submitted, 'location'));
    const hours = firstValue(submitted, 'hours', 'business_hours', 'businessHours');
    const hourSummary = Array.isArray(hours) ? hours.map((entry) => {
        const day = firstValue(entry, 'day', 'day_of_week', 'label');
        if (entry?.closed) return `${day || 'Day'}: Closed`;
        const open = firstValue(entry, 'open', 'opening', 'opens_at');
        const close = firstValue(entry, 'close', 'closing', 'closes_at');
        return day && open && close ? `${day}: ${open}–${close}` : present(entry);
    }).join('\n') : present(hours);
    const address = [
        firstValue(location, 'address_line', 'addressLine', 'address'),
        firstValue(location, 'barangay'),
        firstValue(location, 'city'),
        firstValue(location, 'province'),
        firstValue(location, 'postal_code', 'postalCode')
    ].filter(Boolean).join(', ');
    const fields = [
        ['Company name', firstValue(submitted, 'company_name', 'companyName', 'name')],
        ['Business type', firstValue(submitted, 'business_type', 'businessType')],
        ['Industry', firstValue(submitted, 'registration_industry', 'industry_tag', 'industry_key', 'industryKey', 'industry')],
        ['Public phone', firstValue(storefront, 'phone', 'public_phone', 'publicPhone')],
        ['Public email', firstValue(storefront, 'email', 'public_email', 'publicEmail')],
        ['Website', firstValue(storefront, 'website')],
        ['Storefront description', firstValue(storefront, 'description')],
        ['Delivery partners', firstValue(submitted, 'delivery_partners', 'deliveryPartners')],
        ['Location name', firstValue(location, 'name', 'location_name', 'locationName')],
        ['Address', address],
        ['Coordinates', [firstValue(location, 'latitude'), firstValue(location, 'longitude')].filter(Boolean).join(', ')],
        ['Business hours', hourSummary]
    ];

    return <section aria-labelledby="registration-submitted-details-title"><h3 id="registration-submitted-details-title" className="font-semibold text-slate-900">Submitted details</h3><dl className="mt-3 grid gap-3 sm:grid-cols-2">{fields.map(([label, value]) => <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-3"><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">{present(value)}</dd></div>)}</dl></section>;
}

function RegistrationLegalEvidence({ snapshot }) {
    const legal = toSnapshot(snapshot);
    const acknowledgementText = firstValue(legal, 'acknowledgement_text', 'acknowledgementText');
    const agreementStatus = (value) => value === true ? 'Accepted' : value === false ? 'Not accepted' : 'Not recorded';
    const fields = [
        ['Company Registration Terms', agreementStatus(firstValue(legal, 'accepted_company_terms', 'acceptedCompanyTerms'))],
        ['Marketplace Provider Terms', agreementStatus(firstValue(legal, 'accepted_marketplace_terms', 'acceptedMarketplaceTerms'))],
        ['Company terms version', firstValue(legal, 'company_terms_version', 'companyTermsVersion')],
        ['Marketplace terms version', firstValue(legal, 'marketplace_terms_version', 'marketplaceTermsVersion')]
    ];
    return <section aria-labelledby="registration-legal-evidence-title"><h3 id="registration-legal-evidence-title" className="font-semibold text-slate-900">Legal evidence</h3><p className="mt-1 text-sm text-slate-600">Recorded agreement states and acknowledgement evidence are shown when available.</p><dl className="mt-3 grid gap-3 sm:grid-cols-2">{fields.map(([label, value]) => <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-3"><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 text-sm text-slate-800">{present(value)}</dd></div>)}</dl>{acknowledgementText ? <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3"><summary className="cursor-pointer text-sm font-medium text-slate-700">View recorded acknowledgement text</summary><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{acknowledgementText}</p></details> : null}{firstValue(legal, 'acknowledgement_hash', 'acknowledgementHash') ? <p className="mt-3 break-all text-xs text-slate-500">Evidence hash: <code>{firstValue(legal, 'acknowledgement_hash', 'acknowledgementHash')}</code></p> : null}</section>;
}

const uploadKindLabel = (kind) => ({ menu: 'Menu or catalog', business_permit: 'Business permit', government_id: 'Government ID', logo: 'Store logo' }[kind] || String(kind || 'File').replace(/_/g, ' '));
const REGISTRATION_STATUS_LABELS = {
    pending: 'Pending review', approved: 'Approved', rejected: 'Rejected', not_started: 'Not started',
    in_progress: 'In progress', succeeded: 'Completed', failed: 'Failed', queued: 'Queued for processing',
    completed: 'Completed', not_applicable: 'Not applicable', revoked: 'Access revoked'
};
const formatRegistrationStatus = (value) => {
    const raw = String(value ?? '').trim();
    if (!raw) return 'Not available';
    const normalized = raw.toLowerCase();
    return REGISTRATION_STATUS_LABELS[normalized] || raw.replace(/[_-]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
};
const saveBlob = (response, fallback) => {
    if (!response?.data) throw new Error('The download was empty.');
    const url = URL.createObjectURL(response.data);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileNameFromResponse(response, fallback);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export default function TenantRegistration() {
    const { tenant, isArchived } = useOutletContext();
    const [review, setReview] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [actionId, setActionId] = useState('');
    const [revokeTarget, setRevokeTarget] = useState(null);
    const [revokeReason, setRevokeReason] = useState('');
    const [revokeError, setRevokeError] = useState('');
    const [showDraftUploads, setShowDraftUploads] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const response = await adminService.getTenantRegistration(tenant.id);
            setReview(responseData(response));
        } catch (requestError) {
            const normalized = normalizeApiError(requestError);
            setError(normalized.message || 'Registration evidence could not be loaded.');
        } finally {
            setLoading(false);
        }
    }, [tenant.id]);

    useEffect(() => { void load(); }, [load]);

    const download = async (upload) => {
        setActionId(`download:${upload.id}`);
        try {
            const response = await adminService.downloadTenantRegistrationUpload(tenant.id, upload.id);
            saveBlob(response, upload.original_filename || 'registration-file');
        } catch (requestError) {
            const normalized = normalizeApiError(requestError);
            toast.error(normalized.message || 'The registration file could not be downloaded.');
        } finally {
            setActionId('');
        }
    };

    const preview = async (upload) => {
        const previewWindow = window.open('about:blank', '_blank');
        if (!previewWindow) {
            toast.error('The private preview was blocked. Allow popups and retry.');
            return;
        }
        setActionId(`preview:${upload.id}`);
        try {
            const response = await adminService.downloadTenantRegistrationUpload(tenant.id, upload.id);
            if (!response?.data) throw new Error('The preview file was empty.');
            const objectUrl = URL.createObjectURL(response.data);
            previewWindow.opener = null;
            previewWindow.location.href = objectUrl;
            window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
        } catch (requestError) {
            previewWindow.close();
            const normalized = normalizeApiError(requestError);
            toast.error(normalized.message || 'The private preview could not be opened.');
        } finally {
            setActionId('');
        }
    };

    const downloadAll = async () => {
        setActionId('archive');
        try {
            const response = await adminService.downloadCompanyRegistrationMenuArchive({ tenantId: tenant.id });
            saveBlob(response, 'registration-menu-originals.zip');
        } catch (requestError) {
            const normalized = normalizeApiError(requestError);
            toast.error(normalized.message || 'The menu archive could not be downloaded.');
        } finally {
            setActionId('');
        }
    };

    const submitRevoke = async () => {
        if (!revokeTarget || isArchived) return;
        setActionId(`revoke:${revokeTarget.id}`);
        setRevokeError('');
        try {
            await adminService.revokeTenantRegistrationUpload(tenant.id, revokeTarget.id, revokeReason.trim());
            setRevokeTarget(null);
            setRevokeReason('');
            await load();
            toast.success('Registration upload access revoked.');
        } catch (requestError) {
            const normalized = normalizeApiError(requestError);
            setRevokeError(normalized.message || 'The registration upload could not be revoked.');
        } finally {
            setActionId('');
        }
    };

    const uploads = Array.isArray(review?.uploads) ? review.uploads : [];
    const events = Array.isArray(review?.events) ? review.events : [];
    const attempts = Array.isArray(review?.attempts) ? review.attempts : [];

    return (
        <section className="space-y-5" aria-labelledby="tenant-registration-title">
            <header className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 id="tenant-registration-title" className="text-xl font-semibold text-slate-900">Registration</h2>
                <p className="mt-1 text-sm text-slate-600">Submitted registration evidence, private files, download history, and upload access revocation.</p>
            </header>
            {error ? <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"><span>{error}</span><Button type="button" variant="outline" onClick={() => void load()}>Retry</Button></div> : null}
            {loading ? <p role="status" className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600"><RefreshCw className="h-4 w-4 animate-spin" />Loading registration record…</p> : review ? (
                <>
                    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                        <h3 className="font-semibold text-slate-900">Review record</h3>
                        <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <div><dt className="text-xs uppercase tracking-wide text-slate-500">Company</dt><dd className="mt-1 text-sm font-medium">{review.company_name || tenant.name}</dd></div>
                            <div><dt className="text-xs uppercase tracking-wide text-slate-500">Review status</dt><dd className="mt-1 text-sm font-medium">{formatRegistrationStatus(review.review_status)}</dd></div>
                            <div><dt className="text-xs uppercase tracking-wide text-slate-500">Provisioning</dt><dd className="mt-1 text-sm font-medium">{formatRegistrationStatus(review.provisioning_status)}</dd></div>
                            <div><dt className="text-xs uppercase tracking-wide text-slate-500">Attempt</dt><dd className="mt-1 text-sm font-medium">{review.current_attempt_no ?? 'Not available'}</dd></div>
                        </dl>
                        {review.submission_snapshot ? <div className="mt-5"><RegistrationSubmissionDetails snapshot={review.submission_snapshot} /></div> : null}
                        {review.legal_terms_snapshot ? <div className="mt-5"><RegistrationLegalEvidence snapshot={review.legal_terms_snapshot} /></div> : null}
                    </article>
                    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div><h3 className="font-semibold text-slate-900">Private registration uploads</h3><p className="mt-1 text-sm text-slate-600">Original files remain private. Authorized downloads are recorded in the audit trail.</p></div>
                            {uploads.some((upload) => upload.asset_kind === 'menu') ? <Button type="button" variant="outline" onClick={() => void downloadAll()} disabled={Boolean(actionId)}><FileArchive className="mr-2 h-4 w-4" />Download menu ZIP</Button> : null}
                        </div>
                        {isArchived ? <p className="mt-3 rounded-md bg-slate-100 p-3 text-sm text-slate-600">Archived tenant registration evidence is read-only.</p> : null}
                        <div className="mt-4 space-y-3">
                            {uploads.map((upload) => (
                                <div key={upload.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-slate-200 p-3">
                                    <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium text-slate-900">{upload.original_filename || 'Unnamed file'}</p><p className="mt-1 text-xs text-slate-500">{uploadKindLabel(upload.asset_kind)} · {upload.mime_type || 'Type unavailable'} · {formatRegistrationStatus(upload.review_status)} · {formatRegistrationStatus(upload.extraction_status)}</p>{upload.revoked_at || upload.purged_at ? <p className="mt-1 text-xs text-slate-500">File unavailable{upload.revoked_at ? ` · revoked ${new Date(upload.revoked_at).toLocaleString()}` : ''}</p> : null}</div>
                                    <div className="flex flex-wrap gap-2">
                                        <Button type="button" size="sm" variant="outline" onClick={() => void preview(upload)} disabled={Boolean(actionId) || Boolean(upload.revoked_at || upload.purged_at)}><Eye className="mr-1 h-4 w-4" />Preview</Button>
                                        <Button type="button" size="sm" variant="outline" onClick={() => void download(upload)} disabled={Boolean(actionId) || Boolean(upload.revoked_at || upload.purged_at)}><Download className="mr-1 h-4 w-4" />Download</Button>
                                        <Button type="button" size="sm" variant="outline" className="border-red-200 text-red-700" onClick={() => { setRevokeTarget(upload); setRevokeReason(''); setRevokeError(''); }} disabled={Boolean(actionId) || isArchived || Boolean(upload.revoked_at || upload.purged_at)}>Revoke</Button>
                                    </div>
                                </div>
                            ))}
                            {!uploads.length ? <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-600">No registration uploads are available.</p> : null}
                        </div>
                    </article>
                    {(events.length || attempts.length) ? <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="font-semibold text-slate-900">Registration history</h3><div className="mt-3 space-y-2">{events.map((event, index) => <div key={event.id || `${event.event_type}-${index}`} className="rounded-md border border-slate-100 bg-slate-50 p-3 text-sm"><strong>{event.event_type || event.type || 'Registration event'}</strong><span className="ml-2 text-xs text-slate-500">{event.created_at ? new Date(event.created_at).toLocaleString() : ''}</span>{event.details ? <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-slate-600">{JSON.stringify(event.details, null, 2)}</pre> : null}</div>)}{attempts.map((attempt, index) => <div key={attempt.id || `attempt-${index}`} className="rounded-md border border-slate-100 p-3 text-sm">Attempt {attempt.attempt_no || index + 1} · {attempt.status || 'Recorded'}{attempt.created_at ? ` · ${new Date(attempt.created_at).toLocaleString()}` : ''}</div>)}</div></article> : null}
                    {tenant.registration_draft_id ? <article className="rounded-xl border border-blue-200 bg-blue-50/50 p-5"><h3 className="font-semibold text-slate-900">Submitted Storefront registration files</h3><p className="mt-1 text-sm text-slate-600">Open the materialized registration record for the original files and menu archive.</p><Button type="button" variant="outline" className="mt-3" onClick={() => setShowDraftUploads(true)}>Open Storefront files</Button></article> : null}
                </>
            ) : <p className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">No registration review record is available for this tenant.</p>}
            <TenantActionDialog
                open={Boolean(revokeTarget)}
                onOpenChange={(open) => { if (!open && !actionId) { setRevokeTarget(null); setRevokeError(''); } }}
                title="Revoke registration upload access?"
                description="The original file will be removed from available registration evidence. A revocation event will be recorded. A reason is optional."
                submitLabel="Revoke upload"
                onSubmit={submitRevoke}
                submitting={actionId.startsWith('revoke:')}
                destructive
            >
                {revokeError ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{revokeError}</p> : null}
                <Label htmlFor="registration-revoke-reason">Reason (optional)</Label>
                <Textarea id="registration-revoke-reason" value={revokeReason} onChange={(event) => setRevokeReason(event.target.value)} rows={3} maxLength={500} />
                {revokeTarget ? <p className="text-xs text-slate-500">File: {revokeTarget.original_filename || revokeTarget.id}</p> : null}
            </TenantActionDialog>
            {showDraftUploads ? <RegistrationUploadsModal subject={{ type: 'tenant', id: tenant.id, name: tenant.name, company_name: tenant.name, registration_draft_id: tenant.registration_draft_id }} onClose={() => setShowDraftUploads(false)} /> : null}
        </section>
    );
}

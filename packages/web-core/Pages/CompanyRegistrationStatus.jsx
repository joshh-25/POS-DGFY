import React, { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import api from '../src/services/api.js';
import { dgfyAuthHeader, fetchDgfyLegalTerms, getStoredDgfyToken, startDgfyTenantSession } from '../src/services/dgfyAuthService.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { WORKFLOW_MODE_SELECT_VALUES } from '../src/features/settings/workflowMode.js';

const COPY = { pending_review: ['Waiting for approval', 'Your company registration is waiting for Platform Admin approval.'], setting_up_company: ['Setting up your company', 'Your registration was approved and your company is being set up.'], ready: ['Your company is ready', 'Your company is ready. Select Continue when you are ready to open it.'], setup_delayed: ['Setup delayed', 'Your registration is approved, but setup needs a retry. A Platform Admin has been notified.'], rejected: ['Registration needs changes', 'Review the reason below, then correct and resubmit your registration.'] };
const UPLOAD_KINDS = [['menu', 'Menu or catalog'], ['profile', 'Profile image'], ['cover', 'Cover image'], ['gallery', 'Gallery image']];

export default function CompanyRegistrationStatus() {
    const { applicationId } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [resubmitting, setResubmitting] = useState(false);
    const [uploading, setUploading] = useState({});
    const [editingRejected, setEditingRejected] = useState(false);
    const [legalTerms, setLegalTerms] = useState(null);
    const [resubmitForm, setResubmitForm] = useState({ name: '', workflowMode: '', industryTag: '', acceptedCompanyTerms: false, acceptedMarketplaceTerms: false });

    const load = useCallback(async () => {
        setLoading(true); setError('');
        try {
            const response = await api.get(`/dgfy/company-registration/${encodeURIComponent(applicationId)}`, { withCredentials: true, skipTenantAuthHeaders: true, headers: dgfyAuthHeader(getStoredDgfyToken()) });
            const next = response.data?.data || null;
            setData(next);
            if (next?.editable_submission) setResubmitForm((current) => ({ ...current, name: next.editable_submission.company_name || '', workflowMode: next.editable_submission.workflow_mode || '', industryTag: next.editable_submission.industry_tag || '' }));
        } catch (err) { setError(err.response?.data?.message || 'Unable to load this registration status. Sign in with the DGFY account that submitted it.'); }
        finally { setLoading(false); }
    }, [applicationId]);

    useEffect(() => { void load(); }, [load]);
    useEffect(() => { let active = true; fetchDgfyLegalTerms().then((terms) => { if (active) setLegalTerms(terms); }).catch(() => { if (active) setLegalTerms(null); }); return () => { active = false; }; }, []);

    const resubmit = async () => {
        setResubmitting(true); setError('');
        try {
            const snapshot = legalTerms?.flows?.company_registration?.snapshot || {};
            const registrationSnapshot = data?.registration_snapshot || data?.editable_submission || {};
            await api.post(`/dgfy/company-registration/${encodeURIComponent(applicationId)}/resubmit`, { registration_snapshot: registrationSnapshot, name: resubmitForm.name, workflowMode: resubmitForm.workflowMode, industryTag: resubmitForm.industryTag, accepted_company_terms: resubmitForm.acceptedCompanyTerms, accepted_marketplace_terms: resubmitForm.acceptedMarketplaceTerms, company_terms_version: snapshot.company_terms_version, marketplace_terms_version: snapshot.marketplace_terms_version }, { withCredentials: true, skipTenantAuthHeaders: true, headers: dgfyAuthHeader(getStoredDgfyToken()) });
            setEditingRejected(false); await load();
        } catch (err) { setError(err.response?.data?.message || 'Unable to resubmit this registration.'); }
        finally { setResubmitting(false); }
    };

    const upload = async (kind, file) => {
        if (!file) return;
        setUploading((current) => ({ ...current, [kind]: true })); setError('');
        try {
            const formData = new FormData(); formData.append('file', file);
            await api.post(`/dgfy/company-registration/${encodeURIComponent(applicationId)}/uploads/${kind}`, formData, { withCredentials: true, skipTenantAuthHeaders: true, headers: dgfyAuthHeader(getStoredDgfyToken()) });
            await load();
        } catch (err) { setError(err.response?.data?.message || `Unable to upload the ${kind} file.`); }
        finally { setUploading((current) => ({ ...current, [kind]: false })); }
    };

    const continueToCompany = async () => {
        if (!data?.tenant_id) return;
        setError(''); setResubmitting(true);
        try { await startDgfyTenantSession({ tenantId: data.tenant_id }); navigate('/'); }
        catch (err) { setError(err.response?.data?.message || 'Your company is ready, but the secure session could not be started.'); }
        finally { setResubmitting(false); }
    };

    if (loading) return <main className="mx-auto max-w-xl p-8">Loading registration status…</main>;
    if (error && !data) return <main className="mx-auto max-w-xl p-8 text-red-700">{error}</main>;
    const [title, body] = COPY[data?.status] || COPY.pending_review;
    const canUpload = ['pending_review', 'rejected', 'setup_delayed'].includes(data?.status);
    return <main className="mx-auto max-w-2xl p-6 sm:p-10"><section className="rounded-2xl border bg-white p-6 shadow-sm"><p className="text-sm font-medium text-slate-500">DGFY company registration</p><h1 className="mt-2 text-2xl font-bold text-slate-900">{title}</h1><p className="mt-3 text-slate-600">{body}</p>{location.state?.uploadWarning ? <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{location.state.uploadWarning}</div> : null}{error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}<dl className="mt-6 space-y-2 rounded-xl bg-slate-50 p-4 text-sm"><div><dt className="text-slate-500">Company</dt><dd className="font-medium">{data?.company_name}</dd></div><div><dt className="text-slate-500">Registration email</dt><dd>{data?.registration_email_masked}</dd></div><div><dt className="text-slate-500">Provisioning</dt><dd>{data?.provisioning_status}</dd></div></dl>{data?.rejection_reason ? <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>Reason:</strong> {data.rejection_reason}</div> : null}
        {canUpload ? <section aria-labelledby="registration-upload-title" className="mt-6 space-y-3"><div><h2 id="registration-upload-title" className="font-semibold text-slate-900">Optional registration uploads</h2><p className="text-xs text-slate-600">Files are private, signature checked, and available only to authorized reviewers.</p></div>{UPLOAD_KINDS.map(([kind, label]) => <div key={kind} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"><div><p className="text-sm font-medium">{label}</p><p className="text-xs text-slate-500">{(data?.uploads || []).filter((uploadItem) => uploadItem.asset_kind === kind).map((uploadItem) => `${uploadItem.original_filename} · ${uploadItem.review_status}`).join(', ') || 'Not uploaded'}</p></div><label className="cursor-pointer rounded-lg border px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><span>{uploading[kind] ? 'Uploading…' : 'Choose file'}</span><input className="sr-only" type="file" accept={kind === 'menu' ? '.csv,.pdf,.jpg,.jpeg,.png' : '.jpg,.jpeg,.png'} disabled={uploading[kind]} onChange={(event) => { void upload(kind, event.target.files?.[0]); event.target.value = ''; }} /></label></div>)}</section> : null}
        {data?.status === 'rejected' && editingRejected ? <form onSubmit={(event) => { event.preventDefault(); void resubmit(); }} className="mt-5 space-y-3 rounded-xl border bg-slate-50 p-4"><h2 className="font-semibold text-slate-900">Correct and resubmit</h2><Input required value={resubmitForm.name} onChange={(event) => setResubmitForm({ ...resubmitForm, name: event.target.value })} placeholder="Company name" /><select required className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={resubmitForm.workflowMode} onChange={(event) => setResubmitForm({ ...resubmitForm, workflowMode: event.target.value })}><option value="">Select business industry</option>{WORKFLOW_MODE_SELECT_VALUES.map((mode) => <option key={mode} value={mode}>{mode.replace(/_/g, ' ')}</option>)}</select><Input value={resubmitForm.industryTag} onChange={(event) => setResubmitForm({ ...resubmitForm, industryTag: event.target.value })} placeholder="Optional industry detail" /><label className="flex gap-2 text-sm text-slate-700"><input required type="checkbox" checked={resubmitForm.acceptedCompanyTerms} onChange={(event) => setResubmitForm({ ...resubmitForm, acceptedCompanyTerms: event.target.checked })} disabled={!legalTerms} /><span>I accept the current DGFY Company Registration Terms.</span></label><label className="flex gap-2 text-sm text-slate-700"><input required type="checkbox" checked={resubmitForm.acceptedMarketplaceTerms} onChange={(event) => setResubmitForm({ ...resubmitForm, acceptedMarketplaceTerms: event.target.checked })} disabled={!legalTerms} /><span>I accept the current DGFY Marketplace Provider Terms.</span></label><div className="flex gap-2"><Button disabled={resubmitting || !legalTerms || !resubmitForm.acceptedCompanyTerms || !resubmitForm.acceptedMarketplaceTerms} type="submit">{resubmitting ? 'Resubmitting…' : 'Resubmit for review'}</Button><Button type="button" variant="outline" onClick={() => setEditingRejected(false)}>Cancel</Button></div></form> : null}<div className="mt-6 flex flex-wrap gap-3"><Button type="button" variant="outline" onClick={() => void load()}>Refresh</Button>{data?.status === 'rejected' && !editingRejected ? <Button type="button" onClick={() => setEditingRejected(true)}>Edit and resubmit</Button> : null}{data?.status === 'ready' ? <Button type="button" onClick={() => void continueToCompany()} disabled={resubmitting}>{resubmitting ? 'Opening…' : 'Continue to company'}</Button> : null}<Button asChild variant="link"><Link to="/dgfy/account">DGFY Account</Link></Button></div></section></main>;
}

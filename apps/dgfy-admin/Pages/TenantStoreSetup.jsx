import React, { useCallback, useEffect, useState } from 'react';
import { Globe2, LayoutTemplate, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useOutletContext } from 'react-router-dom';
import { toast } from 'sonner';
import { WORKFLOW_MODE_LABELS } from '../../../packages/web-core/src/features/settings/workflowMode.js';
import { normalizeApiError } from '../../../packages/web-core/src/utils/errorHandler.js';
import * as adminService from '@/services/adminService';
import StorefrontCustomDomainsModal from '../src/features/admin/components/StorefrontCustomDomainsModal.jsx';
import TenantActionDialog from '../src/features/admin/tenantDetail/TenantActionDialog.jsx';

const SOFTWARE_FIELDS = [
    { key: 'pos_software_name', label: 'Software name', placeholder: 'DGFY POS' },
    { key: 'pos_software_version', label: 'Software version', placeholder: 'Installed version' },
    { key: 'pos_software_serial_number', label: 'Software serial number', placeholder: 'Software/license serial' }
];
const RECEIPT_LABELS = {
    pos_registered_name: 'Registered name', pos_business_name: 'Business name', pos_business_style: 'Business style',
    pos_taxpayer_type: 'Taxpayer type', pos_tin_branch: 'TIN / branch', pos_address: 'Business address',
    pos_ptu_number: 'PTU number', pos_min_number: 'MIN number', pos_accreditation_number: 'Accreditation number',
    pos_fiscal_buyer_details_required: 'Fiscal buyer details required', pos_receipt_footer_message: 'Receipt footer message'
};
const displayValue = (value) => typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value ?? '').trim() || '—';

export default function TenantStoreSetup() {
    const { tenant, adminProfile, refreshTenant, isArchived } = useOutletContext();
    const isMaster = Boolean(adminProfile?.is_master);
    const effectivePlan = tenant.effective_plan || ((tenant.status === 'active' || tenant.status === 'pending') ? 'premium' : tenant.plan);
    const [metadata, setMetadata] = useState(null);
    const [auditLogs, setAuditLogs] = useState([]);
    const [metadataLoading, setMetadataLoading] = useState(true);
    const [metadataError, setMetadataError] = useState('');
    const [metadataReason, setMetadataReason] = useState('');
    const [softwareForm, setSoftwareForm] = useState({ pos_software_name: '', pos_software_version: '', pos_software_serial_number: '' });
    const [metadataSaving, setMetadataSaving] = useState('');
    const [templates, setTemplates] = useState([]);
    const [templateError, setTemplateError] = useState('');
    const [templateLoading, setTemplateLoading] = useState(false);
    const [selectedTemplateKey, setSelectedTemplateKey] = useState('');
    const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
    const [templateReason, setTemplateReason] = useState('');
    const [templateActionError, setTemplateActionError] = useState('');
    const [templateApplying, setTemplateApplying] = useState(false);
    const [domainsOpen, setDomainsOpen] = useState(false);

    const loadMetadata = useCallback(async () => {
        setMetadataLoading(true);
        setMetadataError('');
        const [metadataResult, auditResult] = await Promise.allSettled([
            adminService.getTenantPosMetadata(tenant.id),
            adminService.listTenantPosMetadataAuditLogs(tenant.id, { limit: 20 })
        ]);
        if (metadataResult.status === 'fulfilled') {
            const next = metadataResult.value?.data || {};
            setMetadata(next);
            setSoftwareForm({
                pos_software_name: next.current?.pos_software_name || '',
                pos_software_version: next.current?.pos_software_version || '',
                pos_software_serial_number: next.current?.pos_software_serial_number || ''
            });
        } else {
            setMetadataError(normalizeApiError(metadataResult.reason).message || 'POS metadata could not be loaded.');
        }
        if (auditResult.status === 'fulfilled') setAuditLogs(auditResult.value?.data?.logs || []);
        else setMetadataError((current) => [current, `Audit history: ${normalizeApiError(auditResult.reason).message}`].filter(Boolean).join(' '));
        setMetadataLoading(false);
    }, [tenant.id]);

    useEffect(() => { void loadMetadata(); }, [loadMetadata]);

    useEffect(() => {
        let cancelled = false;
        if (!isMaster) {
            setTemplateError('The published Store Template catalog is Platform Master only. No catalog request was made.');
            return () => { cancelled = true; };
        }
        setTemplateLoading(true);
        adminService.listStoreTemplates({ status: 'published' })
            .then((response) => { if (!cancelled) setTemplates(response?.data?.templates || []); })
            .catch((error) => { if (!cancelled) setTemplateError(normalizeApiError(error).message || 'Store Templates could not be loaded.'); })
            .finally(() => { if (!cancelled) setTemplateLoading(false); });
        return () => { cancelled = true; };
    }, [isMaster]);

    const saveSoftwareIdentity = async () => {
        const reason = metadataReason.trim();
        if (isArchived || reason.length < 3) return;
        setMetadataSaving('software');
        setMetadataError('');
        try {
            await adminService.updateTenantPosMetadata(tenant.id, { software_settings: softwareForm, reason });
            setMetadataReason('');
            await loadMetadata();
            toast.success('DGFY POS software identity updated.');
        } catch (error) {
            setMetadataError(normalizeApiError(error).message || 'POS software identity update failed.');
        } finally {
            setMetadataSaving('');
        }
    };

    const reviewPendingMetadata = async (action) => {
        const reason = metadataReason.trim();
        if (isArchived || !metadata?.pending_review || reason.length < 3) return;
        setMetadataSaving(action);
        setMetadataError('');
        try {
            await adminService.updateTenantPosMetadata(tenant.id, { pending_action: action, reason });
            setMetadataReason('');
            await loadMetadata();
            toast.success(action === 'approve' ? 'Receipt metadata changes approved.' : 'Receipt metadata changes rejected.');
        } catch (error) {
            setMetadataError(normalizeApiError(error).message || `POS metadata ${action} failed.`);
        } finally {
            setMetadataSaving('');
        }
    };

    const applyTemplate = async () => {
        const template = templates.find((entry) => entry.template_key === selectedTemplateKey);
        const reason = templateReason.trim();
        if (!isMaster || !template || isArchived || reason.length < 3) return;
        setTemplateApplying(true);
        setTemplateActionError('');
        try {
            await adminService.applyTenantTemplate(tenant.id, { templateKey: template.template_key, reason });
            setTemplateDialogOpen(false);
            setTemplateReason('');
            const refreshed = await refreshTenant(tenant.id);
            if (!refreshed) setTemplateActionError('Template application was accepted, but tenant details could not be refreshed.');
            toast.success('Store Template applied.');
        } catch (error) {
            setTemplateActionError(normalizeApiError(error).message || 'Store Template application failed.');
        } finally {
            setTemplateApplying(false);
        }
    };

    const selectedTemplate = templates.find((entry) => entry.template_key === selectedTemplateKey);

    return (
        <section className="space-y-5" aria-labelledby="tenant-store-setup-title">
            <header className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div><h2 id="tenant-store-setup-title" className="text-xl font-semibold text-slate-900">Store setup</h2><p className="mt-1 text-sm text-slate-600">Store Templates, POS metadata, and verified Storefront domains.</p></div>
                <Button type="button" variant="outline" onClick={() => setDomainsOpen(true)} disabled={isArchived || tenant.status !== 'active' || effectivePlan !== 'premium'}><Globe2 className="mr-2 h-4 w-4" />Manage domains</Button>
            </header>
            {isArchived ? <p className="rounded-lg bg-slate-100 p-3 text-sm text-slate-600">Archived store setup records are read-only.</p> : null}
            <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="flex items-center gap-2 font-semibold text-slate-900"><LayoutTemplate className="h-4 w-4" />Apply Store Template</h3><p className="mt-1 text-sm text-slate-600">Template curation remains in the global master-only tool. Applying a published template retains its existing reason and audit behavior.</p></div></div>
                {!isMaster ? <p role="note" className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{templateError}</p> : templateError ? <p role="alert" className="mt-3 text-sm text-red-700">{templateError}</p> : null}
                {isMaster ? <div className="mt-4 flex flex-wrap gap-2"><select aria-label="Published Store Template" className="h-10 min-w-64 rounded-md border border-slate-300 bg-white px-3 text-sm" value={selectedTemplateKey} onChange={(event) => setSelectedTemplateKey(event.target.value)} disabled={templateLoading || isArchived}><option value="">Select a published template…</option>{templates.map((template) => <option key={template.template_key} value={template.template_key}>{template.label} ({WORKFLOW_MODE_LABELS[template.base_mode] || template.base_mode})</option>)}</select><Button type="button" onClick={() => { setTemplateActionError(''); setTemplateReason(''); setTemplateDialogOpen(true); }} disabled={!selectedTemplate || templateLoading || isArchived}>{templateLoading ? 'Loading…' : 'Review application'}</Button></div> : null}
                {templateActionError ? <p role="alert" className="mt-3 text-sm text-red-700">{templateActionError}</p> : null}
            </article>
            <article className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div><h3 className="font-semibold text-slate-900">POS metadata</h3><p className="mt-1 text-sm text-slate-600">Software identity is configured by Platform Admin. Tenant receipt metadata changes require review.</p></div>
                {metadataError ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{metadataError}</p> : null}
                {metadataLoading ? <p role="status" className="flex items-center gap-2 text-sm text-slate-600"><RefreshCw className="h-4 w-4 animate-spin" />Loading POS metadata…</p> : metadata ? <>
                    <section className="rounded-lg border border-slate-200 bg-slate-50 p-4"><h4 className="text-sm font-semibold text-slate-900">DGFY POS software identity</h4><div className="mt-3 grid gap-3 md:grid-cols-3">{SOFTWARE_FIELDS.map((field) => <label key={field.key} className="space-y-1 text-sm"><span className="font-medium text-slate-700">{field.label}</span><Input value={softwareForm[field.key]} onChange={(event) => setSoftwareForm((current) => ({ ...current, [field.key]: event.target.value }))} placeholder={field.placeholder} disabled={isArchived || Boolean(metadataSaving)} /></label>)}</div><Button type="button" className="mt-3" onClick={() => void saveSoftwareIdentity()} disabled={isArchived || Boolean(metadataSaving) || metadataReason.trim().length < 3}>{metadataSaving === 'software' ? 'Saving…' : 'Save software identity'}</Button></section>
                    <section className="rounded-lg border border-slate-200 p-4"><div className="flex flex-wrap justify-between gap-2"><div><h4 className="text-sm font-semibold text-slate-900">Tenant receipt metadata review</h4><p className="mt-1 text-xs text-slate-500">Changes take effect only after platform approval.</p></div><span className="text-xs text-slate-500">{metadata.pending_review ? `Requested ${metadata.pending_review.requested_at ? new Date(metadata.pending_review.requested_at).toLocaleString() : 'recently'} by ${metadata.pending_review.requested_by || 'tenant admin'}` : 'No pending changes'}</span></div>{metadata.pending_review ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{Object.entries(metadata.pending_review.changes || {}).map(([key, value]) => <div key={key} className="rounded-md bg-slate-50 p-3 text-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{RECEIPT_LABELS[key] || key}</p><p className="mt-2 text-xs text-slate-500">Current: {displayValue(metadata.current?.[key])}</p><p className="text-sm font-medium text-slate-900">Requested: {displayValue(value)}</p></div>)}</div> : null}<div className="mt-3 flex flex-wrap gap-2"><Button type="button" variant="outline" className="border-red-200 text-red-700" onClick={() => void reviewPendingMetadata('reject')} disabled={isArchived || !metadata.pending_review || Boolean(metadataSaving) || metadataReason.trim().length < 3}>{metadataSaving === 'reject' ? 'Rejecting…' : 'Reject pending changes'}</Button><Button type="button" onClick={() => void reviewPendingMetadata('approve')} disabled={isArchived || !metadata.pending_review || Boolean(metadataSaving) || metadataReason.trim().length < 3}>{metadataSaving === 'approve' ? 'Approving…' : 'Approve pending changes'}</Button></div></section>
                    <div className="space-y-1"><Label htmlFor="pos-metadata-reason">Audit reason</Label><Textarea id="pos-metadata-reason" value={metadataReason} onChange={(event) => setMetadataReason(event.target.value)} rows={3} maxLength={500} disabled={isArchived || Boolean(metadataSaving)} placeholder="State the software identity update or metadata review reason."/><p className="text-xs text-slate-500">At least 3 characters are required.</p></div>
                </> : <div className="flex items-center gap-3"><p className="text-sm text-slate-600">No POS metadata response is available.</p><Button type="button" variant="outline" onClick={() => void loadMetadata()}>Retry</Button></div>}
            </article>
            <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="font-semibold text-slate-900">POS metadata audit history</h3><div className="mt-3 space-y-2">{auditLogs.map((log, index) => <div key={log.id || `${log.created_at}-${index}`} className="rounded-md border border-slate-100 bg-slate-50 p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><span className="font-medium text-slate-800">{log.actor_username || 'platform_admin'} · {log.metadata?.pending_action || (log.metadata?.software_keys?.length ? 'software identity' : 'metadata update')}</span><span className="text-xs text-slate-500">{log.created_at ? new Date(log.created_at).toLocaleString() : 'No timestamp'}</span></div><p className="mt-1 text-sm text-slate-600">{log.reason || 'No reason recorded'}</p></div>)}{!auditLogs.length && !metadataLoading ? <p className="text-sm text-slate-600">No POS metadata audit records are available.</p> : null}</div></article>
            <TenantActionDialog open={templateDialogOpen} onOpenChange={(open) => { if (!templateApplying) { setTemplateDialogOpen(open); setTemplateActionError(''); } }} title={`Apply ${selectedTemplate?.label || 'Store Template'}?`} description="This applies the published template through the existing audited tenant endpoint." submitLabel="Apply template" onSubmit={applyTemplate} submitting={templateApplying} submitDisabled={!isMaster || !selectedTemplate || templateReason.trim().length < 3 || isArchived}>
                {templateActionError ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{templateActionError}</p> : null}<p className="text-sm text-slate-700">Tenant: <strong>{tenant.name}</strong></p><p className="text-sm text-slate-700">Template: <strong>{selectedTemplate?.label || 'Unavailable'}</strong></p><Label htmlFor="template-apply-reason">Audit reason</Label><Textarea id="template-apply-reason" rows={3} maxLength={500} value={templateReason} onChange={(event) => setTemplateReason(event.target.value)} placeholder="Required audit reason" />
            </TenantActionDialog>
            <StorefrontCustomDomainsModal open={domainsOpen} tenant={tenant} onClose={() => setDomainsOpen(false)} />
        </section>
    );
}

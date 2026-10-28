import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useOutletContext } from 'react-router-dom';
import { toast } from 'sonner';
import { normalizeApiError } from '../../../packages/web-core/src/utils/errorHandler.js';
import * as adminService from '@/services/adminService';
import TenantActionDialog from '../src/features/admin/tenantDetail/TenantActionDialog.jsx';
import {
    COMPLIANCE_AUDIT_FILTERS,
    COMPLIANCE_REVIEW_FILTERS,
    complianceProgressBadgeClass,
    countComplianceAuditCategories,
    countComplianceReviewStatuses,
    filterComplianceAuditLogs,
    filterComplianceRecords,
    getComplianceSectionProgress,
    normalizeVerificationStatus,
    summarizeSecurityIncidents
} from '../src/features/admin/tenantDetail/compliancePresentation.js';

const statusName = (value) => String(value || 'unknown').replace(/_/g, ' ');
const statusClass = (value) => {
    const status = String(value || '').toLowerCase();
    if (status === 'verified' || status === 'resolved') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    if (status === 'rejected' || status === 'revoked' || status === 'open') return 'border-rose-200 bg-rose-50 text-rose-700';
    if (status === 'acknowledged') return 'border-sky-200 bg-sky-50 text-sky-700';
    return 'border-amber-200 bg-amber-50 text-amber-800';
};

export default function TenantCompliance() {
    const { tenant, refreshTenant, isArchived } = useOutletContext();
    const [artifacts, setArtifacts] = useState([]);
    const [peripherals, setPeripherals] = useState([]);
    const [checklist, setChecklist] = useState(null);
    const [auditLogs, setAuditLogs] = useState([]);
    const [incidents, setIncidents] = useState([]);
    const [panelStates, setPanelStates] = useState({});
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [actionKey, setActionKey] = useState('');
    const [note, setNote] = useState('');
    const [evidenceRef, setEvidenceRef] = useState('');
    const [auditFilter, setAuditFilter] = useState('all');
    const [reviewFilter, setReviewFilter] = useState('needs_review');
    const [modeOpen, setModeOpen] = useState(false);
    const [modeChoice, setModeChoice] = useState('non_compliant');
    const [modeReason, setModeReason] = useState('');
    const [modeError, setModeError] = useState('');
    const [modeSaving, setModeSaving] = useState(false);

    const load = useCallback(async (quiet = false) => {
        if (quiet) setRefreshing(true); else setLoading(true);
        const results = await Promise.allSettled([
            adminService.listTenantComplianceArtifacts(tenant.id),
            adminService.listTenantCompliancePeripherals(tenant.id),
            adminService.getTenantComplianceChecklist(tenant.id),
            adminService.listTenantComplianceAuditLogs(tenant.id, { limit: 120 }),
            adminService.listTenantComplianceSecurityIncidents(tenant.id, { limit: 200 })
        ]);
        const [artifactResult, peripheralResult, checklistResult, auditResult, incidentsResult] = results;
        setArtifacts(artifactResult.status === 'fulfilled' ? (artifactResult.value?.data?.artifacts || []) : []);
        setPeripherals(peripheralResult.status === 'fulfilled' ? (peripheralResult.value?.data?.peripherals || []) : []);
        setChecklist(checklistResult.status === 'fulfilled' ? (checklistResult.value?.data || null) : null);
        setAuditLogs(auditResult.status === 'fulfilled' ? (auditResult.value?.data?.logs || []) : []);
        setIncidents(incidentsResult.status === 'fulfilled' ? (incidentsResult.value?.data?.incidents || []) : []);
        setPanelStates({
            artifacts: artifactResult.status === 'rejected' ? normalizeApiError(artifactResult.reason).message : '',
            peripherals: peripheralResult.status === 'rejected' ? normalizeApiError(peripheralResult.reason).message : '',
            checklist: checklistResult.status === 'rejected' ? normalizeApiError(checklistResult.reason).message : '',
            audit: auditResult.status === 'rejected' ? normalizeApiError(auditResult.reason).message : '',
            incidents: incidentsResult.status === 'rejected' ? normalizeApiError(incidentsResult.reason).message : ''
        });
        setLoading(false);
        setRefreshing(false);
    }, [tenant.id]);

    useEffect(() => { void load(); }, [load]);

    const modeAction = tenant.admin_compliance_mode_action || {};
    const modeOptions = Array.isArray(modeAction.options) ? modeAction.options : [];
    const modeAllowed = modeAction.allowed === true && ['select_mode', 'upgrade_to_compliant_pending', 'force_non_compliant'].includes(modeAction.action);

    const verify = async (kind, item, action) => {
        const id = kind === 'artifact' ? item.tenant_compliance_artifact_id : item.tenant_compliance_peripheral_id;
        if (!id || isArchived) return;
        const key = `${kind}:${id}:${action}`;
        setActionKey(key);
        try {
            const payload = { action, verification_note: note.trim() || null, verification_evidence_ref: evidenceRef.trim() || null };
            if (kind === 'artifact') await adminService.updateTenantComplianceArtifactVerification(tenant.id, id, payload);
            else await adminService.updateTenantCompliancePeripheralVerification(tenant.id, id, payload);
            await load(true);
            toast.success(`${kind === 'artifact' ? 'Artifact' : 'Peripheral'} ${action} recorded.`);
        } catch (requestError) {
            toast.error(normalizeApiError(requestError).message || `Could not ${action} ${kind}.`);
        } finally {
            setActionKey('');
        }
    };

    const updateIncident = async (incident, action) => {
        const id = incident.incident_id || incident.tenant_compliance_security_incident_id || incident.id;
        if (!id || isArchived) return;
        const key = `incident:${id}:${action}`;
        setActionKey(key);
        try {
            const payload = { note: note.trim() || null, evidence_ref: evidenceRef.trim() || null };
            if (action === 'acknowledge') await adminService.acknowledgeTenantComplianceSecurityIncident(tenant.id, id, payload);
            else await adminService.resolveTenantComplianceSecurityIncident(tenant.id, id, payload);
            await load(true);
            toast.success(`Security incident ${action}d.`);
        } catch (requestError) {
            toast.error(normalizeApiError(requestError).message || `Could not ${action} the incident.`);
        } finally {
            setActionKey('');
        }
    };

    const submitMode = async () => {
        const reason = modeReason.trim();
        if (!modeAllowed || reason.length < 3 || isArchived) return;
        setModeSaving(true);
        setModeError('');
        try {
            const payload = { reason, context: { source: 'tenant_compliance_section' } };
            if (modeAction.action === 'select_mode') await adminService.selectTenantComplianceMode(tenant.id, { ...payload, mode_choice: modeChoice });
            if (modeAction.action === 'upgrade_to_compliant_pending') await adminService.upgradeTenantComplianceMode(tenant.id, payload);
            if (modeAction.action === 'force_non_compliant') await adminService.forceTenantNonCompliant(tenant.id, payload);
            setModeOpen(false);
            setModeReason('');
            await Promise.all([refreshTenant(tenant.id), load(true)]);
            toast.success('Compliance mode updated.');
        } catch (requestError) {
            setModeError(normalizeApiError(requestError).message || 'Compliance mode update failed.');
        } finally {
            setModeSaving(false);
        }
    };

    const reviewCounts = useMemo(() => countComplianceReviewStatuses(artifacts, peripherals), [artifacts, peripherals]);
    const sectionProgress = useMemo(() => getComplianceSectionProgress(checklist?.section_progress), [checklist]);
    const incidentSummary = useMemo(() => summarizeSecurityIncidents(incidents), [incidents]);
    const auditCounts = useMemo(() => countComplianceAuditCategories(auditLogs), [auditLogs]);
    const filteredAudit = useMemo(() => filterComplianceAuditLogs(auditLogs, auditFilter), [auditFilter, auditLogs]);

    const renderReviewRows = (kind, rows) => rows.length ? <div className="space-y-3">{rows.map((item, index) => {
        const id = kind === 'artifact' ? item.tenant_compliance_artifact_id : item.tenant_compliance_peripheral_id;
        const status = normalizeVerificationStatus(item.verification_status);
        const label = kind === 'artifact' ? item.artifact_name || item.artifact_type || 'Compliance artifact' : `${item.brand || ''} ${item.model || ''}`.trim() || item.device_class || 'Peripheral';
        return <div key={id || `${kind}-${index}`} className="rounded-lg border border-slate-200 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2"><div><h4 className="font-medium text-slate-900">{label}</h4><p className="mt-1 text-xs text-slate-600">{kind === 'artifact' ? `Type: ${item.artifact_type || 'unknown'} · Record: ${statusName(item.status)}` : `Serial: ${item.serial_number || 'not reported'} · Terminal: ${item.terminal_id || 'shared/unbound'} · Shared: ${item.is_shared ? 'yes' : 'no'}`}</p>{item.verified_at ? <p className="mt-1 text-xs text-slate-500">Verified at: {new Date(item.verified_at).toLocaleString()}</p> : null}</div><span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusClass(status)}`}>{statusName(status)}</span></div>
            {item.description ? <p className="mt-2 text-sm text-slate-600">{item.description}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2">{['verify', 'reject', 'revoke'].map((action) => {
                const key = `${kind}:${id}:${action}`;
                return <Button key={action} type="button" size="sm" variant="outline" disabled={isArchived || !id || Boolean(actionKey)} onClick={() => void verify(kind, item, action)}>{actionKey === key ? 'Saving…' : action}</Button>;
            })}</div>
        </div>;
    })}</div> : <p className="rounded-lg border border-dashed border-slate-300 p-5 text-sm text-slate-600">No {kind === 'artifact' ? 'artifacts' : 'peripherals'} are available.</p>;

    return (
        <section className="space-y-5" aria-labelledby="tenant-compliance-title">
            <header className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div><h2 id="tenant-compliance-title" className="text-xl font-semibold text-slate-900">Compliance</h2><p className="mt-1 text-sm text-slate-600">Mode decisions, evidence verification, security incidents, and compliance audit history.</p></div>
                <Button type="button" variant="outline" onClick={() => void load(true)} disabled={refreshing || loading}><RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />Refresh</Button>
            </header>
            {isArchived ? <p className="rounded-lg bg-slate-100 p-3 text-sm text-slate-600">Archived compliance records are read-only.</p> : null}
            <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-slate-900">Compliance mode</h3><p className="mt-1 text-sm text-slate-600">Current: {statusName(tenant.compliance_mode_state || (tenant.compliance_mode_choice_required ? 'selection required' : 'not selected'))}</p><p className="mt-1 text-xs text-slate-500">{modeAction.helper_text || 'The server determines which compliance mode action is currently eligible.'}</p></div><Button type="button" onClick={() => { setModeChoice(modeOptions.includes('non_compliant') ? 'non_compliant' : 'compliant'); setModeOpen(true); }} disabled={!modeAllowed || isArchived}>{modeAction.label || 'Compliance mode action'}</Button></div>
            </article>
            <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="font-semibold text-slate-900">Verification context</h3><p className="mt-1 text-sm text-slate-600">Notes and evidence references are sent with artifact, peripheral, and incident actions.</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-sm"><span className="font-medium text-slate-700">Verification note</span><Textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} /></label><label className="space-y-1 text-sm"><span className="font-medium text-slate-700">Evidence reference</span><Textarea rows={3} value={evidenceRef} onChange={(event) => setEvidenceRef(event.target.value)} maxLength={500} /></label></div></article>
            {loading ? <p role="status" className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600"><RefreshCw className="h-4 w-4 animate-spin" />Loading compliance panels…</p> : (
                <>
                    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                        <h3 className="font-semibold text-slate-900">Checklist</h3>
                        {panelStates.checklist ? <p role="alert" className="mt-2 text-sm text-red-700">{panelStates.checklist}</p> : checklist ? (
                            <>
                                <p className="mt-2 text-sm text-slate-700">Activation readiness: <strong>{checklist.ready_for_compliant_activation ? 'Ready' : 'Blocked'}</strong></p>
                                {checklist.activation_blockers?.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-800">{checklist.activation_blockers.map((blocker, index) => <li key={blocker.code || blocker.message || index}>{blocker.message || blocker.label || String(blocker)}</li>)}</ul> : null}
                                {sectionProgress.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{sectionProgress.map((entry) => <div key={entry.key} className="rounded-lg border border-slate-200 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm text-slate-800">{entry.label}</strong><span className={`rounded-full border px-2 py-0.5 text-xs ${complianceProgressBadgeClass(entry.status)}`}>{statusName(entry.status)}</span></div><p className="mt-1 text-xs text-slate-600">{entry.complete} of {entry.total} complete</p></div>)}</div> : <p className="mt-3 text-sm text-slate-600">No section progress is available.</p>}
                            </>
                        ) : <p className="mt-2 text-sm text-slate-600">No checklist data is available.</p>}
                    </article>
                    <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2"><label className="text-sm font-medium text-slate-700" htmlFor="compliance-review-filter">Review filter</label><select id="compliance-review-filter" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" value={reviewFilter} onChange={(event) => setReviewFilter(event.target.value)}>{COMPLIANCE_REVIEW_FILTERS.map((entry) => <option key={entry.value} value={entry.value}>{entry.label} ({reviewCounts[entry.value] || 0})</option>)}</select><span className="text-xs text-slate-500">Review queue: {reviewCounts.needs_review} pending decision</span></div>
                        <div className="grid gap-4 lg:grid-cols-2"><article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="mb-3 font-semibold text-slate-900">Artifacts</h3>{panelStates.artifacts ? <p role="alert" className="mb-3 text-sm text-red-700">{panelStates.artifacts}</p> : null}{renderReviewRows('artifact', filterComplianceRecords(artifacts, reviewFilter))}</article><article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="mb-3 font-semibold text-slate-900">Peripherals</h3>{panelStates.peripherals ? <p role="alert" className="mb-3 text-sm text-red-700">{panelStates.peripherals}</p> : null}{renderReviewRows('peripheral', filterComplianceRecords(peripherals, reviewFilter))}</article></div>
                    </div>
                    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="font-semibold text-slate-900">Security incidents</h3><p className="mt-1 text-xs text-slate-600">Open: {incidentSummary.open} | Acknowledged: {incidentSummary.acknowledged} | Resolved: {incidentSummary.resolved}</p>{panelStates.incidents ? <p role="alert" className="mt-2 text-sm text-red-700">{panelStates.incidents}</p> : null}<div className="mt-3 space-y-3">{incidents.map((incident, index) => { const id = incident.incident_id || incident.tenant_compliance_security_incident_id || incident.id; const status = String(incident.status || incident.incident_status || 'new').toLowerCase(); const canAcknowledge = status === 'new'; const canResolve = status !== 'resolved'; return <div key={id || index} className="rounded-lg border border-slate-200 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm text-slate-900">{incident.signal_code || incident.title || 'Security incident'}</strong><span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusClass(status)}`}>{statusName(status)}</span></div><p className="mt-1 text-xs text-slate-600">Severity: {incident.severity || 'warning'} · Updated {incident.updated_at ? new Date(incident.updated_at).toLocaleString() : 'unknown'}</p>{incident.dispatch ? <p className="mt-1 text-xs text-slate-600">Dispatch: {incident.dispatch.delivery_status || 'recorded'}{incident.dispatch.channel ? ` via ${incident.dispatch.channel}` : ''}{incident.dispatch.attempted_at ? ` at ${new Date(incident.dispatch.attempted_at).toLocaleString()}` : ''}</p> : null}{incident.dispatch?.target_configured === false ? <p className="mt-1 text-xs text-amber-700">Dispatch target is not configured for this channel.</p> : null}{incident.dispatch?.dispatch_reference ? <p className="mt-1 break-all text-xs text-slate-500">Dispatch reference: {incident.dispatch.dispatch_reference}</p> : null}{incident.dispatch?.error ? <p className="mt-1 text-xs text-rose-600">Dispatch error: {incident.dispatch.error}</p> : null}{incident.latest_note ? <p className="mt-2 text-sm text-slate-600">{incident.latest_note}</p> : null}<div className="mt-3 flex gap-2"><Button type="button" size="sm" variant="outline" disabled={isArchived || !canAcknowledge || Boolean(actionKey)} onClick={() => void updateIncident(incident, 'acknowledge')}>Acknowledge</Button><Button type="button" size="sm" disabled={isArchived || !canResolve || Boolean(actionKey)} onClick={() => void updateIncident(incident, 'resolve')}>Resolve</Button></div></div>; })}{!incidents.length && !panelStates.incidents ? <p className="text-sm text-slate-600">No security incidents are available.</p> : null}</div></article>
                    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold text-slate-900">Compliance audit history</h3><select aria-label="Filter compliance audit history" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" value={auditFilter} onChange={(event) => setAuditFilter(event.target.value)}>{COMPLIANCE_AUDIT_FILTERS.map((entry) => <option key={entry.value} value={entry.value}>{entry.label} ({auditCounts[entry.value] || 0})</option>)}</select></div>{panelStates.audit ? <p role="alert" className="mt-2 text-sm text-red-700">{panelStates.audit}</p> : null}<div className="mt-3 space-y-2">{filteredAudit.map((entry, index) => <div key={entry.tenant_compliance_audit_log_id || `${entry.event_type}-${index}`} className="rounded-md border border-slate-100 bg-slate-50 p-3"><div className="flex flex-wrap justify-between gap-2"><strong className="text-sm capitalize text-slate-900">{statusName(entry.event_type)}</strong><span className="text-xs text-slate-500">{entry.created_at ? new Date(entry.created_at).toLocaleString() : 'No timestamp'}</span></div><p className="mt-1 text-xs text-slate-600">Decision: {entry.decision || 'N/A'} · Reason: {entry.reason_code || 'N/A'}</p>{entry.metadata ? <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-slate-500">{JSON.stringify(entry.metadata, null, 2)}</pre> : null}</div>)}{!filteredAudit.length && !panelStates.audit ? <p className="text-sm text-slate-600">No events match this filter.</p> : null}</div></article>
                </>
            )}
            <TenantActionDialog open={modeOpen} onOpenChange={(open) => { if (!modeSaving) { setModeOpen(open); setModeError(''); } }} title="Update compliance mode" description="The existing server eligibility and audit policy will decide whether this transition is accepted." submitLabel={modeAction.label || 'Update mode'} onSubmit={submitMode} submitting={modeSaving} submitDisabled={modeReason.trim().length < 3 || isArchived}>
                {modeError ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{modeError}</p> : null}
                {modeAction.action === 'select_mode' ? <div className="grid gap-2 sm:grid-cols-2">{modeOptions.includes('non_compliant') ? <Button type="button" variant={modeChoice === 'non_compliant' ? 'default' : 'outline'} onClick={() => setModeChoice('non_compliant')}>Non-compliant</Button> : null}{modeOptions.includes('compliant') ? <Button type="button" variant={modeChoice === 'compliant' ? 'default' : 'outline'} onClick={() => setModeChoice('compliant')}>Compliant pending</Button> : null}</div> : null}
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><ShieldCheck className="mr-2 inline h-4 w-4" />{modeAction.helper_text || 'Mode transition effects depend on the server eligibility result.'}</div>
                <Label htmlFor="tenant-compliance-mode-reason">Reason (required)</Label><Textarea id="tenant-compliance-mode-reason" value={modeReason} onChange={(event) => setModeReason(event.target.value)} rows={3} minLength={3} maxLength={255} />
            </TenantActionDialog>
        </section>
    );
}

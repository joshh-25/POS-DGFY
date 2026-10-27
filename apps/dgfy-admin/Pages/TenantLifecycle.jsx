import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle, Clock, RefreshCw, RotateCcw, ShieldAlert, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { toast } from 'sonner';
import { normalizeApiError } from '../../../packages/web-core/src/utils/errorHandler.js';
import * as adminService from '@/services/adminService';
import TenantActionDialog from '../src/features/admin/tenantDetail/TenantActionDialog.jsx';

const getTenantRegistrationAction = (tenant) => {
    if (tenant?.registration_action && typeof tenant.registration_action === 'object') {
        return {
            action: tenant.registration_action.allowed === true
                ? (tenant.registration_action.action || 'reconcile')
                : (tenant.registration_action.action === 'setting_up' ? 'setting_up' : 'reconcile'),
            helperText: tenant.registration_action.helper_text || 'Registration state does not allow this action.'
        };
    }
    if (tenant?.status !== 'pending') return null;
    const application = tenant.registrationApplication;
    if (application?.review_status === 'pending' && application?.provisioning_status === 'not_started') {
        return { action: 'approve', helperText: 'Approve the pending public registration.' };
    }
    if (application?.review_status === 'approved' && application?.provisioning_status === 'failed') {
        return { action: 'retry', helperText: 'Retry the failed tenant setup.' };
    }
    if (application?.review_status === 'approved' && application?.provisioning_status === 'in_progress') {
        return { action: 'setting_up', helperText: 'Company setup is already in progress.' };
    }
    return { action: 'reconcile', helperText: 'No pending public registration is available for approval.' };
};

const ACTIONS = {
    approve: {
        title: 'Approve tenant registration?',
        description: 'Approval starts provisioning in the background. Invoice creation remains a separate action.'
    },
    retry: {
        title: 'Retry tenant setup?',
        description: 'The system will reuse the existing registration and avoid duplicate memberships. Provisioning runs in the background.'
    },
    reject: {
        title: 'Reject tenant registration?',
        description: 'The reason is required and will be visible to the applicant.'
    },
    reactivate: {
        title: 'Reactivate tenant?',
        description: 'This restores tenant access for 30 days.'
    },
    status: {
        title: 'Edit tenant status',
        description: 'This updates the tenant status through the existing admin endpoint.'
    },
    delete: {
        title: 'Permanently delete tenant?',
        description: 'This is irreversible. Registration history and outstanding platform invoices can block deletion.'
    }
};

export default function TenantLifecycle() {
    const { tenant, refreshTenant, isArchived, directoryTarget, adminProfile } = useOutletContext();
    const navigate = useNavigate();
    const [dialogAction, setDialogAction] = useState('');
    const [reason, setReason] = useState('');
    const [nextStatus, setNextStatus] = useState(tenant.status);
    const [confirmName, setConfirmName] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [actionError, setActionError] = useState('');
    const [notice, setNotice] = useState('');
    const pollInFlightRef = useRef(false);
    const pollGenerationRef = useRef(0);
    const registrationAction = useMemo(() => getTenantRegistrationAction(tenant), [tenant]);
    const provisioningStatus = tenant.registrationApplication?.provisioning_status;
    const isProvisioning = provisioningStatus === 'in_progress';
    const hasInvoiceGrant = Boolean(adminProfile?.is_master || adminProfile?.permissions?.includes('admin.invoices'));

    useEffect(() => {
        setDialogAction('');
        setReason('');
        setNextStatus(tenant.status);
        setConfirmName('');
        setActionError('');
        setNotice('');
    }, [tenant.id, tenant.status]);

    useEffect(() => {
        const generation = pollGenerationRef.current + 1;
        pollGenerationRef.current = generation;
        if (isArchived || !isProvisioning) return () => { pollGenerationRef.current += 1; };

        const interval = window.setInterval(async () => {
            if (pollInFlightRef.current || pollGenerationRef.current !== generation) return;
            pollInFlightRef.current = true;
            try {
                await refreshTenant(tenant.id, { silent: true });
            } finally {
                pollInFlightRef.current = false;
            }
        }, 3000);
        return () => {
            pollGenerationRef.current += 1;
            window.clearInterval(interval);
        };
    }, [isArchived, isProvisioning, refreshTenant, tenant.id]);

    const openAction = (action) => {
        setDialogAction(action);
        setReason('');
        setNextStatus(tenant.status);
        setConfirmName('');
        setActionError('');
        setNotice('');
    };

    const closeAction = (open) => {
        if (!open && !submitting) {
            setDialogAction('');
            setActionError('');
        }
    };

    const runAction = async () => {
        if (isArchived || !dialogAction) return;
        const normalizedReason = reason.trim();
        if (dialogAction === 'reject' && normalizedReason.length < 3) {
            setActionError('Enter an applicant-visible rejection reason of at least 3 characters.');
            return;
        }
        if (dialogAction === 'delete' && confirmName !== tenant.name) return;

        setSubmitting(true);
        setActionError('');
        try {
            if (dialogAction === 'approve') await adminService.approveTenant(tenant.id);
            if (dialogAction === 'retry') await adminService.retryTenantProvisioning(tenant.id);
            if (dialogAction === 'reject') await adminService.rejectTenant(tenant.id, normalizedReason);
            if (dialogAction === 'reactivate') await adminService.adminReactivateTenant(tenant.id);
            if (dialogAction === 'status') await adminService.updateTenant(tenant.id, { status: nextStatus });
            if (dialogAction === 'delete') {
                await adminService.deleteTenant(tenant.id);
                setDialogAction('');
                toast.success('Tenant permanently deleted.');
                navigate(directoryTarget, { replace: true });
                return;
            }

            const completedAction = dialogAction;
            setDialogAction('');
            setReason('');
            setActionError('');
            if (completedAction === 'approve' || completedAction === 'retry') {
                setNotice(completedAction === 'approve'
                    ? 'Approval accepted. Tenant provisioning is running in the background.'
                    : 'Retry accepted. Tenant provisioning is running in the background.');
            }
            const refreshed = await refreshTenant(tenant.id);
            if (!refreshed) toast.error('The action succeeded, but tenant details could not be refreshed. Retry the detail read.');
            else toast.success({
                approve: 'Approval accepted.',
                retry: 'Provisioning retry accepted.',
                reject: 'Tenant rejected successfully.',
                reactivate: `${tenant.name} reactivated successfully.`,
                status: 'Tenant status updated.'
            }[completedAction]);
        } catch (error) {
            const normalized = normalizeApiError(error);
            setActionError(normalized.message || 'The tenant action failed.');
        } finally {
            setSubmitting(false);
        }
    };

    const canApprove = registrationAction?.action === 'approve';
    const canRetry = registrationAction?.action === 'retry';

    return (
        <section className="space-y-5" aria-labelledby="tenant-lifecycle-title">
            <header className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 id="tenant-lifecycle-title" className="text-xl font-semibold text-slate-900">Lifecycle</h2>
                <p className="mt-1 text-sm text-slate-600">Registration approval, tenant status, provisioning, and deletion controls.</p>
            </header>

            {notice ? (
                <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                    <span>{notice}</span>
                    {hasInvoiceGrant && (tenant.registrationApplication?.id || tenant.registration_application_id) ? (
                        <Link
                            className="font-semibold underline"
                            to={`/admin/invoices?tenant_id=${encodeURIComponent(tenant.id)}&registration_application_id=${encodeURIComponent(tenant.registrationApplication?.id || tenant.registration_application_id)}`}
                        >
                            Open invoices
                        </Link>
                    ) : null}
                </div>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-2">
                <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h3 className="font-semibold text-slate-900">Registration and provisioning</h3>
                    <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div><dt className="text-xs uppercase tracking-wide text-slate-500">Review status</dt><dd className="mt-1 font-medium text-slate-900">{tenant.registrationApplication?.review_status || 'No registration application'}</dd></div>
                        <div><dt className="text-xs uppercase tracking-wide text-slate-500">Provisioning</dt><dd className="mt-1 font-medium text-slate-900">{provisioningStatus || 'Not available'}</dd></div>
                        <div><dt className="text-xs uppercase tracking-wide text-slate-500">Tenant status</dt><dd className="mt-1 font-medium text-slate-900">{tenant.status}</dd></div>
                        <div><dt className="text-xs uppercase tracking-wide text-slate-500">Registration action</dt><dd className="mt-1 font-medium text-slate-900">{registrationAction?.helperText || 'No registration action is available.'}</dd></div>
                    </dl>
                    {isProvisioning ? (
                        <p role="status" className="mt-4 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                            <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" /> Provisioning is in progress. This section refreshes every three seconds.
                        </p>
                    ) : provisioningStatus === 'failed' ? (
                        <p className="mt-4 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                            <AlertCircle className="h-4 w-4" aria-hidden="true" /> Provisioning failed. Retry is available when the server allows it.
                        </p>
                    ) : null}
                    <div className="mt-4 flex flex-wrap gap-2">
                        {canApprove ? <Button type="button" onClick={() => openAction('approve')} disabled={isArchived || submitting}><CheckCircle className="mr-2 h-4 w-4" />Approve</Button> : null}
                        {canRetry ? <Button type="button" variant="outline" onClick={() => openAction('retry')} disabled={isArchived || submitting}><RotateCcw className="mr-2 h-4 w-4" />Retry setup</Button> : null}
                        {tenant.status === 'pending' ? <Button type="button" variant="outline" onClick={() => openAction('reject')} disabled={isArchived || submitting}>Reject</Button> : null}
                        {tenant.status === 'inactive' ? <Button type="button" variant="outline" onClick={() => openAction('reactivate')} disabled={isArchived || submitting}>Reactivate</Button> : null}
                        {!canApprove && !canRetry && tenant.status === 'pending' && registrationAction?.action === 'setting_up' ? (
                            <span className="inline-flex items-center gap-2 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800"><Clock className="h-4 w-4" />Setup is in progress</span>
                        ) : null}
                    </div>
                </article>

                <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h3 className="font-semibold text-slate-900">Tenant status</h3>
                    <p className="mt-1 text-sm text-slate-600">Change the existing tenant status without adding a new reason or policy.</p>
                    <Button type="button" className="mt-4" variant="outline" onClick={() => openAction('status')} disabled={isArchived || submitting}>Edit status</Button>
                </article>
            </div>

            <article className="rounded-xl border border-red-200 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-3">
                    <ShieldAlert className="mt-0.5 h-5 w-5 text-red-700" aria-hidden="true" />
                    <div>
                        <h3 className="font-semibold text-red-900">Danger zone</h3>
                        <p className="mt-1 text-sm text-slate-600">Deleting is permanent. Registration history and outstanding platform invoices remain protected by the existing server checks.</p>
                    </div>
                </div>
                <Button type="button" variant="destructive" className="mt-4" onClick={() => openAction('delete')} disabled={isArchived || submitting}>
                    <Trash2 className="mr-2 h-4 w-4" />Delete tenant
                </Button>
            </article>

            <TenantActionDialog
                open={Boolean(dialogAction)}
                onOpenChange={closeAction}
                title={ACTIONS[dialogAction]?.title}
                description={ACTIONS[dialogAction]?.description}
                submitLabel={{ approve: 'Approve registration', retry: 'Retry setup', reject: 'Reject tenant', reactivate: 'Reactivate', status: 'Save status', delete: 'Permanently delete' }[dialogAction]}
                onSubmit={runAction}
                submitting={submitting}
                submitDisabled={
                    (dialogAction === 'reject' && reason.trim().length < 3)
                    || (dialogAction === 'delete' && confirmName !== tenant.name)
                }
                destructive={dialogAction === 'delete'}
            >
                {actionError ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{actionError}</p> : null}
                {dialogAction === 'reject' ? (
                    <label className="block space-y-1.5 text-sm font-medium text-slate-700">
                        <span>Reason shown to the applicant</span>
                        <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={4} minLength={3} required className="w-full rounded-md border border-slate-300 px-3 py-2" autoFocus />
                        <span className="text-xs text-slate-500">At least 3 characters.</span>
                    </label>
                ) : null}
                {dialogAction === 'status' ? (
                    <div className="space-y-2">
                        <Label htmlFor="tenant-status">Status</Label>
                        <select id="tenant-status" className="w-full rounded-md border border-slate-300 px-3 py-2" value={nextStatus} onChange={(event) => setNextStatus(event.target.value)}>
                            <option value="pending">Pending</option><option value="active">Active</option><option value="inactive">Inactive (Soft Delete)</option><option value="rejected">Rejected</option>
                        </select>
                        <p className="text-xs text-slate-500">Inactive prevents login while retaining tenant data.</p>
                    </div>
                ) : null}
                {dialogAction === 'delete' ? (
                    <div className="space-y-3">
                        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">This permanently removes the tenant record and drops its database. No force option is offered here.</div>
                        <Label htmlFor="tenant-delete-confirm">Type <strong>{tenant.name}</strong> to confirm</Label>
                        <Input id="tenant-delete-confirm" value={confirmName} onChange={(event) => setConfirmName(event.target.value)} autoComplete="off" autoFocus />
                    </div>
                ) : null}
                {dialogAction === 'approve' || dialogAction === 'retry' || dialogAction === 'reactivate' ? (
                    <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Tenant: <strong>{tenant.name}</strong></p>
                ) : null}
            </TenantActionDialog>
        </section>
    );
}

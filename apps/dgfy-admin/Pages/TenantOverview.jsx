import React, { useEffect, useId, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { RefreshCw, UserRoundCog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import * as adminService from '@/services/adminService';

const COMPLIANCE_LABELS = {
    non_compliant_active: 'Non-compliant active',
    compliant_pending: 'Compliant pending',
    compliant_active: 'Compliant active'
};
const OWNERSHIP_LABELS = { unassigned: 'Unassigned', claimed: 'Claimed', handover_pending: 'Handover pending' };
const accountName = (account = {}) => [account.first_name, account.middle_name, account.last_name].filter(Boolean).join(' ').trim()
    || account.username || account.email || account.id;
const DetailItem = ({ label, value }) => (
    <div className="min-w-0 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
        <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
        <dd className="mt-1 break-words text-sm font-medium text-slate-900">{value || 'Not available'}</dd>
    </div>
);

function OwnerAssignment({ tenant, refreshTenant, adminProfile, isArchived }) {
    const dialogTitleId = useId();
    const canManageOwner = adminProfile?.is_master || (
        adminProfile?.permissions?.includes('admin.tenants') && adminProfile?.permissions?.includes('admin.dgfy_accounts')
    );
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [accountId, setAccountId] = useState('');
    const [reason, setReason] = useState('');
    const [forceConfirmed, setForceConfirmed] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let cancelled = false;
        if (!canManageOwner || isArchived || tenant.status !== 'active') return undefined;
        setLoading(true);
        setError('');
        adminService.listDgfyAccounts({ status: 'active', page: 1, limit: 100 })
            .then((response) => {
                if (cancelled) return;
                const rows = response?.data?.accounts || [];
                setAccounts(rows.filter((account) => [true, 1, '1'].includes(account?.is_active) && account?.lifecycle_status !== 'deleted' && !account?.deleted_at));
            })
            .catch((requestError) => {
                if (!cancelled) setError(requestError?.response?.data?.message || requestError.message || 'Active DGFY accounts could not be loaded.');
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [canManageOwner, isArchived, tenant.id, tenant.status]);

    const targetAccount = useMemo(() => accounts.find((account) => String(account.id) === accountId), [accounts, accountId]);
    if (!canManageOwner) {
        return <p className="text-sm text-slate-600">Owner assignment requires both Tenant Management and DGFY Accounts access.</p>;
    }
    if (tenant.status !== 'active') {
        return <p className="text-sm text-slate-600">Owner assignment is available for active tenants only.</p>;
    }

    const submit = async () => {
        if (isArchived || !targetAccount || reason.trim().length < 3 || !forceConfirmed) return;
        setSaving(true);
        setError('');
        try {
            await adminService.assignTenantOwner(tenant.id, {
                dgfy_account_id: targetAccount.id,
                reason: reason.trim(),
                force: true
            });
            setConfirmOpen(false);
            setReason('');
            setForceConfirmed(false);
            setAccountId('');
            const refreshed = await refreshTenant(tenant.id);
            if (!refreshed) setError('Owner assignment was accepted, but the tenant read-back failed. Retry the tenant detail request.');
        } catch (requestError) {
            setError(requestError?.response?.data?.message || requestError.message || 'Owner assignment failed.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <div className="space-y-4">
                {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
                <p className="text-sm text-slate-600">Choose an existing active DGFY account. Assignment updates company membership and records the existing audit event.</p>
                {loading ? <p role="status" className="flex items-center gap-2 text-sm text-slate-600"><RefreshCw className="h-4 w-4 animate-spin" />Loading active accounts…</p> : (
                    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                        <label className="space-y-1.5 text-sm font-medium text-slate-700">
                            <span>Active DGFY account</span>
                            <select className="h-10 w-full rounded-md border border-slate-300 bg-white px-3" value={accountId} onChange={(event) => setAccountId(event.target.value)} disabled={isArchived || saving}>
                                <option value="">Select account…</option>
                                {accounts.map((account) => <option key={account.id} value={account.id}>{accountName(account)} · {account.email || account.id}</option>)}
                            </select>
                        </label>
                        <label className="space-y-1.5 text-sm font-medium text-slate-700">
                            <span>Audit reason</span>
                            <Input value={reason} onChange={(event) => setReason(event.target.value)} minLength={3} maxLength={500} disabled={isArchived || saving} placeholder="Why is ownership changing?" />
                        </label>
                    </div>
                )}
                <label className="flex items-start gap-2 text-sm text-slate-700">
                    <input type="checkbox" className="mt-1" checked={forceConfirmed} onChange={(event) => setForceConfirmed(event.target.checked)} disabled={isArchived || saving} />
                    <span>I understand this explicitly force-assigns the selected account as company owner.</span>
                </label>
                <Button type="button" onClick={() => setConfirmOpen(true)} disabled={isArchived || loading || !targetAccount || reason.trim().length < 3 || !forceConfirmed || saving}>
                    <UserRoundCog className="mr-2 h-4 w-4" />Review owner assignment
                </Button>
            </div>
            <Dialog open={confirmOpen} onOpenChange={(open) => { if (!saving) setConfirmOpen(open); }}>
                <DialogContent aria-labelledby={dialogTitleId}>
                    <DialogHeader>
                        <DialogTitle id={dialogTitleId}>Confirm company owner assignment</DialogTitle>
                        <DialogDescription>The selected account will become the active owner. The endpoint uses a force assignment and does not provide a non-force replacement safeguard.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 px-6 py-4 text-sm">
                        <p><strong>Company:</strong> {tenant.name} ({tenant.id})</p>
                        <p><strong>Current owner:</strong> {tenant.owner_dgfy_account_id || 'Unassigned'}</p>
                        <p><strong>Target account:</strong> {targetAccount ? `${accountName(targetAccount)} (${targetAccount.id})` : 'Not selected'}</p>
                        <p><strong>Reason:</strong> {reason.trim()}</p>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)} disabled={saving}>Cancel</Button>
                        <Button type="button" onClick={() => void submit()} disabled={saving}>{saving ? 'Assigning…' : 'Force assign owner'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

export default function TenantOverview() {
    const { tenant, adminProfile, refreshTenant, isArchived, directoryTarget } = useOutletContext();
    const registrationApplicationId = tenant.registrationApplication?.id || tenant.registration_application_id;
    const paymentAllowed = adminProfile?.is_master || adminProfile?.permissions?.includes('admin.payments');
    const invoicesAllowed = adminProfile?.is_master || adminProfile?.permissions?.includes('admin.invoices');
    const revenueAllowed = Boolean(adminProfile?.is_master);

    return (
        <div className="space-y-5">
            <header className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-xl font-semibold text-slate-900">Overview</h2>
                <p className="mt-1 text-sm text-slate-600">Tenant identity, current state, ownership, and related global Admin tools.</p>
            </header>
            <section aria-labelledby="tenant-summary-heading" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <h3 id="tenant-summary-heading" className="text-lg font-semibold text-slate-900">Tenant summary</h3>
                <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <DetailItem label="Tenant ID" value={tenant.id} />
                    <DetailItem label="Admin email" value={tenant.admin_email} />
                    <DetailItem label="Domain" value={tenant.domain} />
                    <DetailItem label="Status" value={tenant.status} />
                    <DetailItem label="Effective plan" value={tenant.effective_plan || tenant.plan} />
                    <DetailItem label="Ownership" value={OWNERSHIP_LABELS[tenant.ownership_status] || tenant.ownership_status} />
                    <DetailItem label="DGFY owner ID" value={tenant.owner_dgfy_account_id} />
                    <DetailItem label="Compliance" value={COMPLIANCE_LABELS[tenant.compliance_mode_state] || (tenant.compliance_mode_choice_required ? 'Selection required' : 'Not selected')} />
                    <DetailItem label="Compliance policy" value={tenant.compliance_policy_version} />
                </dl>
            </section>
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="tenant-owner-heading">
                <h3 id="tenant-owner-heading" className="text-lg font-semibold text-slate-900">Company owner</h3>
                <div className="mt-4"><OwnerAssignment tenant={tenant} refreshTenant={refreshTenant} adminProfile={adminProfile} isArchived={isArchived} /></div>
            </section>
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="tenant-billing-heading">
                <h3 id="tenant-billing-heading" className="text-lg font-semibold text-slate-900">Billing tools</h3>
                <p className="mt-1 text-sm text-slate-600">These links open the existing global tools with this tenant preselected. Opening a tool does not create or change a billing record.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                    {!isArchived && paymentAllowed ? <Link className="inline-flex rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" to={`/admin/payments?tenant_id=${encodeURIComponent(tenant.id)}`}>Payment operations</Link> : null}
                    {!isArchived && invoicesAllowed ? <Link className="inline-flex rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" to={`/admin/invoices?tenant_id=${encodeURIComponent(tenant.id)}${registrationApplicationId ? `&registration_application_id=${encodeURIComponent(registrationApplicationId)}` : ''}`}>Invoices</Link> : null}
                    {!isArchived && revenueAllowed ? <Link className="inline-flex rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" to={{ pathname: '/admin/tenants', search: `?tenant_id=${encodeURIComponent(tenant.id)}`, hash: '#revenue-settlement' }}>Revenue &amp; settlement</Link> : null}
                    {isArchived ? <span className="text-sm text-slate-500">Billing navigation is hidden for archived tenants.</span> : null}
                </div>
            </section>
            <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">Manage tenant capabilities and storefront readiness in the <Link className="font-medium underline" to={{ pathname: `/admin/tenants/${encodeURIComponent(tenant.id)}/access`, search: directoryTarget.search }}>Access &amp; storefront section</Link>. The optional combined Activity page is deferred; audit history remains in each owning section.</p>
        </div>
    );
}
